import React, { useState } from 'react';
import { router } from '@inertiajs/react';

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
        note?: string | null;
        menu_item?: {
            id: number;
            name: string;
        };
    }>;
}

interface KitchenOrderCardProps {
    order: KitchenOrderData;
}

export default function KitchenOrderCard({ order }: KitchenOrderCardProps) {
    const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
    const [submitting, setSubmitting] = useState(false);

    // Calculate elapsed time in minutes
    const createdAtTime = new Date(order.created_at).getTime();
    const nowTime = new Date().getTime();
    const elapsedMinutes = Math.max(1, Math.floor((nowTime - createdAtTime) / 60000));

    const isOver10Mins = elapsedMinutes >= 10;
    const hasAdditional = order.has_additional_items;

    const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);
    const completedItemsCount = Object.values(checkedItems).filter(Boolean).length;

    const toggleCheckItem = (itemId: number) => {
        setCheckedItems((prev) => ({
            ...prev,
            [itemId]: !prev[itemId],
        }));
    };

    const handleCompleteOrder = () => {
        setSubmitting(true);
        router.post(`/staff/kitchen/complete/${order.id}`, {}, {
            onSuccess: () => setSubmitting(false),
            onError: () => setSubmitting(false),
        });
    };

    // Determine header theme color
    let headerBgClass = 'bg-amber-600 text-white';
    if (isOver10Mins) {
        headerBgClass = 'bg-rose-700 text-white';
    } else if (hasAdditional) {
        headerBgClass = 'bg-orange-600 text-white';
    }

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-md flex flex-col justify-between h-full transition-all">
            {/* Order Card Header */}
            <div className={`p-4 ${headerBgClass} space-y-2 relative`}>
                {hasAdditional && (
                    <span className="absolute -top-2 left-4 px-2.5 py-0.5 rounded-full bg-yellow-300 text-yellow-950 font-extrabold text-[10px] shadow-sm uppercase tracking-wide">
                        ⚠️ Bàn gọi thêm đồ
                    </span>
                )}

                <div className="flex justify-between items-start pt-1">
                    <div>
                        <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider block">
                            {order.order_code}
                        </span>
                        <h3 className="text-lg font-black text-white leading-tight">
                            {order.table?.table_number || 'Mang về'} – {order.table?.area || 'Trong nhà'}
                        </h3>
                    </div>
                    <div className="px-2.5 py-1 rounded-full bg-black/25 text-white font-extrabold text-xs">
                        {elapsedMinutes}'
                    </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-1 border-t border-white/20">
                    <span className="font-semibold opacity-90">Tiến độ làm món</span>
                    <span className="font-extrabold">{completedItemsCount}/{order.items.length} phần</span>
                </div>
            </div>

            {/* Items Checklist */}
            <div className="p-4 flex-1 space-y-2.5 overflow-y-auto max-h-64">
                {order.items.map((item) => {
                    const isChecked = !!checkedItems[item.id];
                    return (
                        <div
                            key={item.id}
                            onClick={() => toggleCheckItem(item.id)}
                            className={`p-2.5 rounded-xl border cursor-pointer select-none transition-all flex items-center justify-between ${
                                isChecked
                                    ? 'bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 opacity-60 line-through'
                                    : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                            }`}
                        >
                            <div className="flex items-center space-x-2.5">
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold ${
                                    isChecked
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                                }`}>
                                    {isChecked && '✓'}
                                </div>
                                <div>
                                    <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 block">
                                        {item.menu_item?.name || 'Món ăn'}
                                    </span>
                                    {item.note && (
                                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium block">
                                            Ghi chú: {item.note}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-extrabold text-xs shrink-0">
                                {item.quantity} ly/phần
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Complete Order Button */}
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCompleteOrder}
                    className="w-full py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50 transition-colors flex items-center justify-center space-x-1.5"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{submitting ? 'Đang cập nhật...' : 'Xác nhận hoàn thành đơn'}</span>
                </button>
            </div>
        </div>
    );
}
