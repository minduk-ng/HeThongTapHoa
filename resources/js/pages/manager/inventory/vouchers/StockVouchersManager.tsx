import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Box, ArrowDownToLine, ArrowUpFromLine, Plus } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import StockImportModal from '../ingredients/components/StockImportModal';

interface VoucherData {
    id: number;
    voucher_code: string;
    type: 'import' | 'export';
    transacted_at: string;
    note: string | null;
    employee_name: string | null;
}

interface VoucherDetailItem {
    ingredient_id: number;
    name: string;
    unit: string;
    code: string | null;
    quantity: number;
    unit_price: number | null;
    total: number;
}

interface VoucherDetail {
    voucher: VoucherData;
    items: VoucherDetailItem[];
}

interface StockVouchersManagerProps {
    vouchers: VoucherData[];
    filters: { type?: string; from?: string; to?: string; search?: string };
    detail?: VoucherDetail | null;
    ingredients?: any[]; // optional, cho modal nhập từ trang này
}

export default function StockVouchersManager({ vouchers, filters, detail, ingredients = [] }: StockVouchersManagerProps) {
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
                <div className="space-y-4">
                    {/* Detail (pivot bảng ngang) */}
                    {detail && (
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {detail.voucher.voucher_code}
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        detail.voucher.type === 'import' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {detail.voucher.type === 'import' ? 'Phiếu nhập' : 'Phiếu xuất'}
                                    </span>
                                </h3>
                                <span className="text-xs text-zinc-500">{detail.voucher.transacted_at}</span>
                            </div>
                            {/* Pivot: cột = nguyên liệu, 1 dòng giá trị */}
                            <div className="overflow-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-zinc-50 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400">
                                            <th className="px-3 py-2">Mã NVL</th>
                                            <th className="px-3 py-2">Nguyên liệu</th>
                                            <th className="px-3 py-2 text-right">Số lượng</th>
                                            <th className="px-3 py-2 text-right">Đơn giá</th>
                                            <th className="px-3 py-2 text-right">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.items.map((it) => (
                                            <tr key={it.ingredient_id} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-3 py-2 font-mono text-xs">{it.code || `NVL${String(it.ingredient_id).padStart(5, '0')}`}</td>
                                                <td className="px-3 py-2">{it.name}</td>
                                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${it.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {it.quantity > 0 ? '+' : ''}{it.quantity.toLocaleString('vi-VN')} {it.unit}
                                                </td>
                                                <td className="px-3 py-2 text-right">{it.unit_price != null ? it.unit_price.toLocaleString('vi-VN') : '—'}</td>
                                                <td className="px-3 py-2 text-right">{it.total.toLocaleString('vi-VN')} đ</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* List */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400 text-xs border-b border-zinc-200 dark:border-zinc-800">
                                <tr>
                                    <th className="px-4 py-3">Mã phiếu</th>
                                    <th className="px-4 py-3">Loại</th>
                                    <th className="px-4 py-3">Thời điểm</th>
                                    <th className="px-4 py-3">Ghi chú</th>
                                    <th className="px-4 py-3">Người tạo</th>
                                    <th className="px-4 py-3 text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {vouchers.length === 0 ? (
                                    <tr><td colSpan={6} className="py-12 px-6 text-center text-zinc-500">Chưa có phiếu nào</td></tr>
                                ) : vouchers.map((v) => (
                                    <tr key={v.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-pointer" onClick={() => router.get(`/manager/inventory/vouchers/${v.id}`, {}, { preserveState: true })}>
                                        <td className="px-4 py-3 font-mono text-xs font-medium text-sky-600 dark:text-sky-400">{v.voucher_code}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                v.type === 'import' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {v.type === 'import' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                                                {v.type === 'import' ? 'Nhập' : 'Xuất'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs">{v.transacted_at}</td>
                                        <td className="px-4 py-3 text-xs text-zinc-500">{v.note || '—'}</td>
                                        <td className="px-4 py-3 text-xs">{v.employee_name || '—'}</td>
                                        <td className="px-4 py-3 text-center text-xs text-blue-600">Xem chi tiết</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
