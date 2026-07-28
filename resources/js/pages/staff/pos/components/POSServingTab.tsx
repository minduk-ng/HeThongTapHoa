import React, { useState, useEffect, useCallback } from 'react';
import { ConciergeBell, CheckCircle, Clock } from 'lucide-react';

interface ServingItem {
    id: string;
    order_id: number;
    order_code: string;
    table_number: string;
    table_area: string;
    items: Array<{
        id: number;
        name: string;
        quantity: number;
        note?: string | null;
    }>;
    completed_at: string;
}

interface POSServingTabProps {
    servingQueue: ServingItem[];
    onMarkServed: (itemIds: number[]) => void;
}

function ElapsedTimer({ completedAt }: { completedAt: string }) {
    const [elapsed, setElapsed] = useState('');

    useEffect(() => {
        const tick = () => {
            const diff = Date.now() - new Date(completedAt).getTime();
            if (diff < 0) { setElapsed('0s'); return; }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setElapsed(`${mins}:${String(secs).padStart(2, '0')}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [completedAt]);

    return (
        <span className="tabular-nums text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3 stroke-[1.5]" />
            {elapsed}
        </span>
    );
}

function getXSRFToken(): string {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export default function POSServingTab({ servingQueue, onMarkServed }: POSServingTabProps) {
    const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

    const handleServed = useCallback((card: ServingItem) => {
        if (submittingIds.has(card.id)) return;
        setSubmittingIds(prev => new Set(prev).add(card.id));

        const itemIds = card.items.map(i => i.id);
        const xsrfToken = getXSRFToken();

        fetch('/staff/pos/mark-served', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrfToken },
            body: JSON.stringify({ item_ids: itemIds }),
        })
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    onMarkServed(itemIds);
                }
            })
            .catch(() => {})
            .finally(() => {
                setSubmittingIds(prev => { const n = new Set(prev); n.delete(card.id); return n; });
            });
    }, [submittingIds, onMarkServed]);

    if (servingQueue.length === 0) {
        return (
            <div className="h-full flex items-start justify-start pt-12 pl-8">
                <div className="flex flex-col items-start space-y-3">
                    <ConciergeBell className="w-10 h-10 stroke-[1.5] text-zinc-300 dark:text-zinc-700" />
                    <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            Chưa có món nào cần phục vụ
                        </p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Các món hoàn thành từ bếp sẽ xuất hiện tại đây
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto min-h-0 space-y-3 pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {servingQueue.map((card) => (
                    <div
                        key={card.id}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs flex flex-col overflow-hidden"
                    >
                        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <ConciergeBell className="w-4 h-4 stroke-[1.5] text-sky-600 dark:text-sky-400 shrink-0" />
                                <span className="font-display font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                    {card.table_number}
                                </span>
                                {card.table_area && (
                                    <span className="text-[10px] font-medium text-zinc-400 truncate">
                                        {card.table_area}
                                    </span>
                                )}
                            </div>
                            <ElapsedTimer completedAt={card.completed_at} />
                        </div>

                        <div className="flex-1 px-4 py-2.5 space-y-1.5 min-h-0">
                            {card.items.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="tabular-nums text-xs font-bold text-zinc-900 dark:text-zinc-100 shrink-0">
                                            {item.quantity}x
                                        </span>
                                        <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                            {item.name}
                                        </span>
                                    </div>
                                    {item.note && (
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 italic max-w-[120px] truncate">
                                            {item.note}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                            <button
                                type="button"
                                onClick={() => handleServed(card)}
                                disabled={submittingIds.has(card.id)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                            >
                                <CheckCircle className="w-3.5 h-3.5 stroke-[1.5]" />
                                {submittingIds.has(card.id) ? 'Đang xử lý…' : 'Đã phục vụ'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
