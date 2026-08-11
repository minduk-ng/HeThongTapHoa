import React from 'react';
import { Plus, X } from 'lucide-react';

export interface ActionRow { action_type: string; action_value: string; max_discount_amount: string; }

interface Props {
    actions: ActionRow[];
    onChange: (actions: ActionRow[]) => void;
    menuItems: { id: number; name: string }[];
}

const TYPES = [['discount_percent', 'Giảm theo phần trăm (%)'], ['discount_amount', 'Giảm theo số tiền (đ)'], ['free_product', 'Tặng món']] as const;

export default function PromotionActionsEditor({ actions, onChange, menuItems }: Props) {
    const update = (i: number, key: keyof ActionRow, value: string) =>
        onChange(actions.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)));
    const add = () => onChange([...actions, { action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
    const remove = (i: number) => onChange(actions.filter((_, idx) => idx !== i));

    return (
        <div className="space-y-3">
            {actions.map((a, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                    <select value={a.action_type} onChange={(e) => update(i, 'action_type', e.target.value)}
                        className="px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {a.action_type === 'free_product' ? (
                        <div className="flex-1 min-w-[180px]">
                            <select value={a.action_value} onChange={(e) => update(i, 'action_value', e.target.value)}
                                className="w-full px-3 py-2 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700">
                                <option value="">Chọn món tặng...</option>
                                {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            {!a.action_value && <p className="text-xs text-amber-600 mt-1">Bắt buộc chọn món tặng.</p>}
                        </div>
                    ) : (
                        <div className="relative">
                            <input type="number" value={a.action_value} onChange={(e) => update(i, 'action_value', e.target.value)}
                                placeholder={a.action_type === 'discount_percent' ? '10' : '50000'}
                                className="w-28 px-3 py-2 pr-7 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700" />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">{a.action_type === 'discount_percent' ? '%' : 'đ'}</span>
                        </div>
                    )}
                    {a.action_type === 'discount_percent' && (
                        <div className="relative">
                            <input type="number" value={a.max_discount_amount} onChange={(e) => update(i, 'max_discount_amount', e.target.value)}
                                placeholder="Mức tối đa" className="w-28 px-3 py-2 pr-7 text-xs border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700" />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">đ</span>
                        </div>
                    )}
                    <button type="button" onClick={() => remove(i)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <button type="button" onClick={add}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Thêm hành động
            </button>
        </div>
    );
}
