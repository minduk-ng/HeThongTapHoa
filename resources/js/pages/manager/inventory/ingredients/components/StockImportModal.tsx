import { router } from '@inertiajs/react';
import { Box, X, Plus, Trash2, AlertCircle } from 'lucide-react';
import React, { useState } from 'react';
import DatePicker from '../../../../../components/DatePicker';
import type { IngredientData } from './IngredientTable';

interface StockImportModalProps {
    ingredients: IngredientData[];
    suppliers?: { id: number; name: string }[];
    isOpen: boolean;
    onClose: () => void;
}

interface ImportLine {
    ingredient_id: string;
    quantity: string;
    unit_price: string;
    expiry_date: string;
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(val);

export default function StockImportModal({
    ingredients,
    suppliers = [],
    isOpen,
    onClose,
}: StockImportModalProps) {
    const [lines, setLines] = useState<ImportLine[]>([
        { ingredient_id: '', quantity: '', unit_price: '', expiry_date: '' },
    ]);
    const [note, setNote] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [isPaid, setIsPaid] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) {
        return null;
    }

    const updateLine = (
        idx: number,
        field: keyof ImportLine,
        value: string,
    ) => {
        setLines((prev) =>
            prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
        );
    };

    const addLine = () =>
        setLines((prev) => [
            ...prev,
            {
                ingredient_id: '',
                quantity: '',
                unit_price: '',
                expiry_date: '',
            },
        ]);

    const removeLine = (idx: number) => {
        if (lines.length === 1) {
            setLines([
                {
                    ingredient_id: '',
                    quantity: '',
                    unit_price: '',
                    expiry_date: '',
                },
            ]);

            return;
        }

        setLines((prev) => prev.filter((_, i) => i !== idx));
    };

    const getIngredient = (ingId: string): IngredientData | undefined =>
        ingredients.find((i) => String(i.id) === ingId);

    const displayUnit = (ingId: string): string => {
        const ing = getIngredient(ingId);

        return ing?.purchase_unit || ing?.unit || '';
    };

    const toBaseQuantity = (line: ImportLine): number => {
        const ing = getIngredient(line.ingredient_id);
        const conversion = ing?.unit_conversion ?? 1;

        return Number(line.quantity) * conversion;
    };

    const toBasePrice = (line: ImportLine): number => {
        const ing = getIngredient(line.ingredient_id);
        const conversion = ing?.unit_conversion ?? 1;

        return Number(line.unit_price || 0) / conversion;
    };

    const validLines = lines.filter(
        (l) => l.ingredient_id && Number(l.quantity) > 0,
    );
    const totalCost = validLines.reduce(
        (sum, l) => sum + Number(l.quantity) * Number(l.unit_price || 0),
        0,
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
            return;
        }

        if (validLines.length === 0) {
            setErrorMsg(
                'Vui lòng nhập ít nhất 1 dòng nguyên liệu hợp lệ (chọn nguyên liệu và số lượng > 0).',
            );

            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        // Safety timeout in case of network freeze
        const timer = setTimeout(() => {
            setSubmitting(false);
        }, 8000);

        router.post(
            '/manager/inventory/vouchers',
            {
                items: validLines.map((l) => ({
                    ingredient_id: Number(l.ingredient_id),
                    quantity: toBaseQuantity(l),
                    unit_price: toBasePrice(l),
                    expiry_date: l.expiry_date || null,
                })),
                note,
                supplier_id: supplierId || null,
                is_paid: isPaid,
            },
            {
                onSuccess: () => {
                    clearTimeout(timer);
                    setSubmitting(false);
                    onClose();
                    setLines([
                        {
                            ingredient_id: '',
                            quantity: '',
                            unit_price: '',
                            expiry_date: '',
                        },
                    ]);
                    setNote('');
                    setSupplierId('');
                    setIsPaid(false);
                },
                onError: (errs: Record<string, string>) => {
                    clearTimeout(timer);
                    setSubmitting(false);
                    setErrorMsg(
                        Object.values(errs)[0] ||
                            'Có lỗi xảy ra khi tạo phiếu nhập kho.',
                    );
                },
            },
        );
    };

