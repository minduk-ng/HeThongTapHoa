import React from 'react';
import { ActionRow } from './PromotionActionsEditor';
import { ConditionRow } from './PromotionConditionsEditor';

interface Props {
    name: string;
    type: 'promotion' | 'coupon' | 'voucher';
    actions: ActionRow[];
    conditions: ConditionRow[];
    endDate: string;
    status: boolean;
}

const fmt = (v: string) => Number(v || 0).toLocaleString('vi-VN');

export default function PromotionPreview({ name, type, actions, conditions, endDate, status }: Props) {
    const first = actions[0];
    let discountText = '—';
    if (first) {
        if (first.action_type === 'discount_percent') discountText = `Giảm ${first.action_value}%`;
        if (first.action_type === 'discount_amount') discountText = `Giảm ${fmt(first.action_value)}đ`;
        if (first.action_type === 'free_product') discountText = 'Tặng món';
    }
    const minOrder = conditions.find((c) => c.cond_type === 'min_order_value');
    const typeLabel: Record<string, string> = { promotion: 'Promotion', coupon: 'Coupon', voucher: 'Voucher' };

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-800 w-full overflow-hidden flex">
            <div className="bg-sky-600 w-3 flex-shrink-0" />
            <div className="p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                    <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{typeLabel[type]}</span>
                    <span className={`text-[10px] font-bold px-2 rounded ${status ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{status ? 'Active' : 'Paused'}</span>
                </div>
                <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight mb-1">{name || 'Tên chương trình'}</h4>
                <p className="text-sm text-sky-600 font-semibold mb-3">{discountText}</p>
                <div className="mt-auto border-t border-dashed border-zinc-200 dark:border-zinc-700 pt-2 space-y-1">
                    {minOrder && <p className="text-[11px] text-zinc-500">Đơn tối thiểu: {fmt(minOrder.cond_value)}đ</p>}
                    {endDate && <p className="text-[11px] text-zinc-500">HSD: {endDate}</p>}
                    {actions.length === 0 && <p className="text-[11px] text-zinc-400">Chưa cấu hình giảm giá</p>}
                </div>
            </div>
        </div>
    );
}
