import { router } from '@inertiajs/react';
import { AlertTriangle, Check, Clock, XCircle, X } from 'lucide-react';
import React, { useState, useEffect } from 'react';

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
}

export default function KitchenOrderCard({ order }: KitchenOrderCardProps) {
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
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Sync state when order items change (e.g. from real-time extra items calls)
    useEffect(() => {
        setCheckedItems((prev) => {
            const next = { ...prev };
            order.items.forEach((item) => {
                if (item.status === 'completed') {
                    next[item.id] = true;
                }
            });

            return next;
        });
    }, [order.items]);

    // Calculate elapsed time in minutes
    const createdAtTime = new Date(order.created_at).getTime();
    const nowTime = new Date().getTime();
    const elapsedMinutes = Math.max(
        1,
        Math.floor((nowTime - createdAtTime) / 60000),
    );

    const isOver10Mins = elapsedMinutes >= 10;
    const hasAdditional = order.has_additional_items;

    const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);
    const completedItemsCount =
        Object.values(checkedItems).filter(Boolean).length;

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

    const handleCompleteOrder = () => {
        if (submitting) return;
        setErrorMessage(null);
        setSubmitting(true);

        const timeout = setTimeout(() => {
            setSubmitting(false);
            setErrorMessage(
                'Kết nối CSDL/Máy chủ quá thời gian chờ. Vui lòng thử lại!',
            );
        }, 8000);

        if (isPartial) {
            router.post(
                '/staff/kitchen/complete-items',
                { order_id: order.id, item_ids: checkedItemIds },
                {
                    onFinish: () => {
                        clearTimeout(timeout);
                        setSubmitting(false);
                    },
                    onError: (errors: any) => {
                        clearTimeout(timeout);
                        setSubmitting(false);
                        const msg =
                            errors.error ||
                            errors.message ||
                            'Không thể hoàn thành món.';
                        setErrorMessage(msg);
                    },
                },
            );
        } else {
            router.post(
                `/staff/kitchen/complete/${order.id}`,
                {},
                {
                    onFinish: () => {
                        clearTimeout(timeout);
                        setSubmitting(false);
                    },
                    onError: (errors: any) => {
                        clearTimeout(timeout);
                        setSubmitting(false);
                        const msg =
                            errors.error ||
                            errors.message ||
                            'Không thể hoàn thành đơn.';
                        setErrorMessage(msg);
                    },
                },
            );
        }
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
            <div className={`p-4 ${headerBgClass} space-y-2 shadow-xs`}>
                {hasAdditional && (
                    <div className="inline-flex items-center space-x-1 rounded-md border border-amber-300/40 bg-amber-300/30 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                        <AlertTriangle className="h-3 w-3 stroke-[1.5]" />
                        <span>Bàn gọi thêm đồ</span>
                    </div>
                )}

                <div className="flex items-start justify-between">
                    <div>
                        <span className="block text-[10px] font-bold tracking-wider text-white/70 uppercase font-mono">
                            {order.order_code}
                        </span>
                        <h3 className="font-display text-lg font-bold leading-tight text-white mt-0.5">
                            {order.table?.table_number || 'Mang về'}
                            <span className="text-xs font-normal opacity-75 block mt-0.5">
                                {order.table?.area || 'Trong nhà'}
                            </span>
                        </h3>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-xs font-semibold text-white">
                        <Clock className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span className="tabular-nums">{elapsedMinutes}'</span>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                    <span className="font-medium opacity-80">
                        Tiến độ pha chế
                    </span>
                    <span className="rounded-md bg-white/15 px-2 py-0.5 font-bold tabular-nums">
                        {completedItemsCount}/{order.items.length} món
                    </span>
                </div>
            </div>

            {/* Items Checklist (Spacious layout without height truncation) */}
            <div className="min-h-[140px] flex-1 space-y-2 overflow-y-auto p-3 pr-1">
                {order.items
                    .filter((item) => item.status !== 'completed')
                    .map((item) => {
                        const isChecked = !!checkedItems[item.id];

                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleCheckItem(item.id)}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-all select-none duration-150 ${
                                    isChecked
                                        ? 'border-zinc-200/60 bg-zinc-50/60 line-through opacity-50 dark:border-zinc-800 dark:bg-zinc-800/30'
                                        : 'border-zinc-200/80 bg-white hover:border-sky-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-700'
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
                                        <span className={`block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${isChecked ? 'text-zinc-400 dark:text-zinc-500' : ''}`}>
                                            {item.menu_item?.name || 'Món ăn'}
                                        </span>
                                        {item.note && (
                                            <span className="mt-0.5 block text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-100/60 dark:border-amber-900/40 w-fit max-w-full truncate">
                                                Ghi chú: {item.note}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center">
                                    <span className="rounded-lg border border-sky-100 bg-sky-50/50 px-2.5 py-1 text-xs font-bold text-sky-700 tabular-nums dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
                                        {item.quantity} ly/phần
                                    </span>
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Complete Order Footer */}
            <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/80 p-3.5 dark:border-zinc-800/40 dark:bg-zinc-900/20">
                {errorMessage && (
                    <div className="flex items-center justify-between gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-350">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <XCircle className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                            <span className="truncate">{errorMessage}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setErrorMessage(null)}
                            className="text-rose-500 hover:text-rose-700 p-0.5 rounded transition-colors"
                        >
                            <X className="w-3.5 h-3.5 stroke-2" />
                        </button>
                    </div>
                )}
                <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCompleteOrder}
                    className="flex w-full items-center justify-center space-x-2 rounded-xl bg-sky-600 hover:bg-sky-700 py-2.5 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                    <Check className="h-4 w-4 stroke-[2]" />
                    <span>
                        {submitting
                            ? 'Đang cập nhật...'
                            : isPartial
                              ? `Hoàn thành ${checkedItemIds.length}/${pendItems.length} món`
                              : 'Hoàn thành toàn bộ đơn'}
                    </span>
                </button>
            </div>
        </div>
    );
}
