import { router } from '@inertiajs/react';
import { ChefHat, Plus, Scale, Trash2 } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import {
    ManagerFormModal,
    FormSection,
} from '@/components/form';
import type { ProductRecipeData } from './RecipeTable';

interface Ingredient {
    id: number;
    code: string;
    name: string;
    unit: string;
    cost_price: number;
}

interface RecipeFormModalProps {
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

export default function RecipeFormModal({
    isOpen,
    onClose,
    product,
    ingredients,
}: RecipeFormModalProps) {
    const [lines, setLines] = useState<RecipeLine[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        queueMicrotask(() => {
            if (product && product.recipes && product.recipes.length > 0) {
                setLines(
                    product.recipes.map((r) => ({
                        ingredient_id: r.ingredient_id,
                        amount: Number(r.amount),
                        unit: r.unit || r.ingredient?.unit || 'g',
                    })),
                );
            } else {
                setLines([]);
            }

            setErrorMsg(null);
        });
    }, [product, isOpen]);

    const isDirty = useMemo(() => {
        if (!product) {
return false;
}

        const initialLines = (product.recipes || []).map((r) => ({
            ingredient_id: r.ingredient_id,
            amount: Number(r.amount),
            unit: r.unit || r.ingredient?.unit || 'g',
        }));

        if (lines.length !== initialLines.length) {
return true;
}

        return lines.some((l, idx) => {
            const init = initialLines[idx];

            if (!init) {
return true;
}

            return (
                l.ingredient_id !== init.ingredient_id
                || l.amount !== init.amount
                || l.unit !== init.unit
            );
        });
    }, [product, lines]);

    if (!isOpen || !product) {
        return null;
    }

    const handleAddLine = () => {
        const firstIng = ingredients[0];

        if (!firstIng) {
return;
}

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
                    : line,
            ),
        );
    };

    const handleAmountChange = (index: number, amountStr: string) => {
        const amount = Number(amountStr) || 0;
        setLines((prev) =>
            prev.map((line, i) => (i === index ? { ...line, amount } : line)),
        );
    };

    // Calculate COGS
    const cogs = lines.reduce((sum, line) => {
        const ing = ingredients.find((i) => i.id === line.ingredient_id);
        const cost = ing ? Number(ing.cost_price) : 0;

        return sum + line.amount * cost;
    }, 0);

    const marginPercent =
        product.price > 0
            ? Math.round(((product.price - cogs) / product.price) * 100)
            : 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
return;
}

        setErrorMsg(null);

        // Validation
        for (const line of lines) {
            if (line.amount <= 0) {
                setErrorMsg('Định lượng nguyên liệu phải lớn hơn 0.');

                return;
            }
        }

        setSubmitting(true);

        router.post(
            '/manager/inventory/recipes',
            {
                product_id: product.id,
                items: lines as any,
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrorMsg(
                        Object.values(errs)[0]
                            || 'Có lỗi xảy ra khi lưu công thức.',
                    );
                    setSubmitting(false);
                },
            },
        );
    };

    return (
        <ManagerFormModal
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={handleSubmit}
            title={`Định lượng công thức — ${product.name}`}
            subtitle="Khai báo nguyên vật liệu tiêu hao khi bán món để tự động trừ kho và tính giá vốn"
            isEditing={!!(product.recipes && product.recipes.length > 0)}
            isDirty={isDirty}
            submitting={submitting}
            size="2xl"
            formId="recipe-form"
        >
            {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                    {errorMsg}
                </div>
            )}

            {/* Section 1: Món áp dụng & Phân tích giá vốn */}
            <FormSection
                title="Món áp dụng & Phân tích lợi nhuận"
                description="Giá niêm yết, giá vốn nguyên liệu và tỷ suất lợi nhuận gộp"
                icon={ChefHat}
                gridCols={2}
            >
                <div className="flex flex-col justify-center rounded-xl bg-white p-3.5 border border-zinc-200/70 dark:bg-zinc-900 dark:border-zinc-800">
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        Sản phẩm thực đơn
                    </span>
                    <span className="font-display text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                        {product.name}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-sky-600 dark:text-sky-400 mt-1">
                        Giá bán: {Number(product.price).toLocaleString('vi-VN')} ₫
                    </span>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl bg-white p-3.5 border border-zinc-200/70 dark:bg-zinc-900 dark:border-zinc-800">
                    <div>
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            Giá vốn định lượng (COGS)
                        </span>
                        <div className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">
                            {cogs.toLocaleString('vi-VN')} ₫
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            Tỷ suất lãi gộp
                        </span>
                        <div
                            className={`text-sm font-bold tabular-nums mt-0.5 ${
                                marginPercent >= 60
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : marginPercent >= 40
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400'
                            }`}
                        >
                            {marginPercent}%
                        </div>
                    </div>
                </div>
            </FormSection>

            {/* Section 2: Danh sách nguyên liệu cấu thành */}
            <FormSection
                title="Thành phần nguyên liệu tiêu hao"
                description="Các loại nguyên liệu và số lượng cần thiết cho 1 suất phục vụ"
                icon={Scale}
                gridCols={1}
            >
                <div className="space-y-2.5">
                    {lines.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            Chưa có nguyên liệu nào trong công thức món này.
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-200/80 bg-zinc-50/50 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
                                        <th className="px-3.5 py-2.5">Nguyên liệu</th>
                                        <th className="px-3.5 py-2.5 w-32">Định lượng</th>
                                        <th className="px-3.5 py-2.5 w-24">Đơn vị</th>
                                        <th className="px-3.5 py-2.5 w-28 text-right">Chi phí ước tính</th>
                                        <th className="px-3.5 py-2.5 w-12 text-center">Xóa</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                                    {lines.map((line, index) => {
                                        const ing = ingredients.find(
                                            (i) => i.id === line.ingredient_id,
                                        );
                                        const lineCost = ing
                                            ? line.amount * Number(ing.cost_price)
                                            : 0;

                                        return (
                                            <tr
                                                key={index}
                                                className="hover:bg-zinc-50/40 dark:hover:bg-zinc-800/40"
                                            >
                                                <td className="px-3.5 py-2">
                                                    <select
                                                        value={line.ingredient_id}
                                                        onChange={(e) =>
                                                            handleIngredientChange(
                                                                index,
                                                                Number(e.target.value),
                                                            )
                                                        }
                                                        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                    >
                                                        {ingredients.map((ingItem) => (
                                                            <option
                                                                key={ingItem.id}
                                                                value={ingItem.id}
                                                            >
                                                                {ingItem.name} ({ingItem.unit})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>

                                                <td className="px-3.5 py-2">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        min="0.001"
                                                        value={line.amount || ''}
                                                        onChange={(e) =>
                                                            handleAmountChange(
                                                                index,
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder="0"
                                                        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                    />
                                                </td>

                                                <td className="px-3.5 py-2 text-zinc-600 dark:text-zinc-400 font-medium">
                                                    {line.unit}
                                                </td>

                                                <td className="px-3.5 py-2 text-right font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                                                    {lineCost.toLocaleString('vi-VN')} ₫
                                                </td>

                                                <td className="px-3.5 py-2 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveLine(index)}
                                                        className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                                        title="Xóa dòng"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleAddLine}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-sky-600 hover:bg-sky-50/50 dark:text-sky-400 dark:hover:bg-sky-950/20 transition-colors w-full justify-center"
                    >
                        <Plus className="h-3.5 w-3.5 stroke-2" />
                        <span>Thêm dòng nguyên liệu</span>
                    </button>
                </div>
            </FormSection>
        </ManagerFormModal>
    );
}
