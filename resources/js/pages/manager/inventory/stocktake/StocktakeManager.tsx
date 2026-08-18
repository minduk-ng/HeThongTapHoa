import { Head, router } from '@inertiajs/react';
import { Box, Save } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import DataTable from '../../../../components/DataTable';
import type { DataTableColumn } from '../../../../components/DataTable';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import DashboardLayout from '../../../../layouts/DashboardLayout';

interface Ingredient {
    id: number;
    code: string;
    name: string;
    unit: string;
    stock_quantity: number;
}

interface StocktakeManagerProps {
    ingredients: Ingredient[];
}

const staticColumns: DataTableColumn<Ingredient>[] = [
    {
        key: 'name',
        header: 'Nguyên liệu',
        align: 'left',
        sortable: true,
        render: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: 'code', header: 'Mã NVL', align: 'center', sortable: true, render: (r) => <span className="font-mono text-xs text-sky-600 dark:text-sky-400">{r.code}</span> },
    { key: 'unit', header: 'Đơn vị', align: 'center', sortable: true, render: (r) => r.unit },
    {
        key: 'stock_quantity',
        header: 'Tồn lý thuyết',
        sortable: true,
        align: 'center',
        render: (r) => (
            <span className="tabular-nums font-semibold">
                {Number(r.stock_quantity).toLocaleString('vi-VN')} {r.unit}
            </span>
        ),
    },
];

export default function StocktakeManager({ ingredients }: StocktakeManagerProps) {
    const [values, setValues] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState(false);

    const changedCount = ingredients.filter((ing) => {
        const v = values[ing.id];
        return v !== undefined && v.trim() !== '';
    }).length;

    const columns: DataTableColumn<Ingredient>[] = useMemo(
        () => [
            ...staticColumns,
            {
                key: 'actual_qty',
                header: 'Số thực tế',
                align: 'center',
                render: (r) => (
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={values[r.id] ?? ''}
                        onChange={(e) =>
                            setValues((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="—"
                        className="w-28 px-2.5 py-1 text-center text-xs tabular-nums rounded-lg border bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 mx-auto block"
                    />
                ),
            },
            {
                key: 'diff',
                header: 'Chênh lệch',
                align: 'center',
                render: (r) => {
                    const v = values[r.id];

                    if (v === undefined || v.trim() === '') {
                        return <span className="text-zinc-400">—</span>;
                    }

                    const diff = Number(v) - Number(r.stock_quantity);
                    const cls =
                        diff < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : diff > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-500';

                    return (
                        <span className={`tabular-nums font-semibold text-xs ${cls}`}>
                            {diff > 0 ? '+' : ''}
                            {diff.toLocaleString('vi-VN')} {r.unit}
                        </span>
                    );
                },
            },
        ],
        [values],
    );

    const handleSave = () => {
        const items = ingredients
            .filter((ing) => {
                const v = values[ing.id];
                return v !== undefined && v.trim() !== '';
            })
            .map((ing) => ({
                ingredient_id: ing.id,
                actual_qty: Number(values[ing.id]),
            }));

        if (items.length === 0) return;

        setSaving(true);
        router.post(
            '/manager/inventory/stocktake',
            { items },
            {
                onSuccess: () => setSaving(false),
                onError: () => setSaving(false),
            },
        );
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Kiểm kê kho" />
            <ManagerPageLayout
                icon={Box}
                title="Kiểm kê kho"
                subtitle="Nhập số lượng thực tế đếm được để đối soát với tồn lý thuyết"
                badge={
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {ingredients.length} nguyên liệu
                    </span>
                }
                actions={
                    <div className="flex items-center gap-2">
                        {changedCount > 0 && (
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800/60">
                                {changedCount} thay đổi
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || changedCount === 0}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors duration-150 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-3.5 h-3.5 stroke-[1.5]" />
                            <span>{saving ? 'Đang lưu...' : `Lưu kiểm kê (${changedCount})`}</span>
                        </button>
                    </div>
                }
            >
                <DataTable
                    columns={columns}
                    rows={ingredients}
                    rowKey={(r) => r.id}
                    defaultSortKey="name"
                    getSortValue={(r, k) => r[k as keyof Ingredient] as string | number}
                    emptyMessage="Chưa có nguyên liệu nào"
                />
            </ManagerPageLayout>
        </DashboardLayout>
    );
}
