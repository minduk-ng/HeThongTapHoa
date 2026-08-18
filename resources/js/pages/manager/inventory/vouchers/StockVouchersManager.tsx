import { Head, router } from '@inertiajs/react';
import { ReceiptText, Plus, RotateCcw, Filter, SlidersHorizontal } from 'lucide-react';
import React, { useState } from 'react';
import type { DataTableColumn } from '../../../../components/DataTable';
import DataTable from '../../../../components/DataTable';
import DatePicker from '../../../../components/DatePicker';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import StockImportModal from '../ingredients/components/StockImportModal';

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
        header: 'Loại phiếu',
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

            if (v.type === 'import') {
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Nhập kho
                    </span>
                );
            }

            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    Xuất kho
                </span>
            );
        },
    },
    { key: 'transacted_at', header: 'Thời gian', sortable: true, align: 'center', className: 'tabular-nums text-xs', render: (v) => v.transacted_at },
    { key: 'employee_name', header: 'Người tạo', align: 'center', render: (v) => v.employee_name || '—' },
    { key: 'note', header: 'Ghi chú', align: 'left', className: 'text-zinc-500 dark:text-zinc-400 text-xs truncate max-w-xs', render: (v) => v.note || '—' },
];

export default function StockVouchersManager({ vouchers, filters = {}, ingredients = [] }: StockVouchersManagerProps) {
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [typeFilter, setTypeFilter] = useState(filters.type || 'all');
    const [from, setFrom] = useState(filters.from || '');
    const [to, setTo] = useState(filters.to || '');
    const [search, setSearch] = useState(filters.search || '');

    const applyFilters = () => {
        router.get('/manager/inventory/vouchers', {
            type: typeFilter === 'all' ? undefined : typeFilter,
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

    const hasActiveFilter = Boolean((typeFilter && typeFilter !== 'all') || from || to || search);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý phiếu kho" />
            <ManagerPageLayout
                icon={ReceiptText}
                title="Quản lý phiếu kho"
                subtitle="Lịch sử nhập, xuất và điều chỉnh tồn kho nguyên liệu"
                badge={
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {vouchers.length} phiếu
                    </span>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <button
                        type="button"
                        onClick={() => setIsImportOpen(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl transition-colors shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5 stroke-2" />
                        <span>Tạo phiếu nhập</span>
                    </button>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="flex-1 min-w-[200px] max-w-xs">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                                placeholder="Tìm theo mã phiếu / ghi chú..."
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 transition-colors focus:border-sky-500 outline-none"
                            />
                        </div>

                        {/* Type Filter */}
                        <div className="w-44">
                            <select
                                value={typeFilter}
                                onChange={(e) => {
                                    setTypeFilter(e.target.value);
                                    router.get('/manager/inventory/vouchers', {
                                        type: e.target.value === 'all' ? undefined : e.target.value,
                                        from: from || undefined,
                                        to: to || undefined,
                                        search: search || undefined,
                                    }, { preserveState: true });
                                }}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 transition-colors focus:border-sky-500 outline-none"
                            >
                                <option value="all">Tất cả loại phiếu</option>
                                <option value="import">Phiếu nhập</option>
                                <option value="export">Phiếu xuất</option>
                                <option value="adjustment">Phiếu điều chỉnh</option>
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

                        {/* Filter / Reset Buttons */}
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
                    rows={vouchers}
                    rowKey={(v) => v.id}
                    defaultSortKey="transacted_at"
                    defaultSortDirection="desc"
                    getSortValue={(v, key) => {
                        if (key === 'transacted_at') {
return v.sort_key ?? '';
}

                        return (v as any)[key] ?? '';
                    }}
                    onRowClick={(v) => router.get(`/manager/inventory/vouchers/${v.id}`, {}, { preserveState: true })}
                    emptyMessage="Chưa có phiếu nào"
                />
            </ManagerPageLayout>

            <StockImportModal
                ingredients={ingredients}
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
            />
        </DashboardLayout>
    );
}
