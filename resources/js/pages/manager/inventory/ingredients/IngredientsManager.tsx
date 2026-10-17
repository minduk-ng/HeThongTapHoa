import { Head, router } from '@inertiajs/react';
import { Plus, Search, Package, RotateCcw } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DeleteConfirmModal from '../../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import IngredientFormModal from './components/IngredientFormModal';
import type { IngredientData } from './components/IngredientTable';
import IngredientTable from './components/IngredientTable';
import StockImportModal from './components/StockImportModal';

interface IngredientsManagerProps {
    ingredients: IngredientData[];
    units: string[];
    suppliers?: { id: number; name: string }[];
    filters: {
        search?: string;
        unit?: string;
        alert?: string;
    };
}

export default function IngredientsManager({
    ingredients,
    units,
    suppliers = [],
    filters,
}: IngredientsManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedUnit, setSelectedUnit] = useState(filters.unit || 'all');
    const [alertFilter, setAlertFilter] = useState(filters.alert || 'all');

    // Modals States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [ingredientToEdit, setIngredientToEdit] =
        useState<IngredientData | null>(null);
    const [isImportOpen, setIsImportOpen] = useState(false);

    // Delete confirmation state
    const [deletingIngredient, setDeletingIngredient] =
        useState<IngredientData | null>(null);
    const [passwordValue, setPasswordValue] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // 100% Frontend filtering via useMemo without backend HTTP roundtrips
    const filteredIngredients = useMemo(() => {
        return ingredients.filter((item) => {
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !query ||
                item.name.toLowerCase().includes(query) ||
                (item.code && item.code.toLowerCase().includes(query));

            const matchesUnit =
                selectedUnit === 'all' || item.unit === selectedUnit;

            let matchesAlert = true;

            if (alertFilter === 'low_stock') {
                const minAlert =
                    item.min_stock_alert !== undefined
                        ? item.min_stock_alert
                        : 5;
                matchesAlert = Number(item.stock_quantity || 0) <= minAlert;
            } else if (alertFilter === 'out_of_stock') {
                matchesAlert = Number(item.stock_quantity || 0) <= 0;
            }

            return matchesSearch && matchesUnit && matchesAlert;
        });
    }, [ingredients, searchQuery, selectedUnit, alertFilter]);

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
    };

    const handleUnitChange = (unit: string) => {
        setSelectedUnit(unit);
    };

    const handleAlertChange = (alert: string) => {
        setAlertFilter(alert);
    };

    const handleOpenAddModal = () => {
        setIngredientToEdit(null);
        setIsModalOpen(true);
    };

    const handleEditIngredient = (ingredient: IngredientData) => {
        setIngredientToEdit(ingredient);
        setIsModalOpen(true);
    };

    const handleDeleteIngredient = (ingredient: IngredientData) => {
        setDeletingIngredient(ingredient);
        setPasswordValue('');
        setDeleteError(null);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();

        if (!deletingIngredient) {
            return;
        }

        if (!passwordValue) {
            setDeleteError('Vui lòng nhập mật khẩu xác nhận');

            return;
        }

        setIsDeleting(true);
        setDeleteError(null);

        router.delete(
            `/manager/inventory/ingredients/${deletingIngredient.id}`,
            {
                data: { password: passwordValue },
                onSuccess: () => {
                    setIsDeleting(false);
                    setDeletingIngredient(null);
                    setPasswordValue('');
                },
                onError: (errs: any) => {
                    setIsDeleting(false);

                    if (errs.password) {
                        setDeleteError(errs.password);
                    } else {
                        setDeleteError(
                            'Không thể xóa nguyên liệu. Vui lòng kiểm tra lại.',
                        );
                    }
                },
            },
        );
    };

    // Mini Stats calculations
    const totalCount = ingredients.length;
    const lowStockCount = ingredients.filter((i) => {
        const minAlert =
            i.min_stock_alert !== undefined ? i.min_stock_alert : 5;

        return (
            Number(i.stock_quantity || 0) <= minAlert &&
            Number(i.stock_quantity || 0) > 0
        );
    }).length;
    const outOfStockCount = ingredients.filter(
        (i) => Number(i.stock_quantity || 0) <= 0,
    ).length;

    const hasActiveFilter = Boolean(
        searchQuery || selectedUnit !== 'all' || alertFilter !== 'all',
    );

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý nguyên liệu & Kho vật tư" />

            <ManagerPageLayout
                icon={Package}
                title="Nguyên liệu & Kho vật tư"
                subtitle="Quản lý định mức tồn kho và cảnh báo hao hụt nguyên liệu"
                badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {totalCount} nguyên liệu
                        </span>
                        {lowStockCount + outOfStockCount > 0 && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                                {lowStockCount + outOfStockCount} cảnh báo tồn
                            </span>
                        )}
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsImportOpen(true)}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 active:bg-emerald-800"
                        >
                            <Plus className="h-3.5 w-3.5 stroke-2" />
                            <span>Nhập kho</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleOpenAddModal}
                            className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800"
                        >
                            <Plus className="h-3.5 w-3.5 stroke-2" />
                            <span>Thêm nguyên liệu</span>
                        </button>
                    </div>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative max-w-xs min-w-[200px] flex-1">
                            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) =>
                                    handleSearchChange(e.target.value)
                                }
                                placeholder="Tìm tên / mã nguyên liệu..."
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-8 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            />
                        </div>

                        {/* Unit Filter */}
                        <div className="w-44">
                            <select
                                value={selectedUnit}
                                onChange={(e) =>
                                    handleUnitChange(e.target.value)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            >
                                <option value="all">
                                    Tất cả đơn vị ({units.length})
                                </option>
                                {units.map((unit) => (
                                    <option key={unit} value={unit}>
                                        {unit}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Alert Filter */}
                        <div className="w-52">
                            <select
                                value={alertFilter}
                                onChange={(e) =>
                                    handleAlertChange(e.target.value)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            >
                                <option value="all">
                                    Tất cả trạng thái kho
                                </option>
                                <option value="low_stock">
                                    Sắp hết hàng (Dưới định mức)
                                </option>
                                <option value="out_of_stock">
                                    Đã hết hàng (Tồn = 0)
                                </option>
                            </select>
                        </div>

                        {/* Reset Filter Button */}
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={() => {
                                    handleSearchChange('');
                                    handleUnitChange('all');
                                    handleAlertChange('all');
                                }}
                                className="flex items-center gap-1 rounded-xl bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                title="Đặt lại bộ lọc"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Đặt lại</span>
                            </button>
                        )}
                    </div>
                }
            >
                {/* Summary Strip & Ingredient Data Table */}
                <div className="flex h-full min-h-0 flex-col">
                    <div className="mb-3 flex shrink-0 flex-wrap items-center gap-6 px-1">
                        <div className="flex items-baseline gap-2">
                            <span className="font-display text-2xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                                {totalCount}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                loại nguyên liệu
                            </span>
                        </div>
                        <span className="text-zinc-300 select-none dark:text-zinc-700">
                            •
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className="font-display text-2xl font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                                {lowStockCount}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                sắp hết hàng
                            </span>
                        </div>
                        <span className="text-zinc-300 select-none dark:text-zinc-700">
                            •
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className="font-display text-2xl font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                                {outOfStockCount}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                đã hết hàng
                            </span>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <IngredientTable
                            ingredients={filteredIngredients}
                            onEdit={handleEditIngredient}
                            onDelete={handleDeleteIngredient}
                        />
                    </div>
                </div>
            </ManagerPageLayout>

            {/* Ingredient Add/Edit Modal */}
            <IngredientFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                ingredientToEdit={ingredientToEdit}
            />

            {/* Stock Import Modal */}
            <StockImportModal
                ingredients={ingredients}
                suppliers={suppliers}
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
            />

            {/* Delete Password Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!deletingIngredient}
                title="Xác nhận xóa nguyên liệu"
                description={`Bạn có chắc chắn muốn xóa nguyên liệu ${deletingIngredient?.name || ''}?`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingIngredient(null)}
                onConfirm={confirmDelete}
                processing={isDeleting}
            />
            {deleteError && (
                <div className="fixed right-4 bottom-4 z-50 rounded-xl bg-rose-600 px-4 py-2 text-xs text-white shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
