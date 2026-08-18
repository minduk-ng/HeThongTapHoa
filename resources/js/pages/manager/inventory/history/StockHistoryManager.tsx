import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { History, RotateCcw, Filter, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import DataTable, { DataTableColumn } from '../../../../components/DataTable';
import DatePicker from '../../../../components/DatePicker';

interface Ingredient {
    id: number;
    code: string;
    name: string;
    unit: string;
    stock_quantity: number;
}

interface HistoryRow {
    id: number;
    voucher_id: number;
    voucher_code: string;
    type: 'import' | 'export' | 'adjustment';
    transacted_at: string;
    sort_key?: string;
    change_qty: number;
    balance: number;
    unit_price: number | null;
    note: string | null;
}

interface StockHistoryManagerProps {
    ingredients: Ingredient[];
    ingredientId: number;
    rows: HistoryRow[];
    filters: { from?: string; to?: string };
}

const columns: DataTableColumn<HistoryRow>[] = [
    {
        key: 'voucher_code',
        header: 'Mã phiếu',
        align: 'center',
        sortable: true,
        className: 'font-mono text-xs font-semibold text-sky-600 dark:text-sky-400',
        render: (r) => r.voucher_code,
    },
    {
        key: 'type',
        header: 'Loại',
        align: 'center',
        sortable: true,
        render: (r) => {
            if (r.type === 'adjustment') {
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                        <SlidersHorizontal className="w-3 h-3 stroke-[1.5]" />
                        Điều chỉnh
                    </span>
                );
            }
            if (r.type === 'import') {
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <ArrowDownToLine className="w-3 h-3 stroke-[1.5]" />
                        Nhập kho
                    </span>
                );
            }
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    <ArrowUpFromLine className="w-3 h-3 stroke-[1.5]" />
                    Xuất kho
                </span>
            );
        },
    },
    {
        key: 'transacted_at',
        header: 'Thời gian',
        align: 'center',
        sortable: true,
        className: 'tabular-nums text-xs',
        render: (r) => r.transacted_at,
    },
    {
        key: 'change_qty',
        header: 'Biến động',
        align: 'center',
        sortable: true,
        render: (r) => {
            const isPos = r.change_qty > 0;
            return (
                <span className={`tabular-nums font-bold text-xs ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {isPos ? '+' : ''}{Number(r.change_qty).toLocaleString('vi-VN')}
                </span>
            );
        },
    },
    {
        key: 'balance',
        header: 'Số dư tồn',
        align: 'center',
        sortable: true,
        render: (r) => (
            <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                {Number(r.balance).toLocaleString('vi-VN')}
            </span>
        ),
    },
    {
        key: 'note',
        header: 'Ghi chú',
        align: 'left',
        className: 'text-zinc-500 dark:text-zinc-400 text-xs truncate max-w-xs',
        render: (r) => r.note || '—',
    },
];

export default function StockHistoryManager({ ingredients, ingredientId, rows, filters }: StockHistoryManagerProps) {
    const [selIngredient, setSelIngredient] = useState(ingredientId);
    const [from, setFrom] = useState(filters.from ?? '');
    const [to, setTo] = useState(filters.to ?? '');

    const applyFilters = () => {
        router.reload({
            only: ['rows', 'ingredientId'],
            data: {
                ingredient_id: selIngredient || undefined,
                from: from || undefined,
                to: to || undefined,
            },
        });
    };

    const handleReset = () => {
        setFrom('');
        setTo('');
        if (selIngredient) {
            router.reload({
                only: ['rows', 'ingredientId'],
                data: {
                    ingredient_id: selIngredient,
                },
            });
        }
    };

    const hasActiveFilter = Boolean(selIngredient || from || to);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Lịch sử biến động kho" />
            <ManagerPageLayout
                icon={History}
                title="Lịch sử biến động kho"
                subtitle="Nhật ký chi tiết các lần nhập, xuất và điều chỉnh theo từng nguyên liệu"
                badge={
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {rows.length} bản ghi
                    </span>
                }
                hasActiveFilter={hasActiveFilter}
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Select Ingredient */}
                        <div className="flex-1 min-w-[220px] max-w-xs">
                            <select
                                value={selIngredient}
                                onChange={(e) => {
                                    const nextId = Number(e.target.value);
                                    setSelIngredient(nextId);
                                    router.reload({
                                        only: ['rows', 'ingredientId'],
                                        data: {
                                            ingredient_id: nextId || undefined,
                                            from: from || undefined,
                                            to: to || undefined,
                                        },
                                    });
                                }}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 transition-colors focus:border-sky-500 outline-none font-medium"
                            >
                                <option value={0}>-- Chọn nguyên liệu xem lịch sử --</option>
                                {ingredients.map((ing) => (
                                    <option key={ing.id} value={ing.id}>
                                        {ing.name} ({ing.code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date Range */}
                        <div className="w-60">
                            <DatePicker
                                mode="range"
                                startDate={from}
                                endDate={to}
                                onChange={(s, e) => {
                                    setFrom(s ?? '');
                                    setTo(e ?? '');
                                }}
                                className="w-full justify-start text-xs rounded-xl"
                            />
                        </div>

                        {/* Filter Buttons */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={applyFilters}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors shadow-2xs"
                            >
                                <Filter className="w-3.5 h-3.5" />
                                <span>Lọc</span>
                            </button>
                            {hasActiveFilter && (
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                    title="Đặt lại bộ lọc"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Đặt lại</span>
                                </button>
                            )}
                        </div>
                    </div>
                }
            >
                <DataTable
                    columns={columns}
                    rows={rows}
                    rowKey={(r) => r.id}
                    defaultSortKey="transacted_at"
                    defaultSortDirection="desc"
                    getSortValue={(r, key) => {
                        if (key === 'transacted_at') return r.sort_key ?? '';
                        return (r as any)[key] ?? '';
                    }}
                    onRowClick={(r) => router.get(`/manager/inventory/vouchers/${r.voucher_id}`, {}, { preserveState: true })}
                    emptyMessage="Chưa có dữ liệu biến động kho"
                />
            </ManagerPageLayout>
        </DashboardLayout>
    );
}
