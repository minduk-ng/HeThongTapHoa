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

    // Determine header theme color matching blue tone palette
    let headerBgClass = 'bg-blue-600 dark:bg-blue-700 text-white';
    if (isOver10Mins) {
        headerBgClass = 'bg-rose-600 dark:bg-rose-800 text-white';
    } else if (hasAdditional) {
        headerBgClass = 'bg-amber-600 dark:bg-amber-700 text-white';
    }

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-md flex flex-col justify-between h-full transition-all min-h-[340px]">
            {/* Order Card Header */}
            <div className={`p-4 ${headerBgClass} space-y-2 relative shadow-xs`}>
                {hasAdditional && (
                    <span className="absolute -top-2.5 left-4 px-3 py-0.5 rounded-full bg-amber-300 text-amber-950 font-black text-[10px] shadow-md uppercase tracking-wide border border-amber-400">
                        ⚠️ Bàn gọi thêm đồ
                    </span>
                )}

                <div className="flex justify-between items-start pt-1">
                    <div>
                        <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider block">
                            {order.order_code}
                        </span>
                        <h3 className="text-xl font-black text-white leading-tight">
                            {order.table?.table_number || 'Mang về'} – {order.table?.area || 'Trong nhà'}
                        </h3>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-black/25 text-white font-black text-xs">
                        {elapsedMinutes}'
                    </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-1.5 border-t border-white/20">
                    <span className="font-semibold opacity-90">Tiến độ pha chế</span>
                    <span className="font-extrabold px-2 py-0.5 rounded-md bg-white/20">{completedItemsCount}/{order.items.length} món</span>
                </div>
            </div>

            {/* Items Checklist (Spacious layout without height truncation) */}
            <div className="p-4 flex-1 space-y-2.5 overflow-y-auto pr-1 min-h-[160px]">
                {order.items.map((item) => {
                    const isChecked = !!checkedItems[item.id];
                    return (
                        <div
                            key={item.id}
                            onClick={() => toggleCheckItem(item.id)}
                            className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex items-center justify-between gap-3 ${
                                isChecked
                                    ? 'bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 opacity-60 line-through'
                                    : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700 hover:border-blue-400 dark:hover:border-blue-600'
                            }`}
                        >
                            <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${
                                    isChecked
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                                }`}>
                                    {isChecked && '✓'}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100 block truncate">
                                        {item.menu_item?.name || 'Món ăn'}
                                    </span>
                                    {item.note && (
                                        <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold block mt-0.5">
                                            Ghi chú: {item.note}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 font-black text-xs shrink-0 border border-blue-200 dark:border-blue-800">
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
                    className="w-full py-3 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-xl shadow-md disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
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
