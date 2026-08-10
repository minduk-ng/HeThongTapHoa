import React, { useState, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, Box, SlidersHorizontal, AlertTriangle, CheckCircle } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import IngredientTable, { IngredientData } from './components/IngredientTable';
import IngredientFormDrawer from './components/IngredientFormDrawer';
import StockImportModal from './components/StockImportModal';
import DeleteConfirmModal from '../../../../components/DeleteConfirmModal';

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
        if (!deletingIngredient) return;

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

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý nguyên liệu & Kho vật tư" />

            <ManagerPageLayout
                sidebar={
                    <>
                        {/* Header */}
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <Box className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý Kho</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                Nguyên liệu & Kho vật tư
                            </h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Quản lý tồn kho nguyên liệu & cảnh báo định mức
                            </p>
                        </div>

                        {/* Primary Fixed Action Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setIsImportOpen(true)}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl transition-colors duration-150 shadow-xs"
                            >
                                <Plus className="w-4 h-4 stroke-[2]" />
                                <span>Nhập kho</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenAddDrawer}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors duration-150 shadow-xs"
                            >
                                <Plus className="w-4 h-4 stroke-[2]" />
                                <span>Thêm mới</span>
                            </button>
                        </div>

                        {/* Filter Controls */}
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Bộ lọc tìm kiếm</span>
                            </label>

                            {/* Search Input */}
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    placeholder="Tìm tên / mã nguyên liệu..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                                />
                            </div>

                            {/* Unit Filter */}
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Đơn vị tính</label>
                                <select
                                    value={selectedUnit}
                                    onChange={(e) => handleUnitChange(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
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
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Cảnh báo tồn kho</label>
                                <select
                                    value={alertFilter}
                                    onChange={(e) => handleAlertChange(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                                >
                                    <option value="all">Tất cả trạng thái kho</option>
                                    <option value="low_stock">Sắp hết hàng (Dưới định mức)</option>
                                    <option value="out_of_stock">Đã hết hàng (Tồn = 0)</option>
                                </select>
                            </div>
                        </div>

                        {/* Mini Overview Stats */}
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5 mt-auto">
                            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 block">
                                Thống kê kho hàng
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                    <div className="flex items-center text-zinc-500 text-[11px] mb-1">
                                        <CheckCircle className="w-3.5 h-3.5 mr-1 text-sky-600" />
                                        <span>Tổng mã</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-zinc-900 dark:text-zinc-100">
                                        {totalCount}
                                    </span>
                                </div>

                                <div className="p-3 bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/60 rounded-xl">
                                    <div className="flex items-center text-amber-700 dark:text-amber-300 text-[11px] mb-1">
                                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                                        <span>Cảnh báo</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-amber-900 dark:text-amber-100">
                                        {lowStockCount + outOfStockCount}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
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
