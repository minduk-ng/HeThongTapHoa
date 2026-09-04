import { Plus, Trash2, Coins, ShoppingBag, UtensilsCrossed, Layers, Info } from 'lucide-react';
import React from 'react';

export interface ConditionRow {
    cond_type: string;
    cond_value: string;
}

interface Props {
    conditions: ConditionRow[];
    onChange: (conditions: ConditionRow[]) => void;
    menuItems: { id: number; name: string }[];
    menuCategories: { id: number; name: string }[];
}

const ALL_COND_TYPES = [
    { value: 'min_order_value', label: 'Giá trị đơn tối thiểu (đ)', icon: Coins, desc: 'Chỉ áp dụng khi hoá đơn đạt từ mức này trở lên' },
    { value: 'min_quantity', label: 'Số lượng món tối thiểu', icon: ShoppingBag, desc: 'Chỉ áp dụng khi tổng số món trong đơn đạt từ mức này' },
    { value: 'specific_product', label: 'Áp dụng cho món cụ thể', icon: UtensilsCrossed, desc: 'Chỉ áp dụng khi đơn hàng có món này' },
    { value: 'specific_category', label: 'Áp dụng cho danh mục cụ thể', icon: Layers, desc: 'Chỉ áp dụng khi đơn có món thuộc danh mục này' },
] as const;

