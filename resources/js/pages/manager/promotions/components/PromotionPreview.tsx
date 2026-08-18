import { Sparkles, Calendar, Tag, ShieldCheck, Gift, Clock, Coins, ShoppingBag, UtensilsCrossed, Layers, CheckCircle2 } from 'lucide-react';
import React from 'react';
import type { ActionRow } from './PromotionActionsEditor';
import type { ConditionRow } from './PromotionConditionsEditor';

interface Props {
    name: string;
    type: 'promotion' | 'coupon' | 'voucher';
    code?: string;
    codePrefix?: string;
    actions: ActionRow[];
    conditions: ConditionRow[];
    menuItems?: { id: number; name: string }[];
    menuCategories?: { id: number; name: string }[];
    startDate?: string | null;
    endDate: string;
    status: boolean;
    exclusive?: boolean;
    maxUsage?: string;
    timeSlotsCount?: number;
}

const fmt = (v: string | number) => Number(v || 0).toLocaleString('vi-VN');

export default function PromotionPreview({
    name,
    type,
    code,
    codePrefix,
    actions,
    conditions,
    menuItems = [],
    menuCategories = [],
    startDate,
    endDate,
    status,
    exclusive,
    maxUsage,
    timeSlotsCount = 0,
}: Props) {
    const primaryAction = actions.find((a) => a.action_type === 'discount_percent' || a.action_type === 'discount_amount') || actions[0];
    const freeProductActions = actions.filter((a) => a.action_type === 'free_product');

    let mainDiscountText = 'Chưa cấu hình';
    let subDiscountCap = '';

    if (primaryAction) {
        if (primaryAction.action_type === 'discount_percent') {
            const val = primaryAction.action_value ? `${primaryAction.action_value}%` : '0%';
            mainDiscountText = `Giảm ${val}`;

            if (primaryAction.max_discount_amount) {
                subDiscountCap = `Tối đa ${fmt(primaryAction.max_discount_amount)}đ`;
            }
        } else if (primaryAction.action_type === 'discount_amount') {
            const val = primaryAction.action_value ? `${fmt(primaryAction.action_value)}đ` : '0đ';
            mainDiscountText = `Giảm ${val}`;
        } else if (primaryAction.action_type === 'free_product') {
            const item = menuItems.find((m) => String(m.id) === primaryAction.action_value);
            mainDiscountText = item ? `Tặng món: ${item.name}` : 'Tặng món miễn phí';
        }
    }

    const typeConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
        promotion: { label: 'Tự động (Auto)', bg: 'bg-sky-50 dark:bg-sky-950/60', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800' },
        coupon: { label: 'Mã giảm giá (Coupon)', bg: 'bg-emerald-50 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
        voucher: { label: 'Voucher quà tặng', bg: 'bg-purple-50 dark:bg-purple-950/60', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
    };

    const typeInfo = typeConfig[type] ?? typeConfig.promotion;

    return (
        <div className="w-full space-y-3 select-none">
            {/* Voucher Ticket Box */}
            <div className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-white via-zinc-50/50 to-zinc-100/60 p-5 shadow-md dark:border-zinc-800/90 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950">
                {/* Left decorative color bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${type === 'promotion' ? 'bg-sky-500' : type === 'coupon' ? 'bg-emerald-500' : 'bg-purple-500'}`} />

                {/* Header tags */}
                <div className="flex items-center justify-between gap-2 pl-2">
                    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${typeInfo.bg} ${typeInfo.text} ${typeInfo.border}`}>
                        <Sparkles className="h-3 w-3" />
                        {typeInfo.label}
                    </span>
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            status
                                ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : 'bg-zinc-200/80 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${status ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                        {status ? 'Đang hoạt động' : 'Tạm dừng'}
                    </span>
                </div>

                {/* Campaign Title & Big Value */}
                <div className="mt-3 pl-2">
                    <h4 className="font-display text-base font-normal text-zinc-900 dark:text-zinc-100 line-clamp-2">
                        {name || 'Tên chương trình khuyến mãi'}
                    </h4>
                    <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="font-display text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">
                            {mainDiscountText}
                        </span>
                        {subDiscountCap && (
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                ({subDiscountCap})
                            </span>
                        )}
                    </div>

                    {/* Free gifts list */}
                    {freeProductActions.length > 0 && primaryAction?.action_type !== 'free_product' && (
                        <div className="mt-2 space-y-1">
                            {freeProductActions.map((fp, idx) => {
                                const item = menuItems.find((m) => String(m.id) === fp.action_value);

                                return (
                                    <div key={idx} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                        <Gift className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                                        <span>+ Tặng kèm: {item ? item.name : 'Món quà tặng'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Dashed Separator */}
                <div className="relative my-4 border-t border-dashed border-zinc-300 dark:border-zinc-700">
                    <div className="absolute -left-7 -top-2 h-4 w-4 rounded-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800" />
                    <div className="absolute -right-7 -top-2 h-4 w-4 rounded-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800" />
                </div>

                {/* Conditions & Details */}
                <div className="space-y-2 pl-2 text-xs">
                    {/* Code Badge if Coupon or Voucher */}
                    {type === 'coupon' && (
                        <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 bg-zinc-100/70 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                            <span className="text-[11px] text-zinc-500 font-medium">Mã áp dụng:</span>
                            <span className="font-mono text-xs font-bold tracking-widest text-zinc-900 dark:text-zinc-100 tabular-nums">
                                {code || 'CODE123'}
                            </span>
                        </div>
                    )}
                    {type === 'voucher' && codePrefix && (
                        <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 bg-zinc-100/70 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/60">
                            <span className="text-[11px] text-zinc-500 font-medium">Tiền tố mã:</span>
                            <span className="font-mono text-xs font-bold tracking-widest text-purple-600 dark:text-purple-400 tabular-nums">
                                {codePrefix}******
                            </span>
                        </div>
                    )}

                    {/* Conditions list */}
                    {conditions.length === 0 ? (
                        <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <span>Áp dụng cho mọi đơn hàng không giới hạn</span>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {conditions.map((c, idx) => {
                                if (c.cond_type === 'min_order_value') {
                                    return (
                                        <div key={idx} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 text-[11px]">
                                            <Coins className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                                            <span>Đơn tối thiểu: <strong>{c.cond_value ? `${fmt(c.cond_value)}đ` : '—'}</strong></span>
                                        </div>
                                    );
                                }

                                if (c.cond_type === 'min_quantity') {
                                    return (
                                        <div key={idx} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 text-[11px]">
                                            <ShoppingBag className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                            <span>Số lượng món: từ <strong>{c.cond_value || 0} món</strong></span>
                                        </div>
                                    );
                                }

                                if (c.cond_type === 'specific_product') {
                                    const itm = menuItems.find((m) => String(m.id) === c.cond_value);

                                    return (
                                        <div key={idx} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 text-[11px]">
                                            <UtensilsCrossed className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                            <span>Món áp dụng: <strong>{itm ? itm.name : '—'}</strong></span>
                                        </div>
                                    );
                                }

                                if (c.cond_type === 'specific_category') {
                                    const cat = menuCategories.find((ctg) => String(ctg.id) === c.cond_value);

                                    return (
                                        <div key={idx} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 text-[11px]">
                                            <Layers className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                                            <span>Danh mục: <strong>{cat ? cat.name : '—'}</strong></span>
                                        </div>
                                    );
                                }

                                return null;
                            })}
                        </div>
                    )}

                    {/* Additional meta */}
                    <div className="pt-2 space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800">
                        {(startDate || endDate) && (
                            <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                <span>
                                    Hạn dùng: {startDate ? `${startDate} ` : ''}{startDate && endDate ? '— ' : ''}{endDate ? endDate : 'Vô thời hạn'}
                                </span>
                            </div>
                        )}
                        {timeSlotsCount > 0 && (
                            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span>Áp dụng theo {timeSlotsCount} khung giờ vàng</span>
                            </div>
                        )}
                        {exclusive && (
                            <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                <span>Độc quyền (không cộng dồn KM khác)</span>
                            </div>
                        )}
                        {maxUsage && (
                            <div className="flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                <span>Tối đa {fmt(maxUsage)} lượt sử dụng</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
