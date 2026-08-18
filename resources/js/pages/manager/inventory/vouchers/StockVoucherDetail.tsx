import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import {
    ArrowLeft,
    Box,
    ArrowDownToLine,
    ArrowUpFromLine,
    SlidersHorizontal,
    ChevronRight,
    UtensilsCrossed,
    Layers,
    ChevronsUpDown,
    ChevronsDownUp,
    Info,
    Receipt,
    Eye,
    EyeOff,
} from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';

interface ChildUsageData {
    product_id: number;
    product_name: string;
    product_quantity: number;
    recipe_amount: number;
    unit: string;
    total_quantity: number;
}

interface VoucherItemData {
    ingredient_id: number;
    code: string | null;
    name: string;
    unit: string;
    quantity: number;
    unit_price: number | null;
    total: number;
    children?: ChildUsageData[];
}

interface SoldProductData {
    id: number;
    name: string;
    quantity: number;
}

interface VoucherDetailProps {
    voucher: {
        id: number;
        voucher_code: string;
        type: 'import' | 'export' | 'adjustment';
        transacted_at: string;
        note: string | null;
        employee_name: string | null;
    };
    products?: SoldProductData[];
    items: VoucherItemData[];
    total: number | null;
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

export default function StockVoucherDetail({ voucher, products = [], items, total }: VoucherDetailProps) {
    const isImport = voucher.type === 'import';
    const isExport = voucher.type === 'export';
    const isAdjustment = voucher.type === 'adjustment';

    const typeLabel = isAdjustment ? 'Phiếu điều chỉnh' : isImport ? 'Phiếu nhập' : 'Phiếu xuất';

    // Mặc định ẩn danh sách các món trong hoá đơn
    const [showProducts, setShowProducts] = useState(false);

    // State lưu danh sách ID các dòng cha đang được mở rộng (expanded)
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>(() => {
        const init: Record<number, boolean> = {};
        items.forEach((it) => {
            if (it.children && it.children.length > 0) {
                init[it.ingredient_id] = true;
            }
        });
        return init;
    });

    const toggleRow = (ingredientId: number) => {
        setExpandedRows((prev) => ({
            ...prev,
            [ingredientId]: !prev[ingredientId],
        }));
    };

    const hasAnyChildren = items.some((it) => it.children && it.children.length > 0);
    const areAllExpanded = items.every(
        (it) => !it.children || it.children.length === 0 || expandedRows[it.ingredient_id]
    );

    const toggleExpandAll = () => {
        if (areAllExpanded) {
            setExpandedRows({});
        } else {
            const next: Record<number, boolean> = {};
            items.forEach((it) => {
                if (it.children && it.children.length > 0) {
                    next[it.ingredient_id] = true;
                }
            });
            setExpandedRows(next);
        }
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title={`Phiếu ${voucher.voucher_code}`} />
            <div className="flex-1 flex flex-col h-full w-full min-h-0 overflow-hidden">
                <div className="flex-1 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs flex flex-col min-w-0 min-h-0 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() => router.get('/manager/inventory/vouchers')}
                                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
                                    title="Quay lại danh sách phiếu"
                                >
                                    <ArrowLeft className="w-5 h-5 stroke-[1.5]" />
                                </button>
                                <div className="flex items-center space-x-2.5">
                                    <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
                                        <Box className="w-5 h-5 stroke-[1.5]" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h1 className="font-display text-2xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                                {voucher.voucher_code}
                                            </h1>
                                            <span
                                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                                                    isAdjustment
                                                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                                        : isImport
                                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                }`}
                                            >
                                                {isAdjustment ? (
                                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                                ) : isImport ? (
                                                    <ArrowDownToLine className="w-3.5 h-3.5" />
                                                ) : (
                                                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                                                )}
                                                {typeLabel}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Content Body */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
                        {/* Meta Card */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 text-sm shrink-0">
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Mã phiếu</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                    {voucher.voucher_code}
                                </span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Loại phiếu</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{typeLabel}</span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Thời điểm</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                    {voucher.transacted_at}
                                </span>
                            </div>
                            <div>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Người tạo</span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {voucher.employee_name || '—'}
                                </span>
                            </div>

                            {voucher.note && (
                                <div className="col-span-2 md:col-span-4 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                                        <span className="font-semibold text-zinc-600 dark:text-zinc-400">Ghi chú:</span>
                                        <span>{voucher.note}</span>
                                    </div>

                                    {/* Nút nhỏ ở phần hoá đơn để mở/ẩn danh sách món */}
                                    {isExport && products && products.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowProducts(!showProducts)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-sky-300 dark:border-sky-700/60 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors shadow-2xs"
                                        >
                                            {showProducts ? (
                                                <>
                                                    <EyeOff className="w-3.5 h-3.5 stroke-[1.5]" />
                                                    <span>Ẩn món trong hoá đơn</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Eye className="w-3.5 h-3.5 stroke-[1.5]" />
                                                    <span>Xem món trong hoá đơn ({products.length})</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Top Table for Export Vouchers: Sold Menu Items in Invoices/Orders (Chỉ hiển thị khi bấm nút) */}
                        {isExport && products && products.length > 0 && showProducts && (
                            <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs shrink-0 transition-all duration-200">
                                <div className="flex items-center justify-between px-4 py-3 bg-zinc-50/80 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                            <Receipt className="w-4 h-4 stroke-[1.5]" />
                                        </div>
                                        <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            Danh sách món trong hoá đơn / phiếu xuất
                                        </h3>
                                    </div>
                                    <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                        {products.length} món
                                    </span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-zinc-50/50 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            <tr>
                                                <th className="px-4 py-2.5 text-center w-16">STT</th>
                                                <th className="px-4 py-2.5 text-left">Tên món</th>
                                                <th className="px-4 py-2.5 text-center w-36">Số lượng bán</th>
                                                <th className="px-4 py-2.5 text-center w-44">Trạng thái trừ kho</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                            {products.map((p, idx) => (
                                                <tr key={p.id || idx} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                                                    <td className="px-4 py-2.5 text-center text-xs text-zinc-400 tabular-nums">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-left font-medium text-zinc-900 dark:text-zinc-100">
                                                        <div className="flex items-center gap-2">
                                                            <UtensilsCrossed className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                                            <span>{p.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                                        {p.quantity.toLocaleString('vi-VN')} phần/ly
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                            Đã trừ định lượng
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Bottom Table: Ingredients Breakdown (Cha - Con Accordion) */}
                        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
                            <div className="flex items-center justify-between px-4 py-3 bg-zinc-50/80 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                                        <Layers className="w-4 h-4 stroke-[1.5]" />
                                    </div>
                                    <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        {isExport
                                            ? 'Chi tiết nguyên liệu xuất kho & Định lượng món (Cha — Con)'
                                            : `Chi tiết nguyên liệu (${items.length})`}
                                    </h3>
                                </div>

                                {isExport && hasAnyChildren && (
                                    <button
                                        type="button"
                                        onClick={toggleExpandAll}
                                        className="flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                                    >
                                        {areAllExpanded ? (
                                            <>
                                                <ChevronsDownUp className="w-3.5 h-3.5 text-zinc-400" />
                                                <span>Thu gọn tất cả</span>
                                            </>
                                        ) : (
                                            <>
                                                <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                                                <span>Mở rộng tất cả</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-zinc-50/50 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                        <tr>
                                            {isExport && <th className="w-10 px-3 py-2.5 text-center"></th>}
                                            <th className="px-4 py-2.5 text-center w-28">Mã NVL</th>
                                            <th className="px-4 py-2.5 text-left">Tên nguyên liệu / Món tiêu hao</th>
                                            <th className="px-4 py-2.5 text-center w-36">
                                                {isExport ? 'Tổng lượng xuất' : 'Số lượng'}
                                            </th>
                                            <th className="px-4 py-2.5 text-center w-36">Đơn giá</th>
                                            <th className="px-4 py-2.5 text-center w-40">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                        {items.map((it) => {
                                            const hasChildren = it.children && it.children.length > 0;
                                            const isExpanded = !!expandedRows[it.ingredient_id];

                                            return (
                                                <React.Fragment key={it.ingredient_id}>
                                                    {/* Parent Row (Nguyên liệu cha) */}
                                                    <tr
                                                        onClick={() => hasChildren && toggleRow(it.ingredient_id)}
                                                        className={`transition-colors ${
                                                            hasChildren
                                                                ? 'cursor-pointer hover:bg-sky-50/40 dark:hover:bg-sky-950/20'
                                                                : 'hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40'
                                                        } ${isExpanded ? 'bg-sky-50/20 dark:bg-sky-950/10' : ''}`}
                                                    >
                                                        {isExport && (
                                                            <td className="px-3 py-3 text-center">
                                                                {hasChildren ? (
                                                                    <div className="flex items-center justify-center">
                                                                        <ChevronRight
                                                                            className={`w-4 h-4 text-sky-600 dark:text-sky-400 transition-transform duration-200 ${
                                                                                isExpanded ? 'rotate-90' : ''
                                                                            }`}
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                                                )}
                                                            </td>
                                                        )}
                                                        <td className="px-4 py-3 text-center font-mono text-xs font-semibold text-sky-600 dark:text-sky-400">
                                                            {it.code || `NVL${String(it.ingredient_id).padStart(5, '0')}`}
                                                        </td>
                                                        <td className="px-4 py-3 text-left">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                                    {it.name}
                                                                </span>
                                                                {hasChildren && (
                                                                    <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                                                                        {it.children!.length} món dùng
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td
                                                            className={`px-4 py-3 text-center font-bold tabular-nums ${
                                                                it.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'
                                                            }`}
                                                        >
                                                            {it.quantity > 0 ? '+' : ''}
                                                            {it.quantity.toLocaleString('vi-VN')} {it.unit}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400 tabular-nums">
                                                            {it.unit_price != null ? formatCurrency(it.unit_price) : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400 tabular-nums font-semibold">
                                                            {isImport ? formatCurrency(it.total) : '—'}
                                                        </td>
                                                    </tr>

                                                    {/* Child Rows (Các món con tiêu hao nguyên liệu cha) */}
                                                    {isExport && isExpanded && hasChildren && (
                                                        <>
                                                            {it.children!.map((c, cIdx) => (
                                                                <tr
                                                                    key={`${it.ingredient_id}-${c.product_id}-${cIdx}`}
                                                                    className="bg-zinc-50/70 dark:bg-zinc-800/30 text-xs border-l-4 border-l-sky-500"
                                                                >
                                                                    <td className="px-3 py-2 text-center text-zinc-300 dark:text-zinc-600">
                                                                        ↳
                                                                    </td>
                                                                    <td className="px-4 py-2 text-center text-[11px] text-zinc-400 font-mono">
                                                                        Món #{c.product_id}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-left pl-6">
                                                                        <div className="flex items-center gap-2">
                                                                            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                                                                {c.product_name}
                                                                            </span>
                                                                            <span className="text-[11px] text-zinc-400">
                                                                                ({c.product_quantity} phần × {c.recipe_amount} {c.unit})
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2 text-center font-semibold text-rose-600/90 dark:text-rose-400 tabular-nums">
                                                                        -{(c.total_quantity).toLocaleString('vi-VN')} {c.unit}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-center text-zinc-400 text-[11px]">
                                                                        Định lượng công thức
                                                                    </td>
                                                                    <td className="px-4 py-2 text-center text-zinc-400 text-[11px]">
                                                                        —
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}

                                        {isImport && total != null && (
                                            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
                                                <td
                                                    colSpan={4}
                                                    className="px-4 py-3 text-right font-semibold text-zinc-700 dark:text-zinc-300"
                                                >
                                                    Tổng giá trị:
                                                </td>
                                                <td className="px-4 py-3 text-center font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                                    {formatCurrency(total)}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {isExport && (
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50/50 dark:bg-zinc-800/20 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                    <span>
                                        Định lượng nguyên liệu tiêu hao được tính tự động từ công thức món (product_recipes) nhân với số lượng từng món đã hoàn tất trong hoá đơn.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
