import React from 'react';
import { Plus, X } from 'lucide-react';

export interface ConditionRow { cond_type: string; cond_value: string; }

interface Props {
    conditions: ConditionRow[];
    onChange: (conditions: ConditionRow[]) => void;
    menuItems: { id: number; name: string }[];
    menuCategories: { id: number; name: string }[];
}

const TYPES = [['min_order_value', 'Giá trị đơn tối thiểu (đ)'], ['min_quantity', 'Số lượng món tối thiểu'], ['specific_product', 'Món cụ thể'], ['specific_category', 'Danh mục cụ thể']] as const;

export default function PromotionConditionsEditor({ conditions, onChange, menuItems, menuCategories }: Props) {
    const update = (i: number, key: keyof ConditionRow, value: string) =>
        onChange(conditions.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
    const add = () => onChange([...conditions, { cond_type: 'min_order_value', cond_value: '' }]);
    const remove = (i: number) => onChange(conditions.filter((_, idx) => idx !== i));

    return (
        <div className="space-y-3">
            {conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <select value={c.cond_type} onChange={(e) => update(i, 'cond_type', e.target.value)}
                        className="px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {c.cond_type === 'specific_product' ? (
                        <select value={c.cond_value} onChange={(e) => update(i, 'cond_value', e.target.value)}
                            className="flex-1 min-w-[180px] px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                            <option value="">Chọn món...</option>
                            {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    ) : c.cond_type === 'specific_category' ? (
                        <select value={c.cond_value} onChange={(e) => update(i, 'cond_value', e.target.value)}
                            className="flex-1 min-w-[180px] px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                            <option value="">Chọn danh mục...</option>
                            {menuCategories.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    ) : (
                        <input type="number" value={c.cond_value} onChange={(e) => update(i, 'cond_value', e.target.value)}
                            placeholder={c.cond_type === 'min_order_value' ? '200000' : '3'}
                            className="w-28 px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700" />
                    )}
                    <button type="button" onClick={() => remove(i)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <button type="button" onClick={add}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm điều kiện
            </button>
        </div>
    );
}
