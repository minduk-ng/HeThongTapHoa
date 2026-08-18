import { AlertTriangle, Check, Clock, XCircle } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import type { QueueCommand } from '../../../../lib/commandQueue';

export interface KitchenOrderData {
    id: number;
    order_code: string;
    created_at: string;
    has_additional_items?: boolean;
    table?: {
        id: number;
        table_number: string;
        area: string;
    } | null;
    items: Array<{
        id: number;
        quantity: number;
        unit_price: number;
        status: 'pending' | 'completed' | 'cancelled';
        note?: string | null;
        created_at?: string;
        menu_item?: {
            id: number;
            name: string;
            category?: {
                id: number;
                name: string;
            } | null;
        };
    }>;
}

interface KitchenOrderCardProps {
    order: KitchenOrderData;
    queueCommands: QueueCommand[];
    onEnqueue: (
        type: 'kitchen.complete' | 'kitchen.complete-items',
        url: string,
        payload: Record<string, unknown>,
    ) => void;
    onRetry: (commandId: string) => void;
    onDiscard: (commandId: string) => void;
}

export default function KitchenOrderCard({
    order,
    queueCommands,
    onEnqueue,
    onRetry,
    onDiscard,
}: KitchenOrderCardProps) {
    const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>(
        () => {
            const initial: Record<number, boolean> = {};
            order.items.forEach((item) => {
                if (item.status === 'completed') {
                    initial[item.id] = true;
                }
            });

            return initial;
        },
    );
    const [nowTime, setNowTime] = useState(() => Date.now());

    // Update elapsed timer periodically
    useEffect(() => {
        const interval = setInterval(() => {
            setNowTime(Date.now());
        }, 10000); // refresh every 10s

        return () => clearInterval(interval);
    }, []);

    // Sync state when order items change (e.g. from real-time extra items calls)
    useEffect(() => {
        queueMicrotask(() => {
            setCheckedItems((prev) => {
                const next = { ...prev };
                order.items.forEach((item) => {
                    if (item.status === 'completed') {
                        next[item.id] = true;
                    }
                });

                return next;
            });
        });
    }, [order.items]);

    // Calculate elapsed time in minutes based on the oldest pending item, fallback to order.created_at
    const pendingItems = order.items.filter((item) => item.status === 'pending');
    const referenceTime = pendingItems.length > 0
        ? pendingItems.reduce((oldest, item) => {
              if (!item.created_at) {
return oldest;
}

              return new Date(item.created_at).getTime() < new Date(oldest).getTime() ? item.created_at : oldest;
          }, pendingItems[0].created_at || order.created_at)
        : order.created_at;

    const createdAtTime = new Date(referenceTime).getTime();
    const elapsedMinutes = Math.max(
        0,
        Math.floor((nowTime - createdAtTime) / 60000),
    );

    const isOver10Mins = elapsedMinutes >= 10;
    const hasAdditional = order.has_additional_items;

    const completedItemsCount = Object.values(checkedItems).filter(Boolean).length;

    const toggleCheckItem = (itemId: number) => {
        setCheckedItems((prev) => ({
            ...prev,
            [itemId]: !prev[itemId],
        }));
    };

    const pendItems = order.items.filter((i) => i.status !== 'completed');
    const checkedItemIds = pendItems
        .filter((i) => checkedItems[i.id])
        .map((i) => i.id);
    const isPartial = checkedItemIds.length > 0;

    // Commands queued for THIS order (payload.order_id matches)
    const cardCommands = queueCommands.filter(
        (c) => (c.payload.order_id as number) === order.id,
    );
    const hasSyncing = cardCommands.some(
        (c) => c.status === 'pending' || c.status === 'flushing',
    );
    const failed = cardCommands.find((c) => c.status === 'failed');

    const handleCompleteOrder = () => {
        const subjectIds = isPartial
            ? checkedItemIds
            : pendItems.map((i) => i.id);

        if (isPartial) {
            onEnqueue('kitchen.complete-items', '/staff/kitchen/complete-items', {
                order_id: order.id,
                item_ids: checkedItemIds,
            });
        } else {
            onEnqueue('kitchen.complete', `/staff/kitchen/complete/${order.id}`, {
                order_id: order.id,
            });
        }

        // Optimistic: mark subject items completed locally (remove from pending)
        setCheckedItems((prev) => {
            const next = { ...prev };
            subjectIds.forEach((id) => {
                next[id] = true;
            });

            return next;
        });
    };

    const handleRetryFailed = () => {
        if (failed) {
            onRetry(failed.id);
        }
    };

    const handleDiscardFailed = () => {
        if (!failed) {
            return;
        }

        onDiscard(failed.id);

        // Rollback optimistic checks so the items reappear as pending
        const failedIds: number[] = Array.isArray(failed.payload.item_ids)
            ? (failed.payload.item_ids as number[])
            : order.items
                  .filter((i) => i.status !== 'completed')
                  .map((i) => i.id);

        setCheckedItems((prev) => {
            const next = { ...prev };
            failedIds.forEach((id) => {
                delete next[id];
            });

            return next;
        });
    };

    // Premium gradients and borders
    let headerBgClass = 'bg-gradient-to-r from-sky-600 to-sky-700 dark:from-sky-700/90 dark:to-sky-800/90 text-white';
    let cardBorderClass = 'border-zinc-200/80 dark:border-zinc-800';

    if (isOver10Mins) {
        headerBgClass = 'bg-gradient-to-r from-rose-600 to-rose-700 dark:from-rose-700/90 dark:to-rose-800/90 text-white animate-pulse';
        cardBorderClass = 'border-rose-300 dark:border-rose-900/60';
    } else if (hasAdditional) {
        headerBgClass = 'bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600/90 dark:to-amber-700/90 text-white';
        cardBorderClass = 'border-amber-300 dark:border-amber-900/60';
    }

    return (
        <div
            className={`border bg-white dark:bg-zinc-900 ${cardBorderClass} flex h-full min-h-[300px] flex-col justify-between overflow-hidden rounded-2xl shadow-sm transition-all hover:shadow-md duration-200`}
        >
            {/* Order Card Header */}
            <div className={`p-3 ${headerBgClass} space-y-1.5 shadow-xs`}>
                <div className="flex items-start justify-between">
                    <div>
                        <span className="block text-[10px] font-bold tracking-wider text-white/70 uppercase font-mono">
                            {order.order_code}
                        </span>
                        <h3 className="font-display text-lg font-bold leading-tight text-white mt-1 flex flex-wrap items-center gap-1.5">
                            <span>{order.table?.table_number || 'Mang về'}</span>
                            {hasAdditional && (
                                <span className="inline-flex items-center space-x-0.5 rounded-md border border-amber-300/40 bg-amber-300/35 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100 shrink-0">
                                    <AlertTriangle className="h-2.5 w-2.5 stroke-[1.5]" />
                                    <span>Gọi thêm</span>
                                </span>
                            )}
                        </h3>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-xs font-semibold text-white">
                        <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span className="tabular-nums">{elapsedMinutes}'</span>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-xs">
                    <span className="font-medium opacity-80">
                        Tiến độ pha chế
                    </span>
                    <span className="rounded-md bg-white/15 px-2 py-0.5 font-bold tabular-nums">
                        {completedItemsCount}/{order.items.length} món
                    </span>
                </div>
            </div>

            {/* Items Checklist (Spacious layout without height truncation) */}
            <div className="min-h-[140px] flex-1 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-y-auto px-4 py-2">
                {order.items
                    .filter((item) => item.status !== 'completed')
                    .map((item) => {
                        const isChecked = !!checkedItems[item.id];

                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleCheckItem(item.id)}
                                className={`flex cursor-pointer items-center justify-between gap-3 py-3 transition-all select-none duration-150 ${
                                    isChecked
                                        ? 'line-through opacity-50'
                                        : 'hover:text-sky-600 dark:hover:text-sky-400'
                                }`}
                            >
                                <div className="flex min-w-0 flex-1 items-center space-x-3">
                                    <div
                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all duration-150 ${
                                            isChecked
                                                ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500'
                                                : 'border-zinc-300 bg-white hover:border-sky-500 dark:border-zinc-700 dark:bg-zinc-850 dark:hover:border-sky-400'
                                        }`}
                                    >
                                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className={`block whitespace-normal break-words text-base font-extrabold text-zinc-900 dark:text-zinc-100 ${isChecked ? 'text-zinc-400 dark:text-zinc-500' : ''}`}>
                                            {item.menu_item?.name || 'Món ăn'}
                                        </span>
                                        {item.note && (
                                            <span className="mt-1 block text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-100/60 dark:border-amber-900/40 w-fit max-w-full whitespace-normal break-words">
                                                Ghi chú: {item.note}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center">
                                    <span className="rounded-lg bg-sky-50/60 px-2.5 py-1 text-sm font-black text-sky-700 tabular-nums dark:bg-sky-950/30 dark:text-sky-300">
                                        {item.quantity} ly/phần
                                    </span>
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Complete Order Footer */}
            <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/80 p-3.5 dark:border-zinc-800/40 dark:bg-zinc-900/20">
                {failed && (
                    <div className="flex items-center justify-between gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-350">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <XCircle className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                            <span className="truncate">
                                {failed.error ||
                                    'Không thể đồng bộ. Kiểm tra mạng và thử lại.'}
                            </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={handleRetryFailed}
                                className="rounded-md bg-rose-600 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-rose-700"
                            >
                                Thử lại
                            </button>
                            <button
                                type="button"
                                onClick={handleDiscardFailed}
                                className="rounded-md border border-rose-300 px-2 py-1 text-[10px] font-bold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40"
                            >
                                Bỏ qua
                            </button>
                        </div>
                    </div>
                )}
                <button
                    type="button"
                    disabled={hasSyncing}
                    onClick={handleCompleteOrder}
                    className="flex w-full items-center justify-center space-x-2 rounded-xl bg-sky-600 hover:bg-sky-700 py-2.5 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                    <Check className="h-4 w-4 stroke-[2]" />
                    <span>
                        {hasSyncing
                            ? 'Đang đồng bộ…'
                            : isPartial
                              ? `Hoàn thành ${checkedItemIds.length}/${pendItems.length} món`
                              : 'Hoàn thành toàn bộ đơn'}
                    </span>
                </button>
            </div>
        </div>
    );
}
