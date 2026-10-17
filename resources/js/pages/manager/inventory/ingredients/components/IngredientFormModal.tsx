import { router } from '@inertiajs/react';
import { Boxes, Package, Scale } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { ManagerFormModal, FormSection, FormField } from '@/components/form';
import type { IngredientData } from './IngredientTable';

interface IngredientFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    ingredientToEdit?: IngredientData | null;
}

export default function IngredientFormModal({
    isOpen,
    onClose,
    ingredientToEdit,
}: IngredientFormModalProps) {
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('g');
    const [purchaseUnit, setPurchaseUnit] = useState('');
    const [unitConversion, setUnitConversion] = useState<string>('1');
    const [stockQuantity, setStockQuantity] = useState<string>('0');
    const [minStockAlert, setMinStockAlert] = useState<string>('10');
    const [costPrice, setCostPrice] = useState<string>('0');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            if (ingredientToEdit) {
                setName(ingredientToEdit.name);
                setUnit(ingredientToEdit.unit);
                setPurchaseUnit(ingredientToEdit.purchase_unit || '');
                setUnitConversion(
                    String(ingredientToEdit.unit_conversion || 1),
                );
                setStockQuantity(String(ingredientToEdit.stock_quantity));
                setMinStockAlert(String(ingredientToEdit.min_stock_alert));
                setCostPrice(String(ingredientToEdit.cost_price || 0));
            } else {
                setName('');
                setUnit('g');
                setPurchaseUnit('');
                setUnitConversion('1');
                setStockQuantity('0');
                setMinStockAlert('10');
                setCostPrice('0');
            }

            setErrors({});
        });
    }, [ingredientToEdit, isOpen]);

    const isDirty = useMemo(() => {
        if (ingredientToEdit) {
            return (
                name !== ingredientToEdit.name ||
                unit !== ingredientToEdit.unit ||
                purchaseUnit !== (ingredientToEdit.purchase_unit || '') ||
                unitConversion !==
                    String(ingredientToEdit.unit_conversion || 1) ||
                stockQuantity !== String(ingredientToEdit.stock_quantity) ||
                minStockAlert !== String(ingredientToEdit.min_stock_alert) ||
                costPrice !== String(ingredientToEdit.cost_price || 0)
            );
        }

        return (
            name.trim() !== '' ||
            purchaseUnit.trim() !== '' ||
            unitConversion !== '1' ||
            stockQuantity !== '0' ||
            costPrice !== '0'
        );
    }, [
        ingredientToEdit,
        name,
        unit,
        purchaseUnit,
        unitConversion,
        stockQuantity,
        minStockAlert,
        costPrice,
    ]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
            return;
        }

        setSubmitting(true);

        const payload = {
            name,
            unit,
            purchase_unit: purchaseUnit.trim() || null,
            unit_conversion: Number(unitConversion) || 1,
            stock_quantity: Number(stockQuantity) || 0,
            min_stock_alert: Number(minStockAlert) || 0,
            cost_price: Number(costPrice) || 0,
        };

        if (ingredientToEdit) {
            router.post(
                `/manager/inventory/ingredients/${ingredientToEdit.id}`,
                payload,
                {
                    onSuccess: () => {
                        setSubmitting(false);
                        onClose();
                    },
                    onError: (errs) => {
                        setErrors(errs as any);
                        setSubmitting(false);
                    },
                },
            );
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
        <ManagerFormModal
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={handleSubmit}
            title={
                ingredientToEdit
                    ? 'Cập nhật nguyên liệu'
                    : 'Thêm nguyên liệu mới'
            }
            subtitle="Quản lý nguyên vật liệu pha chế, nấu nướng và định mức cảnh báo tồn kho"
            isEditing={!!ingredientToEdit}
            isDirty={isDirty}
            submitting={submitting}
            size="lg"
            formId="ingredient-form"
        >
            {/* Section 1: Thông tin nguyên liệu */}
            <FormSection
                title="Thông tin cơ bản"
                description="Tên và đơn vị tính định lượng tiêu hao"
                icon={Package}
                gridCols={2}
            >
                <FormField label="Tên nguyên liệu" required error={errors.name}>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ví dụ: Cà phê Robusta, Sữa tươi, Trà đen…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        required
                    />
                </FormField>

                <FormField
                    label="Đơn vị dùng chế biến"
                    required
                    error={errors.unit}
                    hint="Đơn vị trừ kho trong công thức món"
                >
                    <select
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                        <option value="g">Gam (g)</option>
                        <option value="ml">Mililít (ml)</option>
                        <option value="lon">Lon</option>
                        <option value="chai">Chai</option>
                        <option value="trái">Trái / Quả</option>
                        <option value="cái">Cái / Chiếc</option>
                        <option value="khác">Khác…</option>
                    </select>
                </FormField>
            </FormSection>

            {/* Section 2: Đơn vị nhập & Quy đổi */}
            <FormSection
                title="Quy đổi nhập kho"
                description="Quy đổi từ đơn vị nhập mua sang đơn vị tiêu hao"
                icon={Scale}
                gridCols={2}
            >
                <FormField
                    label="Đơn vị nhập hàng"
                    hint="Ví dụ: kg, lít, thùng, lốc, bao…"
                    error={errors.purchase_unit}
                >
                    <input
                        type="text"
                        value={purchaseUnit}
                        onChange={(e) => setPurchaseUnit(e.target.value)}
                        placeholder="kg, thùng, bao…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>

                <FormField
                    label={`Hệ số quy đổi (1 ${purchaseUnit || 'ĐV nhập'} = ? ${unit})`}
                    hint={`1 ${purchaseUnit || 'ĐV nhập'} quy ra bao nhiêu ${unit}`}
                    error={errors.unit_conversion}
                >
                    <input
                        type="number"
                        step="any"
                        value={unitConversion}
                        onChange={(e) => setUnitConversion(e.target.value)}
                        placeholder="1"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>

            {/* Section 3: Định mức tồn kho & Giá vốn */}
            <FormSection
                title="Tồn kho & Giá vốn"
                description="Số lượng tồn và cảnh báo nhập hàng"
                icon={Boxes}
                gridCols={3}
            >
                <FormField
                    label={`Tồn ban đầu (${unit})`}
                    error={errors.stock_quantity}
                >
                    <input
                        type="number"
                        step="any"
                        value={stockQuantity}
                        onChange={(e) => setStockQuantity(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>

                <FormField
                    label={`Cảnh báo tồn tối thiểu (${unit})`}
                    hint="Báo động khi tồn dưới mức này"
                    error={errors.min_stock_alert}
                >
                    <input
                        type="number"
                        step="any"
                        value={minStockAlert}
                        onChange={(e) => setMinStockAlert(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>

                <FormField
                    label={`Giá vốn dự kiến (₫/${unit})`}
                    error={errors.cost_price}
                >
                    <input
                        type="number"
                        step="any"
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>
        </ManagerFormModal>
    );
}
