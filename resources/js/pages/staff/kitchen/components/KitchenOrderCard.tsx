import { router } from '@inertiajs/react';
import { AlertTriangle, Check } from 'lucide-react';
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

    const handleCompleteOrder = () => {
        if (submitting) {
            return;
        }

        setSubmitting(true);

        const timeout = setTimeout(() => {
            setSubmitting(false);
            alert('Kết nối CSDL/Máy chủ quá thời gian chờ. Vui lòng thử lại!');
        }, 8000);

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
                        'Không thể hoàn thành đơn do kết nối CSDL chập chờn.';
                    alert(msg);
                },
            },
        );
    };

    // Soft, gentle color themes for card header
    let headerBgClass = 'bg-blue-600/90 dark:bg-blue-900/80 text-white';
    let cardBorderClass = 'border-blue-200 dark:border-zinc-800';

    if (isOver10Mins) {
        headerBgClass = 'bg-rose-700/90 dark:bg-rose-900/90 text-white';
        cardBorderClass = 'border-rose-300 dark:border-rose-900/60';
    } else if (hasAdditional) {
        headerBgClass = 'bg-amber-600/90 dark:bg-amber-800/90 text-white';
        cardBorderClass = 'border-amber-300 dark:border-amber-900/60';
    }

    return (
        <div
            className={`border bg-white dark:bg-zinc-900 ${cardBorderClass} flex h-full min-h-[340px] flex-col justify-between overflow-hidden rounded-2xl shadow-md transition-all`}
        >
            {/* Order Card Header */}
            <div className={`p-4 ${headerBgClass} space-y-2 shadow-xs`}>
                {hasAdditional && (
                    <div className="inline-flex items-center space-x-1 rounded-md border border-amber-300/40 bg-amber-300/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100">
                        <AlertTriangle className="h-3.5 w-3.5 stroke-[1.5]" />
                        <span>Bàn gọi thêm đồ</span>
                    </div>
                )}

                <div className="flex items-start justify-between">
                    <div>
                        <span className="block text-[11px] font-bold tracking-wider text-white/80 uppercase">
                            {order.order_code}
                        </span>
                        <h3 className="text-xl leading-tight font-black text-white">
                            {order.table?.table_number || 'Mang về'} –{' '}
                            {order.table?.area || 'Trong nhà'}
                        </h3>
                    </div>
                    <div className="shrink-0 rounded-full bg-black/25 px-3 py-1 text-xs font-black text-white">
                        {elapsedMinutes}'
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/20 pt-1.5 text-xs">
                    <span className="font-semibold opacity-90">
                        Tiến độ pha chế
                    </span>
                    <span className="rounded-md bg-white/20 px-2 py-0.5 font-extrabold">
                        {completedItemsCount}/{order.items.length} món
                    </span>
                </div>
            </div>

            {/* Items Checklist (Spacious layout without height truncation) */}
            <div className="min-h-[160px] flex-1 space-y-2.5 overflow-y-auto p-4 pr-1">
                {order.items
                    .filter((item) => item.status !== 'completed')
                    .map((item) => {
                        const isChecked = !!checkedItems[item.id];

                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleCheckItem(item.id)}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-all select-none ${
                                    isChecked
                                        ? 'border-zinc-200 bg-zinc-100 line-through opacity-60 dark:border-zinc-700 dark:bg-zinc-800/60'
                                        : 'border-zinc-200 bg-zinc-50 hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-blue-600'
                                }`}
                            >
                                <div className="flex min-w-0 flex-1 items-center space-x-3">
                                    <div
                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                                            isChecked
                                                ? 'border-blue-600 bg-blue-600 text-white'
                                                : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800'
                                        }`}
                                    >
                                        {isChecked && '✓'}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                            {item.menu_item?.name || 'Món ăn'}
                                        </span>
                                        {item.note && (
                                            <span className="mt-0.5 block text-xs font-semibold text-amber-600 dark:text-amber-400">
                                                Ghi chú: {item.note}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center space-x-2">
                                    <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                                        {item.quantity} ly/phần
                                    </span>
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Complete Order Footer */}
            <div className="border-t border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCompleteOrder}
                    className="flex w-full items-center justify-center space-x-2 rounded-xl bg-blue-600 py-3 text-xs font-extrabold text-white shadow-md transition-colors hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                    <Check className="h-4 w-4 stroke-[1.5]" />
                    <span>
                        {submitting
                            ? 'Đang cập nhật...'
                            : 'Xác nhận hoàn thành đơn'}
                    </span>
                </button>
            </div>
        </div>
    );
}
