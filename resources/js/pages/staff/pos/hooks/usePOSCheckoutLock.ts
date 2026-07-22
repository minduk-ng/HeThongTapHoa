import { useState, useEffect, useCallback, useRef } from 'react';

export interface CheckoutLockInfo {
    employeeName: string;
}

export function usePOSCheckoutLock() {
    const [lockedCheckoutTables, setLockedCheckoutTables] = useState<Record<number, CheckoutLockInfo>>({});
    const activeLockTableIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.Echo) return;

        const presenceChannel = window.Echo.join('pos-room');

        presenceChannel
            .listenForWhisper('table-checkout-started', (e: { tableId: number; employeeName: string }) => {
                if (e && e.tableId) {
                    setLockedCheckoutTables((prev) => ({
                        ...prev,
                        [e.tableId]: {
                            employeeName: e.employeeName || 'Nhân viên khác',
                        },
                    }));
                }
            })
            .listenForWhisper('table-checkout-ended', (e: { tableId: number }) => {
                if (e && e.tableId) {
                    setLockedCheckoutTables((prev) => {
                        const next = { ...prev };
                        delete next[e.tableId];
                        return next;
                    });
                }
            })
            .leaving((user: { id: number; name: string }) => {
                if (user && user.name) {
                    setLockedCheckoutTables((prev) => {
                        const next = { ...prev };
                        Object.keys(next).forEach((key) => {
                            const numericKey = Number(key);
                            if (next[numericKey]?.employeeName === user.name) {
                                delete next[numericKey];
                            }
                        });
                        return next;
                    });
                }
            });

        const handleBeforeUnload = () => {
            if (activeLockTableIdRef.current) {
                presenceChannel.whisper('table-checkout-ended', {
                    tableId: activeLockTableIdRef.current,
                });
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            handleBeforeUnload();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (window.Echo) {
                window.Echo.leave('pos-room');
            }
        };
    }, []);

    const lockTableCheckout = useCallback((tableId: number, employeeName: string) => {
        activeLockTableIdRef.current = tableId;
        if (typeof window !== 'undefined' && window.Echo) {
            window.Echo.join('pos-room').whisper('table-checkout-started', {
                tableId,
                employeeName,
            });
        }
    }, []);

    const unlockTableCheckout = useCallback((tableId: number) => {
        if (activeLockTableIdRef.current === tableId) {
            activeLockTableIdRef.current = null;
        }
        if (typeof window !== 'undefined' && window.Echo) {
            window.Echo.join('pos-room').whisper('table-checkout-ended', {
                tableId,
            });
        }
    }, []);

    return {
        lockedCheckoutTables,
        lockTableCheckout,
        unlockTableCheckout,
    };
}
