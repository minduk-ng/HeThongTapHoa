import { useState, useEffect, useCallback, useRef } from 'react';

export interface CheckoutLockInfo {
    employeeName: string;
    userId?: number;
    clientId?: string;
}

interface ServerLock {
    table_id: number;
    user_id: number;
    user_name: string;
    acquired_at: string;
    owner_token: string;
}

function getCsrfTokenFromCookie(): string {
    if (typeof document === 'undefined') {
        return '';
    }

    const name = 'XSRF-TOKEN=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');

    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];

        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }

        if (c.indexOf(name) === 0) {
            return c.substring(name.length, c.length);
        }
    }

    return '';
}

function toLockInfo(lock: ServerLock): CheckoutLockInfo {
    return {
        employeeName: lock.user_name || 'Nhân viên khác',
        userId: lock.user_id,
    };
}

async function postLock(
    path: 'acquire' | 'release' | 'renew',
    tableId: number,
    keepalive = false,
    ownerToken?: string,
): Promise<{ ok: boolean; status: number; lock?: ServerLock }> {
    try {
        const response = await fetch(`/staff/pos/checkout-lock/${path}`, {
            method: 'POST',
            keepalive,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-XSRF-TOKEN': getCsrfTokenFromCookie(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                table_id: tableId,
                owner_token: ownerToken,
            }),
        });
        const data = await response.json().catch(() => ({}));

        return { ok: response.ok, status: response.status, lock: data.lock };
    } catch {
        return { ok: false, status: 0 };
    }
}

// Server-authoritative checkout locks. Lock state comes ONLY from the API +
// `CheckoutLockUpdated` broadcasts — foreign presence whispers are never trusted.
const HEARTBEAT_MS = 30000;

export function usePOSCheckoutLock() {
    const [lockedCheckoutTables, setLockedCheckoutTables] = useState<
        Record<number, CheckoutLockInfo>
    >({});
    const ownLocksRef = useRef<Map<number, string>>(new Map());

    const applyServerLock = useCallback(
        (tableId: number, lock: ServerLock | null) => {
            setLockedCheckoutTables((prev) => {
                if (!lock) {
                    if (!(tableId in prev)) {
                        return prev;
                    }

                    const next = { ...prev };
                    delete next[tableId];

                    return next;
                }

                return { ...prev, [tableId]: toLockInfo(lock) };
            });
        },
        [],
    );

    // Stable broadcast handler — wired into POSManager's existing pos-channel
    // subscription so the shared channel is joined/left in exactly one place.
    const handleLockBroadcast = useCallback(
        (data: {
            table_id: number;
            action: string;
            lock?: ServerLock | null;
        }) => {
            if (!data || typeof data.table_id !== 'number') {
                return;
            }

            if (data.action === 'released') {
                ownLocksRef.current.delete(data.table_id);
                applyServerLock(data.table_id, null);
            } else if (data.action === 'acquired' && data.lock) {
                applyServerLock(data.table_id, data.lock);
            }
        },
        [applyServerLock],
    );

    const fetchStatus = useCallback(async (tableIds: number[]) => {
        const ids = [...new Set(tableIds)];

        if (ids.length === 0) {
            return;
        }

        try {
            const qs = ids.map((id) => `table_ids[]=${id}`).join('&');
            const response = await fetch(
                `/staff/pos/checkout-lock/status?${qs}`,
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                },
            );
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.locks) {
                setLockedCheckoutTables((prev) => {
                    const next = { ...prev };
                    ids.forEach((id) => {
                        const lock = data.locks[id] as
                            ServerLock | null | undefined;

                        if (lock) {
                            next[id] = toLockInfo(lock);
                        } else {
                            delete next[id];
                        }
                    });

                    return next;
                });
            }
        } catch {
            /* bỏ qua — heartbeat/poll lần sau đồng bộ lại */
        }
    }, []);

    const lockTableCheckout = useCallback(
        async (tableId: number, linkedTableIds: number[] = []) => {
            const ids = [...new Set([tableId, ...linkedTableIds])];

            await Promise.all(
                ids.map(async (id) => {
                    const res = await postLock('acquire', id);

                    if (res.ok && res.lock) {
                        ownLocksRef.current.set(id, res.lock.owner_token);
                        applyServerLock(id, res.lock);
                    } else if (res.status === 409 && res.lock) {
                        // Foreign lock — surface the owner so UI blocks with their name.
                        applyServerLock(id, res.lock);
                    }
                }),
            );
        },
        [applyServerLock],
    );

    const unlockTableCheckout = useCallback(
        async (
            tableId: number,
            linkedTableIds: number[] = [],
            keepalive = false,
        ) => {
            const ids = [...new Set([tableId, ...linkedTableIds])];

            await Promise.all(
                ids.map(async (id) => {
                    // Only ever release locks held by this client — never others'.
                    const token = ownLocksRef.current.get(id);

                    if (!token) {
                        return;
                    }

                    ownLocksRef.current.delete(id);
                    await postLock('release', id, keepalive, token);
                    applyServerLock(id, null);
                }),
            );
        },
        [applyServerLock],
    );

    // Heartbeat: renew own locks so they survive past the server TTL while the drawer stays open.
    useEffect(() => {
        const timer = setInterval(() => {
            ownLocksRef.current.forEach(async (token, id) => {
                const res = await postLock('renew', id, false, token);

                if (!res.ok) {
                    ownLocksRef.current.delete(id);
                }
            });
        }, HEARTBEAT_MS);

        return () => clearInterval(timer);
    }, []);

    // Best-effort release when the tab closes. No release on unmount —
    // React remounts (StrictMode) must not drop a live server lock.
    useEffect(() => {
        const handleBeforeUnload = () => {
            ownLocksRef.current.forEach((token, id) => {
                void postLock('release', id, true, token);
            });
            ownLocksRef.current.clear();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    return {
        lockedCheckoutTables,
        lockTableCheckout,
        unlockTableCheckout,
        fetchStatus,
        handleLockBroadcast,
    };
}
