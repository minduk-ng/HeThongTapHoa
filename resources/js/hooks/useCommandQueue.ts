import { useCallback, useEffect, useRef, useState } from 'react';
import {
    enqueue as qEnqueue,
    flush as qFlush,
    readQueue,
    retryFailed,
    discardCommand,
} from '../lib/commandQueue';
import type {
    CommandType,
    QueueCommand,
    SendResult,
} from '../lib/commandQueue';
import { useReverbStatus } from '../pages/staff/pos/hooks/useReverbStatus';

function getXSRFToken(): string {
    if (typeof document === 'undefined') {
        return '';
    }

    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : '';
}

const TIMEOUT_MS = 8000;
const BACKOFF = [2000, 5000, 15000];

async function sendCommand(cmd: QueueCommand): Promise<SendResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(cmd.url, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-XSRF-TOKEN': getXSRFToken(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ ...cmd.payload, idempotency_key: cmd.id }),
        });
        const body = await res.json().catch(() => ({}));

        return { ok: res.ok, status: res.status, body };
    } finally {
        clearTimeout(timeout);
    }
}

export function useCommandQueue(opts: { reconcile?: () => void } = {}) {
    const [queue, setQueue] = useState<QueueCommand[]>(() =>
        readQueue(localStorage),
    );
    const { status: reverbStatus } = useReverbStatus();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const flushingRef = useRef(false);
    const backoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconcile = opts.reconcile;

    // ponytail: ref indirection so the async finally can re-schedule without
    // react-hooks/immutability flagging a self-reference before declaration
    const scheduleFlushRef = useRef<(delay?: number) => void>(() => {});
    const scheduleFlush = useCallback(
        (delay = 0) => {
            if (backoffRef.current) {
                clearTimeout(backoffRef.current);
            }

            backoffRef.current = setTimeout(() => {
                if (flushingRef.current) {
                    return;
                }

                flushingRef.current = true;
                const hadPending = readQueue(localStorage).some(
                    (c) => c.status === 'pending',
                );

                qFlush(localStorage, sendCommand, setQueue).finally(() => {
                    flushingRef.current = false;
                    const rest = readQueue(localStorage);
                    const pending = rest.filter((c) => c.status === 'pending');

                    if (pending.length > 0) {
                        // backoff theo retryCount của lệnh xấu nhất
                        const maxRetry = Math.max(
                            ...pending.map((c) => c.retryCount),
                        );
                        scheduleFlushRef.current(
                            BACKOFF[Math.min(maxRetry, BACKOFF.length - 1)],
                        );
                    } else if (hadPending) {
                        // queue vừa rỗng hoàn toàn -> đối soát server 1 lần
                        reconcile?.();
                    }
                });
            }, delay);
        },
        [reconcile],
    );

    useEffect(() => {
        scheduleFlushRef.current = scheduleFlush;
    });

    const enqueue = useCallback(
        (type: CommandType, url: string, payload: Record<string, unknown>) => {
            qEnqueue(localStorage, { type, url, payload });
            setQueue(readQueue(localStorage));
            scheduleFlush(0);
        },
        [scheduleFlush],
    );

    const retry = useCallback(
        (id: string) => {
            retryFailed(localStorage, id);
            setQueue(readQueue(localStorage));
            scheduleFlush(0);
        },
        [scheduleFlush],
    );

    const discard = useCallback((id: string) => {
        discardCommand(localStorage, id);
        setQueue(readQueue(localStorage));
    }, []);

    useEffect(() => {
        const onOnline = () => {
            setIsOnline(true);
            scheduleFlush(0);
        };
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);

            if (backoffRef.current) {
                clearTimeout(backoffRef.current);
            }
        };
    }, [scheduleFlush]);

    // Echo reconnect -> flush
    useEffect(() => {
        if (reverbStatus === 'connected') {
            scheduleFlush(0);
        }
    }, [reverbStatus, scheduleFlush]);

    // Mount: nếu còn pending -> flush ngay
    useEffect(() => {
        if (readQueue(localStorage).some((c) => c.status === 'pending')) {
            scheduleFlush(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        queue,
        enqueue,
        retry,
        discard,
        isOnline,
        lastSyncFailed: queue.filter((c) => c.status === 'failed'),
    };
}
