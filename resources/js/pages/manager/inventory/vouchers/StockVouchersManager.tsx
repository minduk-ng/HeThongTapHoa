import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Box, ArrowDownToLine, ArrowUpFromLine, Plus } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import StockImportModal from '../ingredients/components/StockImportModal';
import DataTable, { DataTableColumn } from '../../../../components/DataTable';

interface VoucherData {
    id: number;
    voucher_code: string;
    type: 'import' | 'export';
    transacted_at: string;
    sort_key?: string;
    note: string | null;
    employee_name: string | null;
}

interface StockVouchersManagerProps {
    vouchers: VoucherData[];
    filters: { type?: string; from?: string; to?: string; search?: string };
    ingredients?: any[]; // optional, cho modal nhập từ trang này
}

const columns: DataTableColumn<VoucherData>[] = [
    { key: 'voucher_code', header: 'Mã phiếu', sortable: true, className: 'font-mono text-xs font-medium text-sky-600 dark:text-sky-400', render: (v) => v.voucher_code },
    {
        key: 'type',
        header: 'Loại',
        sortable: true,
        render: (v) => (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                v.type === 'import' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
                {v.type === 'import' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                {v.type === 'import' ? 'Nhập' : 'Xuất'}
            </span>
        ),
    },
    { key: 'transacted_at', header: 'Thời điểm', sortable: true, render: (v) => <span className="text-xs">{v.transacted_at}</span> },
    { key: 'note', header: 'Ghi chú', render: (v) => <span className="text-xs text-zinc-500">{v.note || '—'}</span> },
    { key: 'employee_name', header: 'Người tạo', render: (v) => <span className="text-xs">{v.employee_name || '—'}</span> },
];

export default function StockVouchersManager({ vouchers, filters, ingredients = [] }: StockVouchersManagerProps) {
    const [typeFilter, setTypeFilter] = useState(filters.type || 'all');
    const [from, setFrom] = useState(filters.from || '');
    const [to, setTo] = useState(filters.to || '');
    const [search, setSearch] = useState(filters.search || '');
    const [isImportOpen, setIsImportOpen] = useState(false);

    const applyFilters = () => {
        router.get('/manager/inventory/vouchers', {
            type: typeFilter === 'all' ? '' : typeFilter,
            from: from || undefined,
            to: to || undefined,
            search: search || undefined,
        }, { preserveState: true });
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Phiếu nhập / xuất kho" />
            <ManagerPageLayout
                sidebar={
                    <div>
                        <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                            <Box className="w-5 h-5 stroke-[1.5]" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý Kho</span>
                        </div>
                        <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">Phiếu kho</h1>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Lịch sử nhập / xuất nguyên liệu</p>

                        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2 mt-4">
                            <button
                                type="button"
                                onClick={() => setIsImportOpen(true)}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Tạo phiếu nhập</span>
                            </button>

                            {/* Filters */}
                            <div className="space-y-2 pt-2">
                                <select
                                    value={typeFilter}
                                    onChange={(e) => { setTypeFilter(e.target.value); }}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                                >
                                    <option value="all">Tất cả loại phiếu</option>
                                    <option value="import">Phiếu nhập</option>
                                    <option value="export">Phiếu xuất</option>
                                </select>
                                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700" />
                                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Tìm theo mã / ghi chú..."
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                                />
                                <button type="button" onClick={applyFilters} className="w-full px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl">Lọc</button>
                            </div>
                        </div>
                    </div>
                }
            >
                <div className="flex flex-col min-h-0 h-full space-y-4">
                    <DataTable
                        columns={columns}
                        rows={vouchers}
                        rowKey={(v) => v.id}
                        defaultSortKey="transacted_at"
                        defaultSortDirection="desc"
                        getSortValue={(v, key) => {
                            if (key === 'transacted_at') return v.sort_key ?? '';
                            return (v as any)[key] ?? '';
                        }}
                        onRowClick={(v) => router.get(`/manager/inventory/vouchers/${v.id}`, {}, { preserveState: true })}
                        emptyMessage="Chưa có phiếu nào"
                    />
                </div>
            </ManagerPageLayout>

            <StockImportModal
                ingredients={ingredients}
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
            />
        </DashboardLayout>
    );
}
