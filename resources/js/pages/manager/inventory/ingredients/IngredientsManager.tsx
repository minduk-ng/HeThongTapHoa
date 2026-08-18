import { Head, router } from '@inertiajs/react';
import { Plus, Search, Package, RotateCcw } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DeleteConfirmModal from '../../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import IngredientFormDrawer from './components/IngredientFormDrawer';
import type { IngredientData } from './components/IngredientTable';
import IngredientTable from './components/IngredientTable';
import StockImportModal from './components/StockImportModal';

interface IngredientsManagerProps {
    ingredients: IngredientData[];
    units: string[];
    filters: {
        search?: string;
        unit?: string;
        alert?: string;
    };
}

export default function IngredientsManager({
    ingredients,
    units,
    filters,
}: IngredientsManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedUnit, setSelectedUnit] = useState(filters.unit || 'all');
    const [alertFilter, setAlertFilter] = useState(filters.alert || 'all');

    // Modals and Drawer States
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [ingredientToEdit, setIngredientToEdit] = useState<IngredientData | null>(null);
    const [isImportOpen, setIsImportOpen] = useState(false);

    // Delete confirmation state
    const [deletingIngredient, setDeletingIngredient] = useState<IngredientData | null>(null);
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

            const matchesUnit = selectedUnit === 'all' || item.unit === selectedUnit;

            let matchesAlert = true;

            if (alertFilter === 'low_stock') {
                const minAlert = item.min_stock_alert !== undefined ? item.min_stock_alert : 5;
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

    const handleOpenAddDrawer = () => {
        setIngredientToEdit(null);
        setIsDrawerOpen(true);
    };

    const handleEditIngredient = (ingredient: IngredientData) => {
        setIngredientToEdit(ingredient);
        setIsDrawerOpen(true);
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

        router.delete(`/manager/inventory/ingredients/${deletingIngredient.id}`, {
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
                    setDeleteError('Không thể xóa nguyên liệu. Vui lòng kiểm tra lại.');
                }
            },
        });
    };

    // Mini Stats calculations
    const totalCount = ingredients.length;
    const lowStockCount = ingredients.filter((i) => {
        const minAlert = i.min_stock_alert !== undefined ? i.min_stock_alert : 5;

        return Number(i.stock_quantity || 0) <= minAlert && Number(i.stock_quantity || 0) > 0;
    }).length;
    const outOfStockCount = ingredients.filter((i) => Number(i.stock_quantity || 0) <= 0).length;

    const hasActiveFilter = Boolean(searchQuery || selectedUnit !== 'all' || alertFilter !== 'all');

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý nguyên liệu & Kho vật tư" />

            <ManagerPageLayout
                icon={Package}
                title="Nguyên liệu & Kho vật tư"
                subtitle="Quản lý định mức tồn kho và cảnh báo hao hụt nguyên liệu"
                badge={
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                            {totalCount} nguyên liệu
                        </span>
                        {lowStockCount + outOfStockCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
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
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl transition-colors shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5 stroke-2" />
                            <span>Nhập kho</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleOpenAddDrawer}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5 stroke-2" />
                            <span>Thêm nguyên liệu</span>
                        </button>
                    </div>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Tìm tên / mã nguyên liệu..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>

                        {/* Unit Filter */}
                        <div className="w-44">
                            <select
                                value={selectedUnit}
                                onChange={(e) => handleUnitChange(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả đơn vị ({units.length})</option>
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
                                onChange={(e) => handleAlertChange(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả trạng thái kho</option>
                                <option value="low_stock">Sắp hết hàng (Dưới định mức)</option>
                                <option value="out_of_stock">Đã hết hàng (Tồn = 0)</option>
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
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                title="Đặt lại bộ lọc"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Đặt lại</span>
                            </button>
                        )}
                    </div>
                }
            >
                {/* Ingredient Data Table */}
                <IngredientTable
                    ingredients={filteredIngredients}
                    onEdit={handleEditIngredient}
                    onDelete={handleDeleteIngredient}
                />
            </ManagerPageLayout>

            {/* Ingredient Add/Edit Drawer */}
            <IngredientFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                ingredientToEdit={ingredientToEdit}
            />

            {/* Stock Import Modal */}
            <StockImportModal
                ingredients={ingredients}
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
                <div className="fixed bottom-4 right-4 z-50 bg-rose-600 text-white text-xs px-4 py-2 rounded-xl shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
