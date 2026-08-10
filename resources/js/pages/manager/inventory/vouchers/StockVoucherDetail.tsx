import React from 'react';
import { Head, router } from '@inertiajs/react';
import { ArrowLeft, Box, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';

interface VoucherItemData {
    ingredient_id: number;
    code: string | null;
    name: string;
    unit: string;
    quantity: number;
    unit_price: number | null;
    total: number;
}

interface VoucherDetailProps {
    voucher: {
        id: number;
        voucher_code: string;
        type: 'import' | 'export';
        transacted_at: string;
        note: string | null;
        employee_name: string | null;
    };
    items: VoucherItemData[];
    total: number | null;
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

export default function StockVoucherDetail({ voucher, items, total }: VoucherDetailProps) {
    const isImport = voucher.type === 'import';

    return (
        <DashboardLayout fullWidth={true}>
            <Head title={`Phiếu ${voucher.voucher_code}`} />
            <div className="flex-1 flex flex-col h-full w-full min-h-0 overflow-hidden">
                <div className="flex-1 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs flex flex-col min-w-0 min-h-0 overflow-hidden">
                    <div className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() => router.get('/manager/inventory/vouchers')}
                                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div className="flex items-center space-x-2.5">
                                    <Box className="w-5 h-5 text-sky-500" />
                                    <h1 className="font-display text-2xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {voucher.voucher_code}
                                    </h1>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                                        isImport
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    }`}>
                                        {isImport ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                                        {isImport ? 'Phiếu nhập' : 'Phiếu xuất'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="mx-6 mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 text-sm">
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Mã phiếu</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{voucher.voucher_code}</span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Loại phiếu</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{isImport ? 'Phiếu nhập' : 'Phiếu xuất'}</span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Thời điểm</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{voucher.transacted_at}</span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Người tạo</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{voucher.employee_name || '—'}</span>
                            </div>
                        </div>

                        {voucher.note && (
                            <div className="mx-6 mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                                <span className="font-medium text-zinc-600 dark:text-zinc-300">Ghi chú:</span> {voucher.note}
                            </div>
                        )}

                        <div className="flex-1 overflow-auto min-h-0 px-6 pt-4">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                                Nguyên liệu ({items.length})
                            </h2>
                            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90">
                                        <tr className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                            <th className="px-3 py-2">Mã NVL</th>
                                            <th className="px-3 py-2">Nguyên liệu</th>
                                            <th className="px-3 py-2 text-right">Số lượng</th>
                                            <th className="px-3 py-2 text-right">Đơn giá</th>
                                            <th className="px-3 py-2 text-right">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                        {items.map((it) => (
                                            <tr key={it.ingredient_id}>
                                                <td className="px-3 py-2 font-mono text-xs text-sky-600 dark:text-sky-400">{it.code || `NVL${String(it.ingredient_id).padStart(5, '0')}`}</td>
                                                <td className="px-3 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{it.name}</td>
                                                <td className={`px-3 py-2 text-right text-sm font-bold tabular-nums ${it.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {it.quantity > 0 ? '+' : ''}{it.quantity.toLocaleString('vi-VN')} {it.unit}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
                                                    {it.unit_price != null ? formatCurrency(it.unit_price) : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
                                                    {isImport ? formatCurrency(it.total) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                        {isImport && total != null && (
                                            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
                                                <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                                    Tổng giá trị
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                                    {formatCurrency(total)}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
