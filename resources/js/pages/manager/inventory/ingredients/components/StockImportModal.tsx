import { router } from '@inertiajs/react';
import { Box, X, Plus, Trash2, AlertCircle } from 'lucide-react';
import React, { useState } from 'react';
import DatePicker from '../../../../../components/DatePicker';
import type { IngredientData } from './IngredientTable';

interface StockImportModalProps {
    ingredients: IngredientData[];
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
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

export default function StockImportModal({ ingredients, isOpen, onClose }: StockImportModalProps) {
    const [lines, setLines] = useState<ImportLine[]>([
        { ingredient_id: '', quantity: '', unit_price: '', expiry_date: '' },
    ]);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) {
return null;
}

    const updateLine = (idx: number, field: keyof ImportLine, value: string) => {
        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
    };

    const addLine = () =>
        setLines((prev) => [...prev, { ingredient_id: '', quantity: '', unit_price: '', expiry_date: '' }]);

    const removeLine = (idx: number) => {
        if (lines.length === 1) {
            setLines([{ ingredient_id: '', quantity: '', unit_price: '', expiry_date: '' }]);

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

    const validLines = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0);
    const totalCost = validLines.reduce(
        (sum, l) => sum + Number(l.quantity) * Number(l.unit_price || 0),
        0
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
return;
}

        if (validLines.length === 0) {
            setErrorMsg('Vui lòng nhập ít nhất 1 dòng nguyên liệu hợp lệ (chọn nguyên liệu và số lượng > 0).');

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
            },
            {
                onSuccess: () => {
                    clearTimeout(timer);
                    setSubmitting(false);
                    onClose();
                    setLines([{ ingredient_id: '', quantity: '', unit_price: '', expiry_date: '' }]);
                    setNote('');
                },
                onError: (errs: Record<string, string>) => {
                    clearTimeout(timer);
                    setSubmitting(false);
                    setErrorMsg(Object.values(errs)[0] || 'Có lỗi xảy ra khi tạo phiếu nhập kho.');
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col min-h-0 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-2.5">
                        <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
                            <Box className="w-5 h-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <h3 className="font-display text-lg font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                Tạo phiếu nhập kho
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Nhập nguyên liệu, cập nhật giá vốn trung bình và ghi nhận hạn sử dụng
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <X className="w-5 h-5 stroke-[1.5]" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
                        {/* Table of Import Lines */}
                        <div className="space-y-2">
                            {/* Column Headers */}
                            <div className="grid grid-cols-[1fr_110px_140px_130px_160px_40px] gap-2.5 px-3 py-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center">
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
                                    const unit = displayUnit(line.ingredient_id);
                                    const lineSubtotal =
                                        Number(line.quantity || 0) * Number(line.unit_price || 0);

                                    return (
                                        <div
                                            key={idx}
                                            className="grid grid-cols-[1fr_110px_140px_130px_160px_40px] items-center gap-2.5 p-1 bg-zinc-50/50 dark:bg-zinc-800/20 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                                        >
                                            {/* 1. Ingredient Select (Text dài -> Căn trái) */}
                                            <div className="min-w-0 text-left">
                                                <select
                                                    value={line.ingredient_id}
                                                    onChange={(e) => {
                                                        const newIngId = e.target.value;
                                                        const targetIng = getIngredient(newIngId);
                                                        updateLine(idx, 'ingredient_id', newIngId);

                                                        // Tự động gợi ý giá vốn hiện tại nếu chưa nhập
                                                        if (targetIng && !line.unit_price) {
                                                            const basePrice = Number(targetIng.cost_price || 0);
                                                            const conv = targetIng.unit_conversion ?? 1;
                                                            updateLine(idx, 'unit_price', String(basePrice * conv));
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:border-sky-500 outline-none transition-colors"
                                                >
                                                    <option value="">Chọn nguyên liệu...</option>
                                                    {ingredients.map((item) => (
                                                        <option key={item.id} value={item.id}>
                                                            {item.name} ({item.purchase_unit || item.unit})
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
                                                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                                                    placeholder={unit ? `0 ${unit}` : '0'}
                                                    className="w-full px-2 py-2 text-center text-xs tabular-nums font-semibold border rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:border-sky-500 outline-none transition-colors"
                                                />
                                            </div>

                                            {/* 3. Unit Price Input (Số -> Căn giữa) */}
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    value={line.unit_price}
                                                    onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                                                    placeholder="0"
                                                    className="w-full px-2 py-2 pr-5 text-center text-xs tabular-nums border rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:border-sky-500 outline-none transition-colors"
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-zinc-400">
                                                    đ
                                                </span>
                                            </div>

                                            {/* 4. Line Subtotal (Số -> Căn giữa) */}
                                            <div className="px-1 text-center">
                                                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums truncate block">
                                                    {lineSubtotal > 0 ? formatCurrency(lineSubtotal) : '—'}
                                                </span>
                                            </div>

                                            {/* 5. Expiry DatePicker (Ngày -> Căn giữa) */}
                                            <div className="min-w-0">
                                                <DatePicker
                                                    mode="single"
                                                    value={line.expiry_date || null}
                                                    onChange={(val) => updateLine(idx, 'expiry_date', val ?? '')}
                                                    placeholder="Hạn dùng..."
                                                    className="w-full text-xs py-1.5 text-center"
                                                />
                                            </div>

                                            {/* 6. Remove Button (Nút -> Căn giữa) */}
                                            <div className="flex justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => removeLine(idx)}
                                                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                                                    title="Xóa dòng"
                                                >
                                                    <Trash2 className="w-4 h-4 stroke-[1.5]" />
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
                                    className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-xl transition-colors border border-dashed border-sky-300 dark:border-sky-800"
                                >
                                    <Plus className="w-3.5 h-3.5 stroke-2" />
                                    <span>Thêm dòng nguyên liệu</span>
                                </button>
                            </div>
                        </div>

                        {/* Note & Provider */}
                        <div>
                            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                Ghi chú / Nhà cung cấp
                            </label>
                            <input
                                type="text"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Ví dụ: Nhập hàng từ Nhà cung cấp VinMart..."
                                className="w-full px-3.5 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:border-sky-500 outline-none transition-colors"
                            />
                        </div>

                        {/* Error Message */}
                        {errorMsg && (
                            <div className="flex items-center space-x-2 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl text-xs text-rose-600 dark:text-rose-400">
                                <AlertCircle className="w-4 h-4 shrink-0 stroke-[1.5]" />
                                <span>{errorMsg}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer Summary & Action Buttons */}
                    <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 flex items-center justify-between shrink-0">
                        <div>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">Tổng mặt hàng: </span>
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mr-4">
                                {validLines.length}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">Tổng giá trị: </span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {formatCurrency(totalCost)}
                            </span>
                        </div>

                        <div className="flex items-center space-x-2.5">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors disabled:opacity-50"
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || validLines.length === 0}
                                className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? 'Đang lưu...' : 'Xác nhận nhập kho'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
