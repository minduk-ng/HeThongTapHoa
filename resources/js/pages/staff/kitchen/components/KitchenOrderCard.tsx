import React, { useState } from 'react';
import { router } from '@inertiajs/react';
import { AlertTriangle, Trash2 } from 'lucide-react';

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
            category?: {
                id: number;
                name: string;
            } | null;
        };
    }>;
}

interface KitchenOrderCardProps {
    order: KitchenOrderData;
    onCancelItem?: (itemId: number, itemName: string) => void;
}

export default function KitchenOrderCard({ order, onCancelItem }: KitchenOrderCardProps) {
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
        if (submitting) return;
        setSubmitting(true);

        const timeout = setTimeout(() => {
            setSubmitting(false);
            alert('Kết nối CSDL/Máy chủ quá thời gian chờ. Vui lòng thử lại!');
        }, 8000);

        router.post(`/staff/kitchen/complete/${order.id}`, {}, {
            onFinish: () => {
                clearTimeout(timeout);
                setSubmitting(false);
            },
            onError: (errors: any) => {
                clearTimeout(timeout);
                setSubmitting(false);
                const msg = errors.error || errors.message || 'Không thể hoàn thành đơn do kết nối CSDL chập chờn.';
                alert(msg);
            },
        });
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
        <div className={`bg-white dark:bg-zinc-900 border ${cardBorderClass} rounded-2xl overflow-hidden shadow-md flex flex-col justify-between h-full transition-all min-h-[340px]`}>
            {/* Order Card Header */}
            <div className={`p-4 ${headerBgClass} space-y-2 shadow-xs`}>
                {hasAdditional && (
                    <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-amber-300/30 text-amber-100 font-semibold text-[11px] border border-amber-300/40">
                        <AlertTriangle className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>Bàn gọi thêm đồ</span>
                    </div>
                )}

                <div className="flex justify-between items-start">
                    <div>
                        <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider block">
                            {order.order_code}
                        </span>
                        <h3 className="text-xl font-black text-white leading-tight">
                            {order.table?.table_number || 'Mang về'} – {order.table?.area || 'Trong nhà'}
                        </h3>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-black/25 text-white font-black text-xs shrink-0">
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

                            <div className="flex items-center space-x-2 shrink-0">
                                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200 font-black text-xs border border-blue-200 dark:border-blue-800">
                                    {item.quantity} ly/phần
                                </span>
                                {onCancelItem && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCancelItem(item.id, item.menu_item?.name || 'Món ăn');
                                        }}
                                        className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                                        title="Hủy món này"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                    </button>
                                )}
                            </div>
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
