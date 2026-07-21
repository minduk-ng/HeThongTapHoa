import React, { useState, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import IngredientFilterBar from './components/IngredientFilterBar';
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
    const [importIngredient, setImportIngredient] = useState<IngredientData | null>(null);

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

    return (
        <DashboardLayout>
            <Head title="Quản lý nguyên liệu & Kho vật tư" />

            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Quản lý nguyên liệu & Kho vật tư
                    </h1>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Kho hàng &bull; Nguyên liệu & Vật tư pha chế
                    </p>
                </div>

                {/* Filter Bar */}
                <IngredientFilterBar
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    selectedUnit={selectedUnit}
                    onUnitChange={handleUnitChange}
                    alertFilter={alertFilter}
                    onAlertChange={handleAlertChange}
                    units={units}
                    onOpenAddDrawer={handleOpenAddDrawer}
                />

                {/* Ingredient Data Table */}
                <IngredientTable
                    ingredients={filteredIngredients}
                    onEdit={handleEditIngredient}
                    onDelete={handleDeleteIngredient}
                    onImportStock={(item) => setImportIngredient(item)}
                />
            </div>

            {/* Ingredient Add/Edit Drawer */}
            <IngredientFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                ingredientToEdit={ingredientToEdit}
            />

            {/* Quick Stock Import Modal */}
            <StockImportModal
                ingredient={importIngredient}
                onClose={() => setImportIngredient(null)}
            />

            {/* Delete Password Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!deletingIngredient}
                title="Xác nhận xóa nguyên liệu"
                description={`Bạn có chắc chắn muốn xóa nguyên liệu ${deletingIngredient?.name || ''} (${deletingIngredient?.code || ''})?`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingIngredient(null)}
                onConfirm={confirmDelete}
                processing={isDeleting}
            />
            {deleteError && (
                <div className="fixed bottom-4 right-4 z-50 bg-rose-600 text-white text-xs px-4 py-2 rounded-lg shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