    return (
        <div className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs duration-200 sm:p-6">
            <div className="flex max-h-[90vh] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
                    <div className="flex items-center space-x-2.5">
                        <div className="rounded-xl bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                            <Box className="h-5 w-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <h3 className="font-display text-lg font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                                Tạo phiếu nhập kho
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Nhập nguyên liệu, cập nhật giá vốn trung bình và
                                ghi nhận hạn sử dụng
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                    >
                        <X className="h-5 w-5 stroke-[1.5]" />
                    </button>
                </div>

                {/* Form Body */}
                <form
                    onSubmit={handleSubmit}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                        {/* Table of Import Lines */}
                        <div className="space-y-2">
                            {/* Column Headers */}
                            <div className="grid grid-cols-[1fr_110px_140px_130px_160px_40px] gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-center text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
                                <div>Nguyên liệu</div>
                                <div>Số lượng</div>
                                <div>Đơn giá nhập</div>
                                <div>Thành tiền</div>
                                <div>Hạn sử dụng</div>
                                <div>Xóa</div>
                            </div>

                            {/* Line Rows */}
                            <div className="space-y-2">
                                {lines.map((line, idx) => {
                                    const unit = displayUnit(
                                        line.ingredient_id,
                                    );
                                    const lineSubtotal =
                                        Number(line.quantity || 0) *
                                        Number(line.unit_price || 0);

                                    return (
                                        <div
                                            key={idx}
                                            className="grid grid-cols-[1fr_110px_140px_130px_160px_40px] items-center gap-2.5 rounded-xl border border-zinc-200/60 bg-zinc-50/50 p-1 transition-colors hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-800/20 dark:hover:border-zinc-700"
                                        >
                                            {/* 1. Ingredient Select (Text dài -> Căn trái) */}
                                            <div className="min-w-0 text-left">
                                                <select
                                                    value={line.ingredient_id}
                                                    onChange={(e) => {
                                                        const newIngId =
                                                            e.target.value;
                                                        const targetIng =
                                                            getIngredient(
                                                                newIngId,
                                                            );
                                                        updateLine(
                                                            idx,
                                                            'ingredient_id',
                                                            newIngId,
                                                        );

                                                        // Tự động gợi ý giá vốn hiện tại nếu chưa nhập
                                                        if (
                                                            targetIng &&
                                                            !line.unit_price
                                                        ) {
                                                            const basePrice =
                                                                Number(
                                                                    targetIng.cost_price ||
                                                                        0,
                                                                );
                                                            const conv =
                                                                targetIng.unit_conversion ??
                                                                1;
                                                            updateLine(
                                                                idx,
                                                                'unit_price',
                                                                String(
                                                                    basePrice *
                                                                        conv,
                                                                ),
                                                            );
                                                        }
                                                    }}
                                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 transition-colors outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                >
                                                    <option value="">
                                                        Chọn nguyên liệu...
                                                    </option>
                                                    {ingredients.map((item) => (
                                                        <option
                                                            key={item.id}
                                                            value={item.id}
                                                        >
                                                            {item.name} (
                                                            {item.purchase_unit ||
                                                                item.unit}
                                                            )
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* 2. Quantity Input (Số -> Căn giữa) */}
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={line.quantity}
                                                    onChange={(e) =>
                                                        updateLine(
                                                            idx,
                                                            'quantity',
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder={
                                                        unit ? `0 ${unit}` : '0'
                                                    }
                                                    className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center text-xs font-semibold text-zinc-900 tabular-nums transition-colors outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                />
                                            </div>

                                            {/* 3. Unit Price Input (Số -> Căn giữa) */}
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={line.unit_price}
                                                    onChange={(e) =>
                                                        updateLine(
                                                            idx,
                                                            'unit_price',
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="0"
                                                    className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 pr-5 text-center text-xs text-zinc-900 tabular-nums transition-colors outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                />
                                                <span className="absolute top-1/2 right-2 -translate-y-1/2 text-[10px] font-medium text-zinc-400">
                                                    đ
                                                </span>
                                            </div>

                                            {/* 4. Line Subtotal (Số -> Căn giữa) */}
                                            <div className="px-1 text-center">
                                                <span className="block truncate text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                                                    {lineSubtotal > 0
                                                        ? formatCurrency(
                                                              lineSubtotal,
                                                          )
                                                        : '—'}
                                                </span>
                                            </div>

                                            {/* 5. Expiry DatePicker (Ngày -> Căn giữa) */}
                                            <div className="min-w-0">
                                                <DatePicker
                                                    mode="single"
                                                    value={
                                                        line.expiry_date || null
                                                    }
                                                    onChange={(val) =>
                                                        updateLine(
                                                            idx,
                                                            'expiry_date',
                                                            val ?? '',
                                                        )
                                                    }
                                                    placeholder="Hạn dùng..."
                                                    className="w-full py-1.5 text-center text-xs"
                                                />
                                            </div>

                                            {/* 6. Remove Button (Nút -> Căn giữa) */}
                                            <div className="flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeLine(idx)
                                                    }
                                                    className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                                                    title="Xóa dòng"
                                                >
                                                    <Trash2 className="h-4 w-4 stroke-[1.5]" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add Line Button */}
                            <div className="pt-1">
                                <button
                                    type="button"
                                    onClick={addLine}
                                    className="inline-flex items-center space-x-1.5 rounded-xl border border-dashed border-sky-300 px-3 py-2 text-xs font-semibold text-sky-600 transition-colors hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-950/40"
                                >
                                    <Plus className="h-3.5 w-3.5 stroke-2" />
                                    <span>Thêm dòng nguyên liệu</span>
                                </button>
                            </div>
                        </div>

                        {/* Note & Provider */}
                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Ghi chú / Nhà cung cấp
                            </label>
                            <div className="flex items-center gap-2.5">
                                <select
                                    value={supplierId}
                                    onChange={(e) =>
                                        setSupplierId(e.target.value)
                                    }
                                    className="w-1/2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 transition-colors outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                >
                                    <option value="">
                                        Chọn nhà cung cấp...
                                    </option>
                                    {suppliers.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Ví dụ: Nhập hàng từ Nhà cung cấp VinMart..."
                                    className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 transition-colors outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                                />
                                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-zinc-600 select-none dark:text-zinc-400">
                                    <input
                                        type="checkbox"
                                        checked={isPaid}
                                        onChange={(e) =>
                                            setIsPaid(e.target.checked)
                                        }
                                        className="h-3.5 w-3.5 accent-emerald-600"
                                    />
                                    Đã trả tiền
                                </label>
                            </div>
                        </div>

                        {/* Error Message */}
                        {errorMsg && (
                            <div className="flex items-center space-x-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-400">
                                <AlertCircle className="h-4 w-4 shrink-0 stroke-[1.5]" />
                                <span>{errorMsg}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer Summary & Action Buttons */}
                    <div className="flex shrink-0 items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/30">
                        <div>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                Tổng mặt hàng:{' '}
                            </span>
                            <span className="mr-4 text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                                {validLines.length}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                Tổng giá trị:{' '}
                            </span>
                            <span className="text-sm font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                                {formatCurrency(totalCost)}
                            </span>
                        </div>

                        <div className="flex items-center space-x-2.5">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || validLines.length === 0}
                                className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {submitting
                                    ? 'Đang lưu...'
                                    : 'Xác nhận nhập kho'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
