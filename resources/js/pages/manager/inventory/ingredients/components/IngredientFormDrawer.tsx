import React, { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { IngredientData } from './IngredientTable';

interface IngredientFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    ingredientToEdit?: IngredientData | null;
}

export default function IngredientFormDrawer({
    isOpen,
    onClose,
    ingredientToEdit,
}: IngredientFormDrawerProps) {
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('g');
    const [purchaseUnit, setPurchaseUnit] = useState('');
    const [unitConversion, setUnitConversion] = useState<string>('1');
    const [stockQuantity, setStockQuantity] = useState<string>('0');
    const [minStockAlert, setMinStockAlert] = useState<string>('50');
    const [costPrice, setCostPrice] = useState<string>('0');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (ingredientToEdit) {
            setName(ingredientToEdit.name || '');
            setUnit(ingredientToEdit.unit || 'g');
            setPurchaseUnit(ingredientToEdit.purchase_unit || '');
            setUnitConversion(String(ingredientToEdit.unit_conversion ?? 1));
            setStockQuantity(String(ingredientToEdit.stock_quantity ?? 0));
            setMinStockAlert(String(ingredientToEdit.min_stock_alert ?? 50));
            setCostPrice(String(ingredientToEdit.cost_price ?? 0));
        } else {
            setName('');
            setUnit('g');
            setPurchaseUnit('');
            setUnitConversion('1');
            setStockQuantity('0');
            setMinStockAlert('50');
            setCostPrice('0');
        }
        setErrors({});
    }, [ingredientToEdit, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const payload = {
            name,
            unit,
            purchase_unit: purchaseUnit || null,
            unit_conversion: Number(unitConversion) || 1,
            stock_quantity: Number(stockQuantity) || 0,
            min_stock_alert: Number(minStockAlert) || 0,
            cost_price: Number(costPrice) || 0,
        };

        if (ingredientToEdit) {
            router.post(`/manager/inventory/ingredients/${ingredientToEdit.id}`, payload, {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            });
        } else {
            router.post('/manager/inventory/ingredients', payload, {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            });
        }
    };

    return (
        <div className="fixed inset-0 z-[100] overflow-hidden">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10 z-[101]">
                <div className="w-screen max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between">
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                            {ingredientToEdit ? 'Cập nhật nguyên liệu' : 'Thêm nguyên liệu mới'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <form id="ingredient-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Tên nguyên liệu vật tư <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ví dụ: Cà phê hạt, Sữa đặc..."
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Đơn vị tính <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={unit}
                                onChange={(e) => setUnit(e.target.value)}
                                placeholder="g, ml, cái, lon, kg, lít..."
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                            {errors.unit && <p className="text-xs text-red-500 mt-1">{errors.unit}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Đơn vị mua
                                </label>
                                <input
                                    type="text"
                                    value={purchaseUnit}
                                    onChange={(e) => setPurchaseUnit(e.target.value)}
                                    placeholder="kg, l, gói, hộp..."
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-[11px] text-zinc-400 mt-1">Để trống = dùng đơn vị tính</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Hệ số quy đổi
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={unitConversion}
                                    onChange={(e) => setUnitConversion(e.target.value)}
                                    placeholder="1"
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-[11px] text-zinc-400 mt-1">1 đơn vị mua = N đơn vị tính</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Tồn kho ban đầu
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={stockQuantity}
                                    onChange={(e) => setStockQuantity(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Cảnh báo tối thiểu
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    value={minStockAlert}
                                    onChange={(e) => setMinStockAlert(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Giá vốn đơn vị (VNĐ/{unit || 'đơn vị'})
                            </label>
                            <input
                                type="number"
                                value={costPrice}
                                onChange={(e) => setCostPrice(e.target.value)}
                                placeholder="0"
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </form>

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
                            form="ingredient-form"
                            disabled={submitting}
                            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
                        >
                            {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
