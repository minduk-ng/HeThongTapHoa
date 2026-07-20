import React, { useState } from 'react';
import { router } from '@inertiajs/react';
import { IngredientData } from './IngredientTable';

interface StockImportModalProps {
    ingredient: IngredientData | null;
    onClose: () => void;
}

export default function StockImportModal({ ingredient, onClose }: StockImportModalProps) {
    const [quantity, setQuantity] = useState<string>('');
    const [unitPrice, setUnitPrice] = useState<string>(ingredient ? String(ingredient.cost_price) : '');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!ingredient) return null;

    const currentStock = ingredient.stock_quantity;
    const currentCost = ingredient.cost_price;
    const numQty = Number(quantity) || 0;
    const numPrice = Number(unitPrice) || 0;

    const newStock = currentStock + numQty;
    const newAvgCost = newStock > 0
        ? ((currentStock * currentCost) + (numQty * numPrice)) / newStock
        : numPrice;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (numQty <= 0) {
            setErrorMsg('Số lượng nhập phải lớn hơn 0');
            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        router.post(
            '/manager/inventory/ingredients/import',
            {
                ingredient_id: ingredient.id,
                quantity: numQty,
                unit_price: numPrice,
                note,
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs: any) => {
                    setSubmitting(false);
                    setErrorMsg(Object.values(errs)[0] as string || 'Có lỗi xảy ra khi nhập kho.');
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Nhập kho bổ sung nguyên liệu</span>
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs space-y-1">
                        <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {ingredient.name} ({ingredient.code})
                        </p>
                        <p className="text-zinc-500">
                            Tồn hiện tại: <strong className="font-bold text-zinc-900 dark:text-zinc-100">{currentStock.toLocaleString('vi-VN')} {ingredient.unit}</strong> | Giá vốn hiện tại: <strong className="font-bold text-emerald-600 dark:text-emerald-400">{currentCost.toLocaleString('vi-VN')} đ/{ingredient.unit}</strong>
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Số lượng nhập bổ sung ({ingredient.unit}) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="Nhập số lượng..."
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Đơn giá nhập mới (VNĐ/{ingredient.unit}) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            value={unitPrice}
                            onChange={(e) => setUnitPrice(e.target.value)}
                            placeholder="Nhập đơn giá..."
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Weighted Average Cost Preview */}
                    {numQty > 0 && (
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs space-y-1 text-blue-900 dark:text-blue-200">
                            <p>Tồn kho sau nhập: <strong className="font-bold">{newStock.toLocaleString('vi-VN')} {ingredient.unit}</strong></p>
                            <p>Giá vốn bình quân mới: <strong className="font-bold text-emerald-600 dark:text-emerald-400">{Math.round(newAvgCost).toLocaleString('vi-VN')} đ/{ingredient.unit}</strong></p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Ghi chú / Nhà cung cấp
                        </label>
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
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || numQty <= 0}
                            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                        >
                            {submitting ? 'Đang lưu...' : 'Xác nhận nhập kho'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
