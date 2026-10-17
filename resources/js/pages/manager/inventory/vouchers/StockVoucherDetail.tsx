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
import React, { useState } from 'react';
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
    new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(val);

export default function StockVoucherDetail({
    voucher,
    products = [],
    items,
    total,
}: VoucherDetailProps) {
    const isImport = voucher.type === 'import';
    const isExport = voucher.type === 'export';
    const isAdjustment = voucher.type === 'adjustment';

    const typeLabel = isAdjustment
        ? 'Phiếu điều chỉnh'
        : isImport
          ? 'Phiếu nhập'
          : 'Phiếu xuất';

    // Mặc định ẩn danh sách các món trong hoá đơn
    const [showProducts, setShowProducts] = useState(false);

    // State lưu danh sách ID các dòng cha đang được mở rộng (expanded)
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>(
        () => {
            const init: Record<number, boolean> = {};
            items.forEach((it) => {
                if (it.children && it.children.length > 0) {
                    init[it.ingredient_id] = true;
                }
            });

            return init;
        },
    );

    const toggleRow = (ingredientId: number) => {
        setExpandedRows((prev) => ({
            ...prev,
            [ingredientId]: !prev[ingredientId],
        }));
    };

    const hasAnyChildren = items.some(
        (it) => it.children && it.children.length > 0,
    );
    const areAllExpanded = items.every(
        (it) =>
            !it.children ||
            it.children.length === 0 ||
            expandedRows[it.ingredient_id],
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
            <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
                <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                    {/* Header */}
                    <div className="shrink-0 border-b border-zinc-100 px-6 pt-5 pb-4 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.get(
                                            '/manager/inventory/vouchers',
                                        )
                                    }
                                    className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                    title="Quay lại danh sách phiếu"
                                >
                                    <ArrowLeft className="h-5 w-5 stroke-[1.5]" />
                                </button>
                                <div className="flex items-center space-x-2.5">
                                    <div className="rounded-xl bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                                        <Box className="h-5 w-5 stroke-[1.5]" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h1 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                                                {voucher.voucher_code}
                                            </h1>
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                    isAdjustment
                                                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                                        : isImport
                                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                }`}
                                            >
                                                {isAdjustment ? (
                                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                                ) : isImport ? (
                                                    <ArrowDownToLine className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ArrowUpFromLine className="h-3.5 w-3.5" />
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
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                        {/* Meta Card */}
                        <div className="grid shrink-0 grid-cols-2 gap-4 rounded-xl border border-zinc-200/80 bg-zinc-50 p-4 text-sm md:grid-cols-4 dark:border-zinc-800/80 dark:bg-zinc-800/40">
                            <div>
                                <span className="block text-xs font-medium text-zinc-400 dark:text-zinc-500">
                                    Mã phiếu
                                </span>
                                <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                                    {voucher.voucher_code}
                                </span>
                            </div>
                            <div>
                                <span className="block text-xs font-medium text-zinc-400 dark:text-zinc-500">
                                    Loại phiếu
                                </span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {typeLabel}
                                </span>
                            </div>
                            <div>
                                <span className="block text-xs font-medium text-zinc-400 dark:text-zinc-500">
                                    Thời điểm
                                </span>
                                <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                                    {voucher.transacted_at}
                                </span>
                            </div>
                            <div>
                                <span className="block text-xs font-medium text-zinc-400 dark:text-zinc-500">
                                    Người tạo
                                </span>
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {voucher.employee_name || '—'}
                                </span>
                            </div>

                            {voucher.note && (
                                <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/60 pt-2.5 text-xs md:col-span-4 dark:border-zinc-700/60">
                                    <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                                        <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                                            Ghi chú:
                                        </span>
                                        <span>{voucher.note}</span>
                                    </div>

                                    {/* Nút nhỏ ở phần hoá đơn để mở/ẩn danh sách món */}
                                    {isExport &&
                                        products &&
                                        products.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowProducts(
                                                        !showProducts,
                                                    )
                                                }
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-2xs transition-colors hover:bg-sky-100 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/40"
                                            >
                                                {showProducts ? (
                                                    <>
                                                        <EyeOff className="h-3.5 w-3.5 stroke-[1.5]" />
                                                        <span>
                                                            Ẩn món trong hoá đơn
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Eye className="h-3.5 w-3.5 stroke-[1.5]" />
                                                        <span>
                                                            Xem món trong hoá
                                                            đơn (
                                                            {products.length})
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        )}
                                </div>
                            )}
                        </div>

                        {/* Top Table for Export Vouchers: Sold Menu Items in Invoices/Orders (Chỉ hiển thị khi bấm nút) */}
                        {isExport &&
                            products &&
                            products.length > 0 &&
                            showProducts && (
                                <div className="shrink-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs transition-all duration-200 dark:border-zinc-800/80 dark:bg-zinc-900">
                                    <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/60">
                                        <div className="flex items-center gap-2">
                                            <div className="rounded-lg bg-amber-100 p-1 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                <Receipt className="h-4 w-4 stroke-[1.5]" />
                                            </div>
                                            <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                Danh sách món trong hoá đơn /
                                                phiếu xuất
                                            </h3>
                                        </div>
                                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                            {products.length} món
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse text-left text-sm">
                                            <thead className="border-b border-zinc-200/80 bg-zinc-50/75 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400">
                                                <tr>
                                                    <th className="w-16 border-r border-zinc-200/60 px-4 py-2.5 text-center dark:border-zinc-800/60">
                                                        STT
                                                    </th>
                                                    <th className="border-r border-zinc-200/60 px-4 py-2.5 text-left dark:border-zinc-800/60">
                                                        Tên món
                                                    </th>
                                                    <th className="w-36 border-r border-zinc-200/60 px-4 py-2.5 text-center dark:border-zinc-800/60">
                                                        Số lượng bán
                                                    </th>
                                                    <th className="w-44 px-4 py-2.5 text-center">
                                                        Trạng thái trừ kho
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                                {products.map((p, idx) => (
                                                    <tr
                                                        key={p.id || idx}
                                                        className="transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40"
                                                    >
                                                        <td className="border-r border-zinc-100/80 px-4 py-2.5 text-center text-xs text-zinc-400 tabular-nums dark:border-zinc-800/40">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="border-r border-zinc-100/80 px-4 py-2.5 text-left font-medium text-zinc-900 dark:border-zinc-800/40 dark:text-zinc-100">
                                                            <div className="flex items-center gap-2">
                                                                <UtensilsCrossed className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                                                <span>
                                                                    {p.name}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="border-r border-zinc-100/80 px-4 py-2.5 text-center font-bold text-zinc-900 tabular-nums dark:border-zinc-800/40 dark:text-zinc-100">
                                                            {p.quantity.toLocaleString(
                                                                'vi-VN',
                                                            )}{' '}
                                                            phần/ly
                                                        </td>
                                                        <td className="px-4 py-2.5 text-center">
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                Đã trừ định
                                                                lượng
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
                        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/60">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg bg-sky-100 p-1 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                                        <Layers className="h-4 w-4 stroke-[1.5]" />
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
                                        className="flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                    >
                                        {areAllExpanded ? (
                                            <>
                                                <ChevronsDownUp className="h-3.5 w-3.5 text-zinc-400" />
                                                <span>Thu gọn tất cả</span>
                                            </>
                                        ) : (
                                            <>
                                                <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-400" />
                                                <span>Mở rộng tất cả</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse text-left text-sm">
                                    <thead className="border-b border-zinc-200/80 bg-zinc-50/75 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400">
                                        <tr>
                                            {isExport && (
                                                <th className="w-10 border-r border-zinc-200/60 px-3 py-2.5 text-center dark:border-zinc-800/60"></th>
                                            )}
                                            <th className="w-28 border-r border-zinc-200/60 px-4 py-2.5 text-center dark:border-zinc-800/60">
                                                Mã NVL
                                            </th>
                                            <th className="border-r border-zinc-200/60 px-4 py-2.5 text-left dark:border-zinc-800/60">
                                                Tên nguyên liệu / Món tiêu hao
                                            </th>
                                            <th className="w-36 border-r border-zinc-200/60 px-4 py-2.5 text-right dark:border-zinc-800/60">
                                                {isExport
                                                    ? 'Tổng lượng xuất'
                                                    : 'Số lượng'}
                                            </th>
                                            <th className="w-36 border-r border-zinc-200/60 px-4 py-2.5 text-right dark:border-zinc-800/60">
                                                Đơn giá
                                            </th>
                                            <th className="w-40 px-4 py-2.5 text-right">
                                                Thành tiền
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                        {items.map((it) => {
                                            const hasChildren =
                                                it.children &&
                                                it.children.length > 0;
                                            const isExpanded =
                                                !!expandedRows[
                                                    it.ingredient_id
                                                ];

                                            return (
                                                <React.Fragment
                                                    key={it.ingredient_id}
                                                >
                                                    {/* Parent Row (Nguyên liệu cha) */}
                                                    <tr
                                                        onClick={() =>
                                                            hasChildren &&
                                                            toggleRow(
                                                                it.ingredient_id,
                                                            )
                                                        }
                                                        className={`transition-colors ${
                                                            hasChildren
                                                                ? 'cursor-pointer hover:bg-sky-50/40 dark:hover:bg-sky-950/20'
                                                                : 'hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40'
                                                        } ${isExpanded ? 'bg-sky-50/20 dark:bg-sky-950/10' : ''}`}
                                                    >
                                                        {isExport && (
                                                            <td className="border-r border-zinc-100/80 px-3 py-3 text-center dark:border-zinc-800/40">
                                                                {hasChildren ? (
                                                                    <div className="flex items-center justify-center">
                                                                        <ChevronRight
                                                                            className={`h-4 w-4 text-sky-600 transition-transform duration-200 dark:text-sky-400 ${
                                                                                isExpanded
                                                                                    ? 'rotate-90'
                                                                                    : ''
                                                                            }`}
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-zinc-300 dark:text-zinc-600">
                                                                        —
                                                                    </span>
                                                                )}
                                                            </td>
                                                        )}
                                                        <td className="border-r border-zinc-100/80 px-4 py-3 text-center font-mono text-xs font-semibold text-sky-600 dark:border-zinc-800/40 dark:text-sky-400">
                                                            {it.code ||
                                                                `NVL${String(it.ingredient_id).padStart(5, '0')}`}
                                                        </td>
                                                        <td className="border-r border-zinc-100/80 px-4 py-3 text-left dark:border-zinc-800/40">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                                    {it.name}
                                                                </span>
                                                                {hasChildren && (
                                                                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                                                        {
                                                                            it
                                                                                .children!
                                                                                .length
                                                                        }{' '}
                                                                        món dùng
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td
                                                            className={`border-r border-zinc-100/80 px-4 py-3 text-right font-bold tabular-nums dark:border-zinc-800/40 ${
                                                                it.quantity < 0
                                                                    ? 'text-rose-600'
                                                                    : 'text-emerald-600'
                                                            }`}
                                                        >
                                                            {it.quantity > 0
                                                                ? '+'
                                                                : ''}
                                                            {it.quantity.toLocaleString(
                                                                'vi-VN',
                                                            )}{' '}
                                                            {it.unit}
                                                        </td>
                                                        <td className="border-r border-zinc-100/80 px-4 py-3 text-right text-zinc-600 tabular-nums dark:border-zinc-800/40 dark:text-zinc-400">
                                                            {it.unit_price !=
                                                            null
                                                                ? formatCurrency(
                                                                      it.unit_price,
                                                                  )
                                                                : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                                                            {isImport
                                                                ? formatCurrency(
                                                                      it.total,
                                                                  )
                                                                : '—'}
                                                        </td>
                                                    </tr>

                                                    {/* Child Rows (Các món con tiêu hao nguyên liệu cha) */}
                                                    {isExport &&
                                                        isExpanded &&
                                                        hasChildren && (
                                                            <>
                                                                {it.children!.map(
                                                                    (
                                                                        c,
                                                                        cIdx,
                                                                    ) => (
                                                                        <tr
                                                                            key={`${it.ingredient_id}-${c.product_id}-${cIdx}`}
                                                                            className="border-l-4 border-l-sky-500 bg-zinc-50/70 text-xs dark:bg-zinc-800/30"
                                                                        >
                                                                            <td className="border-r border-zinc-100/80 px-3 py-2 text-center text-zinc-300 dark:border-zinc-800/40 dark:text-zinc-600">
                                                                                ↳
                                                                            </td>
                                                                            <td className="border-r border-zinc-100/80 px-4 py-2 text-center font-mono text-[11px] text-zinc-400 dark:border-zinc-800/40">
                                                                                Món
                                                                                #
                                                                                {
                                                                                    c.product_id
                                                                                }
                                                                            </td>
                                                                            <td className="border-r border-zinc-100/80 px-4 py-2 pl-6 text-left dark:border-zinc-800/40">
                                                                                <div className="flex items-center gap-2">
                                                                                    <UtensilsCrossed className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                                                                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                                                                        {
                                                                                            c.product_name
                                                                                        }
                                                                                    </span>
                                                                                    <span className="text-[11px] text-zinc-400">
                                                                                        (
                                                                                        {
                                                                                            c.product_quantity
                                                                                        }{' '}
                                                                                        phần
                                                                                        ×{' '}
                                                                                        {
                                                                                            c.recipe_amount
                                                                                        }{' '}
                                                                                        {
                                                                                            c.unit
                                                                                        }

                                                                                        )
                                                                                    </span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="border-r border-zinc-100/80 px-4 py-2 text-right font-semibold text-rose-600/90 tabular-nums dark:border-zinc-800/40 dark:text-rose-400">
                                                                                -
                                                                                {c.total_quantity.toLocaleString(
                                                                                    'vi-VN',
                                                                                )}{' '}
                                                                                {
                                                                                    c.unit
                                                                                }
                                                                            </td>
                                                                            <td className="border-r border-zinc-100/80 px-4 py-2 text-right text-[11px] text-zinc-400 dark:border-zinc-800/40">
                                                                                Định
                                                                                lượng
                                                                                công
                                                                                thức
                                                                            </td>
                                                                            <td className="px-4 py-2 text-right text-[11px] text-zinc-400">
                                                                                —
                                                                            </td>
                                                                        </tr>
                                                                    ),
                                                                )}
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
                                                <td className="px-4 py-3 text-center font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                                                    {formatCurrency(total)}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {isExport && (
                                <div className="flex items-center gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-2.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/20 dark:text-zinc-400">
                                    <Info className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                                    <span>
                                        Định lượng nguyên liệu tiêu hao được
                                        tính tự động từ công thức món
                                        (product_recipes) nhân với số lượng từng
                                        món đã hoàn tất trong hoá đơn.
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