export default function PromotionConditionsEditor({
    conditions,
    onChange,
    menuItems,
    menuCategories,
}: Props) {
    const update = (i: number, key: keyof ConditionRow, value: string) => {
        const next = conditions.map((c, idx) => {
            if (idx !== i) {
return c;
}

            const updated = { ...c, [key]: value };

            if (key === 'cond_type') {
                updated.cond_value = '';
            }

            return updated;
        });
        onChange(next);
    };

    const hasMinOrder = conditions.some((c) => c.cond_type === 'min_order_value');
    const hasMinQty = conditions.some((c) => c.cond_type === 'min_quantity');
    const selectedProductIds = conditions
        .filter((c) => c.cond_type === 'specific_product' && c.cond_value)
        .map((c) => String(c.cond_value));
    const selectedCategoryIds = conditions
        .filter((c) => c.cond_type === 'specific_category' && c.cond_value)
        .map((c) => String(c.cond_value));

    // Kiểm tra loại điều kiện nào còn có thể thêm mới
    const isTypeAvailableForAdd = (typeVal: string) => {
        if (typeVal === 'min_order_value') {
return !hasMinOrder;
}

        if (typeVal === 'min_quantity') {
return !hasMinQty;
}

        if (typeVal === 'specific_product') {
return selectedProductIds.length < menuItems.length;
}

        if (typeVal === 'specific_category') {
return selectedCategoryIds.length < menuCategories.length;
}

        return false;
    };

    const canAddMore = ALL_COND_TYPES.some((t) => isTypeAvailableForAdd(t.value));

    const add = () => {
        // Tìm loại điều kiện đầu tiên còn khả dụng
        const firstAvailable = ALL_COND_TYPES.find((t) => isTypeAvailableForAdd(t.value))?.value || 'min_order_value';
        onChange([...conditions, { cond_type: firstAvailable, cond_value: '' }]);
    };

    const remove = (i: number) => {
        onChange(conditions.filter((_, idx) => idx !== i));
    };

    return (
        <div className="space-y-3">
            {conditions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700/60 bg-zinc-50/50 dark:bg-zinc-800/20 p-4 text-center">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Chưa có điều kiện nào. Chương trình sẽ áp dụng cho tất cả các đơn hàng không giới hạn giá trị.
                    </p>
                </div>
            ) : (
                conditions.map((c, i) => {
                    const currentTypeInfo = ALL_COND_TYPES.find((t) => t.value === c.cond_type);
                    const TypeIcon = currentTypeInfo?.icon ?? Coins;

                    // Các options hợp lệ cho dòng này
                    const allowedTypesForRow = ALL_COND_TYPES.filter((t) => {
                        if (t.value === c.cond_type) {
return true;
}

                        if (t.value === 'min_order_value') {
return !hasMinOrder;
}

                        if (t.value === 'min_quantity') {
return !hasMinQty;
}

                        if (t.value === 'specific_product') {
return selectedProductIds.length < menuItems.length;
}

                        if (t.value === 'specific_category') {
return selectedCategoryIds.length < menuCategories.length;
}

                        return false;
                    });

                    // Lọc món / danh mục không bị trùng với các dòng khác
                    const availableMenuItems = menuItems.filter(
                        (m) => String(m.id) === c.cond_value || !selectedProductIds.includes(String(m.id))
                    );
                    const availableCategories = menuCategories.filter(
                        (cat) => String(cat.id) === c.cond_value || !selectedCategoryIds.includes(String(cat.id))
                    );

                    return (
                        <div
                            key={i}
                            className="group relative rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 transition-colors dark:border-zinc-800/80 dark:bg-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                {/* Condition Type Selector */}
                                <div className="flex-1 min-w-[200px] space-y-1">
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                        Loại điều kiện
                                    </label>
                                    <div className="relative flex items-center">
                                        <div className="pointer-events-none absolute left-3 text-sky-600 dark:text-sky-400">
                                            <TypeIcon className="h-4 w-4 stroke-[1.5]" />
                                        </div>
                                        <select
                                            value={c.cond_type}
                                            onChange={(e) => update(i, 'cond_type', e.target.value)}
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

                                {/* Dynamic Values based on Condition Type */}
                                {c.cond_type === 'min_order_value' && (
                                    <div className="w-44 space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                            Đơn tối thiểu (đ) <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={1000}
                                                step={5000}
                                                value={c.cond_value}
                                                onChange={(e) => update(i, 'cond_value', e.target.value)}
                                                placeholder="VD: 150000"
                                                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-7 pl-3 text-xs font-bold tabular-nums text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                            />
                                            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-bold text-zinc-400">
                                                đ
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {c.cond_type === 'min_quantity' && (
                                    <div className="w-32 space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                            Số lượng món <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={1}
                                                step={1}
                                                value={c.cond_value}
                                                onChange={(e) => update(i, 'cond_value', e.target.value)}
                                                placeholder="VD: 2"
                                                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-10 pl-3 text-xs font-bold tabular-nums text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                            />
                                            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-semibold text-zinc-400">
                                                món
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {c.cond_type === 'specific_product' && (
                                    <div className="flex-1 min-w-[220px] space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                            Món ăn áp dụng <span className="text-rose-500">*</span>
                                        </label>
                                        <select
                                            value={c.cond_value}
                                            onChange={(e) => update(i, 'cond_value', e.target.value)}
                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                        >
                                            <option value="">-- Chọn món trong thực đơn --</option>
                                            {availableMenuItems.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {c.cond_type === 'specific_category' && (
                                    <div className="flex-1 min-w-[220px] space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                            Danh mục áp dụng <span className="text-rose-500">*</span>
                                        </label>
                                        <select
                                            value={c.cond_value}
                                            onChange={(e) => update(i, 'cond_value', e.target.value)}
                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-800 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                        >
                                            <option value="">-- Chọn danh mục --</option>
                                            {availableCategories.map((cat) => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.name}
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
                                        title="Xóa điều kiện này"
                                    >
                                        <Trash2 className="h-4 w-4 stroke-[1.5]" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}

            {/* Add Condition Button */}
            {canAddMore ? (
                <button
                    type="button"
                    onClick={add}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 py-2.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
                >
                    <Plus className="h-3.5 w-3.5 stroke-2" />
                    <span>Thêm điều kiện áp dụng</span>
                </button>
            ) : (
                <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100/80 px-3 py-2 text-[11px] text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                    <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span>
                        Đã thêm tất cả các loại điều kiện hợp lệ (Đơn tối thiểu, Số lượng món, Món & Danh mục cụ thể).
                    </span>
                </div>
            )}
        </div>
    );
}
