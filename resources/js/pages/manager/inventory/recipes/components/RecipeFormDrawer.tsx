import React, { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { ProductRecipeData } from './RecipeTable';

interface Ingredient {
    id: number;
    code: string;
    name: string;
    unit: string;
    cost_price: number;
}

interface RecipeFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    product: ProductRecipeData | null;
    ingredients: Ingredient[];
}

interface RecipeLine {
    ingredient_id: number;
    amount: number;
    unit: string;
}

export default function RecipeFormDrawer({
    isOpen,
    onClose,
    product,
    ingredients,
}: RecipeFormDrawerProps) {
    const [lines, setLines] = useState<RecipeLine[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (product && product.recipes && product.recipes.length > 0) {
            setLines(
                product.recipes.map((r) => ({
                    ingredient_id: r.ingredient_id,
                    amount: Number(r.amount),
                    unit: r.unit || r.ingredient?.unit || 'g',
                }))
            );
        } else {
            setLines([]);
        }
        setErrorMsg(null);
    }, [product, isOpen]);

    if (!isOpen || !product) return null;

    const handleAddLine = () => {
        const firstIng = ingredients[0];
        if (!firstIng) return;
        setLines((prev) => [
            ...prev,
            {
                ingredient_id: firstIng.id,
                amount: 1,
                unit: firstIng.unit,
            },
        ]);
    };

    const handleRemoveLine = (index: number) => {
        setLines((prev) => prev.filter((_, i) => i !== index));
    };

    const handleIngredientChange = (index: number, ingId: number) => {
        const selectedIng = ingredients.find((i) => i.id === ingId);
        setLines((prev) =>
            prev.map((line, i) =>
                i === index
                    ? {
                          ...line,
                          ingredient_id: ingId,
                          unit: selectedIng?.unit || line.unit,
                      }
                    : line
            )
        );
    };

    const handleAmountChange = (index: number, amountStr: string) => {
        const amount = Number(amountStr) || 0;
        setLines((prev) =>
            prev.map((line, i) => (i === index ? { ...line, amount } : line))
        );
    };

    // Calculate COGS
    const cogs = lines.reduce((sum, line) => {
        const ing = ingredients.find((i) => i.id === line.ingredient_id);
        const cost = ing ? Number(ing.cost_price) : 0;
        return sum + line.amount * cost;
    }, 0);

    const marginPercent = product.price > 0
        ? Math.round(((product.price - cogs) / product.price) * 100)
        : 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMsg(null);

        router.post(
            `/manager/inventory/recipes/${product.id}`,
            { items: lines as any },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs: any) => {
                    setSubmitting(false);
                    setErrorMsg(Object.values(errs)[0] as string || 'Có lỗi xảy ra khi lưu công thức.');
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-[100] overflow-hidden">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10 z-[101]">
                <div className="w-screen max-w-xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between">
                    {/* Header */}
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                Định lượng công thức: {product.name}
                            </h2>
                            <p className="text-xs text-zinc-500 mt-1">
                                Giá bán: <strong className="font-bold text-emerald-600 dark:text-emerald-400">{Number(product.price).toLocaleString('vi-VN')} đ</strong> &bull; Danh mục: {product.category?.name || 'Mặc định'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Form Body */}
                    <form id="recipe-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                        {/* Live COGS Estimate Box */}
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between">
                            <div>
                                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 block">Ước tính Giá vốn (COGS) / 1 món:</span>
                                <span className="text-lg font-extrabold text-amber-900 dark:text-amber-100">
                                    {Math.round(cogs).toLocaleString('vi-VN')} đ
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 block">Tỷ suất lợi nhuận gộp:</span>
                                <span className={`text-base font-extrabold ${marginPercent >= 50 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {marginPercent}%
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                Thành phần nguyên liệu vật tư ({lines.length})
                            </span>
                            <button
                                type="button"
                                onClick={handleAddLine}
                                className="px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 flex items-center space-x-1"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span>Thêm nguyên liệu</span>
                            </button>
                        </div>

                        {/* Ingredients Table */}
                        {lines.length === 0 ? (
                            <div className="py-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-800/40">
                                <p className="text-sm text-zinc-500">Chưa có nguyên liệu nào trong công thức.</p>
                                <button
                                    type="button"
                                    onClick={handleAddLine}
                                    className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                                >
                                    + Thêm nguyên liệu đầu tiên
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {lines.map((line, idx) => {
                                    const selectedIng = ingredients.find((i) => i.id === line.ingredient_id);
                                    const lineCost = selectedIng ? Number(selectedIng.cost_price) * line.amount : 0;

                                    return (
                                        <div
                                            key={idx}
                                            className="p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/60 dark:bg-zinc-800/50 flex items-center gap-3"
                                        >
                                            {/* Select Ingredient */}
                                            <div className="flex-1">
                                                <select
                                                    value={line.ingredient_id}
                                                    onChange={(e) => handleIngredientChange(idx, Number(e.target.value))}
                                                    className="w-full px-2.5 py-1.5 text-sm border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700"
                                                >
                                                    {ingredients.map((ing) => (
                                                        <option key={ing.id} value={ing.id}>
                                                            {ing.name} ({ing.code}) - {ing.cost_price.toLocaleString('vi-VN')}đ/{ing.unit}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Amount */}
                                            <div className="w-24 shrink-0 flex items-center space-x-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0.01"
                                                    value={line.amount}
                                                    onChange={(e) => handleAmountChange(idx, e.target.value)}
                                                    className="w-full px-2 py-1.5 text-sm font-semibold border rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 text-right"
                                                />
                                                <span className="text-xs font-medium text-zinc-500 shrink-0">{line.unit}</span>
                                            </div>

                                            {/* Line Cost Preview */}
                                            <div className="w-24 text-right shrink-0 font-semibold text-xs text-amber-700 dark:text-amber-400">
                                                {Math.round(lineCost).toLocaleString('vi-VN')} đ
                                            </div>

                                            {/* Remove Line Button */}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveLine(idx)}
                                                className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}
                    </form>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 rounded-lg shadow-xs"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            form="recipe-form"
                            disabled={submitting}
                            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
                        >
                            {submitting ? 'Đang lưu...' : 'Lưu công thức'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
