import React from 'react';
import { Plus, Trash2, Percent, Coins, Gift, AlertCircle, Info } from 'lucide-react';

export interface ActionRow {
    action_type: string;
    action_value: string;
    max_discount_amount: string;
}

interface Props {
    actions: ActionRow[];
    onChange: (actions: ActionRow[]) => void;
    menuItems: { id: number; name: string }[];
}

const ALL_TYPES = [
    { value: 'discount_percent', label: 'Giảm theo phần trăm (%)', icon: Percent, desc: 'Giảm theo tỷ lệ % trên tổng hoá đơn' },
    { value: 'discount_amount', label: 'Giảm theo số tiền cố định (đ)', icon: Coins, desc: 'Trừ trực tiếp số tiền cụ thể vào hoá đơn' },
    { value: 'free_product', label: 'Tặng món miễn phí', icon: Gift, desc: 'Tặng 1 món trong thực đơn khi áp dụng' },
] as const;

export default function PromotionActionsEditor({ actions, onChange, menuItems }: Props) {
    const update = (i: number, key: keyof ActionRow, value: string) => {
        const next = actions.map((a, idx) => {
            if (idx !== i) return a;
            const updated = { ...a, [key]: value };
            if (key === 'action_type') {
                updated.action_value = '';
                updated.max_discount_amount = '';
            }
            return updated;
        });
        onChange(next);
    };

    const hasPercent = actions.some((a) => a.action_type === 'discount_percent');
    const hasAmount = actions.some((a) => a.action_type === 'discount_amount');
    const selectedFreeItemIds = actions
        .filter((a) => a.action_type === 'free_product' && a.action_value)
        .map((a) => String(a.action_value));

    // Kiểm tra loại nào còn khả dụng để thêm mới
    const isTypeAvailableForAdd = (typeVal: string) => {
        if (typeVal === 'discount_percent') {
            return !hasPercent && !hasAmount;
        }
        if (typeVal === 'discount_amount') {
            return !hasPercent && !hasAmount;
        }
        if (typeVal === 'free_product') {
            // Còn món chưa được tặng
            return selectedFreeItemIds.length < menuItems.length;
        }
        return false;
    };

    const canAddMore = ALL_TYPES.some((t) => isTypeAvailableForAdd(t.value));

    const add = () => {
        let nextType = 'discount_percent';
        if (hasPercent || hasAmount) {
            nextType = 'free_product';
        }
        onChange([...actions, { action_type: nextType, action_value: '', max_discount_amount: '' }]);
    };

    const remove = (i: number) => {
        onChange(actions.filter((_, idx) => idx !== i));
    };

    return (
        <div className="space-y-3">
            {actions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-center">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                        Chưa có hành động giảm giá nào. Vui lòng thêm ít nhất 1 mức giảm giá.
                    </p>
                </div>
            ) : (
                actions.map((a, i) => {
                    const currentTypeInfo = ALL_TYPES.find((t) => t.value === a.action_type);
                    const TypeIcon = currentTypeInfo?.icon ?? Percent;

                    // Các options hợp lệ cho dòng này
                    const allowedTypesForRow = ALL_TYPES.filter((t) => {
                        if (t.value === a.action_type) return true;
                        if (t.value === 'discount_percent') return !hasPercent && !hasAmount;
                        if (t.value === 'discount_amount') return !hasPercent && !hasAmount;
                        if (t.value === 'free_product') return true;
                        return false;
                    });

                    // Lọc danh sách món tặng không bị trùng với các dòng free_product khác
                    const availableMenuItems = menuItems.filter(
                        (m) => String(m.id) === a.action_value || !selectedFreeItemIds.includes(String(m.id))
                    );

                    return (
                        <div
                            key={i}
                            className="group relative rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 transition-all dark:border-zinc-800/80 dark:bg-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                {/* Action Type Selector */}
                                <div className="flex-1 min-w-[200px] space-y-1">
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                        Hình thức giảm
                                    </label>
                                    <div className="relative flex items-center">
                                        <div className="pointer-events-none absolute left-3 text-sky-600 dark:text-sky-400">
                                            <TypeIcon className="h-4 w-4 stroke-[1.5]" />
                                        </div>
                                        <select
                                            value={a.action_type}
                                            onChange={(e) => update(i, 'action_type', e.target.value)}
                                            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-9 text-xs font-medium text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                                        >
                                            {allowedTypesForRow.map((t) => (
                                                <option key={t.value} value={t.value}>
                                                    {t.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Dynamic Values based on Action Type */}
                                {a.action_type === 'discount_percent' && (
                                    <>
                                        <div className="w-28 space-y-1">
                                            <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                                Mức giảm (%) <span className="text-rose-500">*</span>
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={100}
                                                    step="any"
                                                    value={a.action_value}
                                                    onChange={(e) => update(i, 'action_value', e.target.value)}
                                                    placeholder="VD: 15"
                                                    className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-7 pl-3 text-xs font-bold tabular-nums text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                />
                                                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-bold text-zinc-400">
                                                    %
                                                </span>
                                            </div>
                                        </div>

                                        <div className="w-36 space-y-1">
                                            <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                                Giảm tối đa (đ)
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1000}
                                                    value={a.max_discount_amount}
                                                    onChange={(e) => update(i, 'max_discount_amount', e.target.value)}
                                                    placeholder="Không giới hạn"
                                                    className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-7 pl-3 text-xs tabular-nums text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                />
                                                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-semibold text-zinc-400">
                                                    đ
                                                </span>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {a.action_type === 'discount_amount' && (
                                    <div className="w-40 space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                            Số tiền giảm (đ) <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={1000}
                                                step={1000}
                                                value={a.action_value}
                                                onChange={(e) => update(i, 'action_value', e.target.value)}
                                                placeholder="VD: 50000"
                                                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-7 pl-3 text-xs font-bold tabular-nums text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                            />
                                            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-bold text-zinc-400">
                                                đ
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {a.action_type === 'free_product' && (
                                    <div className="flex-1 min-w-[220px] space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                            Món tặng kèm miễn phí <span className="text-rose-500">*</span>
                                        </label>
                                        <select
                                            value={a.action_value}
                                            onChange={(e) => update(i, 'action_value', e.target.value)}
                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                        >
                                            <option value="">-- Chọn món tặng --</option>
                                            {availableMenuItems.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Remove Button */}
                                <div className="pt-5">
                                    <button
                                        type="button"
                                        onClick={() => remove(i)}
                                        className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                                        title="Xóa hành động này"
                                    >
                                        <Trash2 className="h-4 w-4 stroke-[1.5]" />
                                    </button>
                                </div>
                            </div>

                            {/* Validation warning */}
                            {a.action_type === 'free_product' && !a.action_value && (
                                <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Vui lòng chọn món tặng cụ thể từ danh sách thực đơn.
                                </p>
                            )}
                            {a.action_type === 'discount_percent' && Number(a.action_value) > 100 && (
                                <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Mức giảm phần trăm không được vượt quá 100%.
                                </p>
                            )}
                        </div>
                    );
                })
            )}

            {/* Add Action Button */}
            {canAddMore ? (
                <button
                    type="button"
                    onClick={add}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sky-300 bg-sky-50/50 py-2.5 text-xs font-semibold text-sky-600 transition-colors hover:bg-sky-100/70 dark:border-sky-700/60 dark:bg-sky-950/20 dark:text-sky-400 dark:hover:bg-sky-900/40"
                >
                    <Plus className="h-3.5 w-3.5 stroke-2" />
                    <span>Thêm hành động giảm giá / quà tặng</span>
                </button>
            ) : (
                <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100/80 px-3 py-2 text-[11px] text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                    <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span>
                        Đã cấu hình đủ loại hành động giảm giá. Mỗi chương trình chỉ áp dụng 1 mức giảm giá chính (% hoặc tiền mặt) và các món quà tặng không trùng lặp.
                    </span>
                </div>
            )}
        </div>
    );
}
