import React, { useState } from 'react';
import { router } from '@inertiajs/react';
import { IngredientData } from './IngredientTable';

interface StockImportModalProps {
    ingredients: IngredientData[];
    isOpen: boolean;
    onClose: () => void;
}

interface ImportLine {
    ingredient_id: string;
    quantity: string;
    unit_price: string;
}

export default function StockImportModal({ ingredients, isOpen, onClose }: StockImportModalProps) {
    const [lines, setLines] = useState<ImportLine[]>([
        { ingredient_id: '', quantity: '', unit_price: '' },
    ]);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) return null;

    const updateLine = (idx: number, field: keyof ImportLine, value: string) => {
        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
    };

    const addLine = () => setLines((prev) => [...prev, { ingredient_id: '', quantity: '', unit_price: '' }]);
    const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

    const validLines = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0);
    const totalCost = validLines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price || 0), 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validLines.length === 0) {
            setErrorMsg('Cần ít nhất 1 dòng nguyên liệu hợp lệ');
            return;
        }
        setSubmitting(true);
        setErrorMsg(null);

        router.post(
            '/manager/inventory/vouchers',
            {
                items: validLines.map((l) => ({
                    ingredient_id: Number(l.ingredient_id),
                    quantity: Number(l.quantity),
                    unit_price: Number(l.unit_price || 0),
                })),
                note,
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                    setLines([{ ingredient_id: '', quantity: '', unit_price: '' }]);
                    setNote('');
                },
                onError: (errs: any) => {
                    setSubmitting(false);
                    setErrorMsg(Object.values(errs)[0] as string || 'Có lỗi xảy ra khi nhập kho.');
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Tạo phiếu nhập kho</h3>
                    <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        {lines.map((line, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <select
                                    value={line.ingredient_id}
                                    onChange={(e) => updateLine(idx, 'ingredient_id', e.target.value)}
                                    className="flex-1 px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Chọn nguyên liệu...</option>
                                    {ingredients.map((ing) => (
                                        <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    step="any"
                                    value={line.quantity}
                                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                                    placeholder="SL"
                                    className="w-24 px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="number"
                                    step="any"
                                    value={line.unit_price}
                                    onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                                    placeholder="Đơn giá"
                                    className="w-28 px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                                <button type="button" onClick={() => removeLine(idx)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={addLine}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            + Thêm dòng nguyên liệu
                        </button>
                    </div>

                    {totalCost > 0 && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Tổng giá trị phiếu: <strong className="text-emerald-600">{totalCost.toLocaleString('vi-VN')} đ</strong>
                        </p>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Ghi chú / Nhà cung cấp</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Ví dụ: Nhập đại lý VinMart..."
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}

                    <div className="flex justify-end space-x-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700">Hủy</button>
                        <button type="submit" disabled={submitting} className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                            {submitting ? 'Đang lưu...' : 'Xác nhận nhập kho'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
