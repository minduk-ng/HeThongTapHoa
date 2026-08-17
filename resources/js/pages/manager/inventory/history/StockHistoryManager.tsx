import { Head, router } from '@inertiajs/react';
import { Box, History } from 'lucide-react';
import { useState } from 'react';
import DataTable from '../../../../components/DataTable';
import type { DataTableColumn } from '../../../../components/DataTable';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import DashboardLayout from '../../../../layouts/DashboardLayout';

interface Ingredient {
    id: number;
    code: string;
    name: string;
    unit: string;
}

interface HistoryRow {
    transacted_at: string | null;
    voucher_code: string | null;
    type: string | null;
    quantity: number;
    note: string | null;
    balance: number;
}

interface StockHistoryManagerProps {
    ingredients: Ingredient[];
    ingredientId: number;
    rows: HistoryRow[];
    filters: { from?: string; to?: string };
}

const typeLabel: Record<string, string> = {
    import: 'Nhập',
    export: 'Xuất',
    adjustment: 'Điều chỉnh',
};

const typeClass: Record<string, string> = {
    import: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    export: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    adjustment: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
};

const columns: DataTableColumn<HistoryRow>[] = [
    {
        key: 'transacted_at',
        header: 'Thời gian',
        sortable: true,
        render: (r) => <span className="text-xs tabular-nums">{r.transacted_at ?? '—'}</span>,
    },
    {
        key: 'voucher_code',
        header: 'Phiếu',
        sortable: true,
        render: (r) => (
            <span className="font-mono text-xs font-medium text-sky-600 dark:text-sky-400">
                {r.voucher_code ?? '—'}
            </span>
        ),
    },
    {
        key: 'type',
        header: 'Loại',
        sortable: true,
        render: (r) => (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeClass[r.type ?? ''] ?? 'bg-zinc-100 text-zinc-600'}`}>
                {typeLabel[r.type ?? ''] ?? (r.type ?? '—')}
            </span>
        ),
    },
    {
        key: 'quantity',
        header: 'Số lượng',
        align: 'right',
        sortable: true,
        render: (r) => {
            const q = Number(r.quantity);
            const cls = q < 0 ? 'text-rose-600 dark:text-rose-400' : q > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500';

            return (
                <span className={`tabular-nums font-semibold ${cls}`}>
                    {q > 0 ? '+' : ''}
                    {q.toLocaleString('vi-VN')}
                </span>
            );
        },
    },
    {
        key: 'note',
        header: 'Ghi chú',
        render: (r) => <span className="text-xs text-zinc-500 dark:text-zinc-400">{r.note || '—'}</span>,
    },
    {
        key: 'balance',
        header: 'Số dư',
        align: 'right',
        sortable: true,
        render: (r) => (
            <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                {Number(r.balance).toLocaleString('vi-VN')}
            </span>
        ),
    },
];

export default function StockHistoryManager({ ingredients, ingredientId, rows, filters }: StockHistoryManagerProps) {
    const [selIngredient, setSelIngredient] = useState(ingredientId);
    const [from, setFrom] = useState(filters.from ?? '');
    const [to, setTo] = useState(filters.to ?? '');

    const applyFilters = () => {
        router.reload({
            only: ['rows'],
            data: {
                ingredient_id: selIngredient,
                from: from || undefined,
                to: to || undefined,
            },
        });
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Lịch sử tồn kho" />
            <ManagerPageLayout
                sidebar={
                    <div>
                        <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                            <Box className="w-5 h-5 stroke-[1.5]" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý Kho</span>
                        </div>
                        <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">Lịch sử tồn kho</h1>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Giao dịch nhập / xuất / điều chỉnh theo nguyên liệu</p>

                        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2 mt-4">
                            <div className="space-y-2">
                                <select
                                    value={selIngredient}
                                    onChange={(e) => setSelIngredient(Number(e.target.value))}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                                >
                                    <option value={0}>Chọn nguyên liệu</option>
                                    {ingredients.map((ing) => (
                                        <option key={ing.id} value={ing.id}>
                                            {ing.name} ({ing.code})
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="date"
                                    value={from}
                                    onChange={(e) => setFrom(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                                />
                                <input
                                    type="date"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                                />
                                <button
                                    type="button"
                                    onClick={applyFilters}
                                    disabled={!selIngredient}
                                    className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
                                >
                                    <History className="w-4 h-4" />
                                    <span>Xem lịch sử</span>
                                </button>
                            </div>
                        </div>
                    </div>
                }
            >
                <div className="flex flex-col min-h-0 h-full space-y-4">
                    <div className="flex items-center justify-between px-4 pt-4">
                        <div>
                            <h2 className="font-display text-lg text-zinc-900 dark:text-zinc-100">
                                {ingredientId ? 'Lịch sử giao dịch' : 'Chọn nguyên liệu'}
                            </h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {ingredientId ? `${rows.length} giao dịch` : 'Vui lòng chọn nguyên liệu để xem lịch sử'}
                            </p>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
                        <DataTable
                            columns={columns}
                            rows={rows}
                            rowKey={(r) => r.voucher_code ?? ''}
                            defaultSortKey="transacted_at"
                            defaultSortDirection="asc"
                            getSortValue={(r, key) => {
                                if (key === 'quantity' || key === 'balance') {
                                    return r[key];
                                }

                                return (r[key as keyof HistoryRow] as string | number | null) ?? '';
                            }}
                            emptyMessage={ingredientId ? 'Không có giao dịch nào' : 'Chưa chọn nguyên liệu'}
                        />
                    </div>
                </div>
            </ManagerPageLayout>
        </DashboardLayout>
    );
}
