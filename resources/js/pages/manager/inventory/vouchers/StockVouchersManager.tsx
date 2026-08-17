import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Box, ArrowDownToLine, ArrowUpFromLine, Plus, CalendarDays, RotateCcw, Filter, SlidersHorizontal } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import StockImportModal from '../ingredients/components/StockImportModal';
import DataTable, { DataTableColumn } from '../../../../components/DataTable';
import DatePicker from '../../../../components/DatePicker';

interface VoucherData {
    id: number;
    voucher_code: string;
    type: 'import' | 'export' | 'adjustment';
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
    { key: 'voucher_code', header: 'Mã phiếu', sortable: true, align: 'center', className: 'font-mono text-xs font-medium text-sky-600 dark:text-sky-400', render: (v) => v.voucher_code },
    {
        key: 'type',
        header: 'Loại',
        sortable: true,
        align: 'center',
        render: (v) => {
            if (v.type === 'adjustment') {
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                        <SlidersHorizontal className="w-3 h-3 stroke-[1.5]" />
                        Điều chỉnh
                    </span>
                );
            }
            return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    v.type === 'import' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                }`}>
                    {v.type === 'import' ? <ArrowDownToLine className="w-3 h-3 stroke-[1.5]" /> : <ArrowUpFromLine className="w-3 h-3 stroke-[1.5]" />}
                    {v.type === 'import' ? 'Nhập' : 'Xuất'}
                </span>
            );
        },
    },
    { key: 'transacted_at', header: 'Thời điểm', sortable: true, align: 'center', render: (v) => <span className="text-xs tabular-nums">{v.transacted_at}</span> },
    { key: 'note', header: 'Ghi chú', align: 'left', render: (v) => <span className="text-xs text-zinc-500 dark:text-zinc-400">{v.note || '—'}</span> },
    { key: 'employee_name', header: 'Người tạo', align: 'center', render: (v) => <span className="text-xs">{v.employee_name || '—'}</span> },
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

    const handleReset = () => {
        setTypeFilter('all');
        setFrom('');
        setTo('');
        setSearch('');
        router.get('/manager/inventory/vouchers', {}, { preserveState: true });
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
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
                            >
                                <Plus className="w-4 h-4 stroke-[1.5]" />
                                <span>Tạo phiếu nhập</span>
                            </button>

                            {/* Filters */}
                            <div className="space-y-3 pt-3">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Loại phiếu</label>
                                    <select
                                        value={typeFilter}
                                        onChange={(e) => { setTypeFilter(e.target.value); }}
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 transition-colors focus:border-sky-500 outline-none"
                                    >
                                        <option value="all">Tất cả loại phiếu</option>
                                        <option value="import">Phiếu nhập</option>
                                        <option value="export">Phiếu xuất</option>
                                        <option value="adjustment">Phiếu điều chỉnh</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="flex items-center space-x-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                        <CalendarDays className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>Khoảng thời gian</span>
                                    </label>
                                    <DatePicker
                                        mode="range"
                                        startDate={from}
                                        endDate={to}
                                        onChange={(s, e) => {
                                            setFrom(s ?? '');
                                            setTo(e ?? '');
                                        }}
                                        className="w-full justify-start text-xs"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Tìm kiếm</label>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Tìm theo mã / ghi chú..."
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 transition-colors focus:border-sky-500 outline-none"
                                    />
                                </div>

                                <div className="flex items-center space-x-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={applyFilters}
                                        className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors"
                                    >
                                        <Filter className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>Lọc</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="flex items-center justify-center space-x-1 px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>Đặt lại</span>
                                    </button>
                                </div>
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
