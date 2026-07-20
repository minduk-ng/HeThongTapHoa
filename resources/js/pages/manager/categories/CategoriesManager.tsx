import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import CategoryFilterBar from './components/CategoryFilterBar';
import CategoryTable, { CategoryData } from './components/CategoryTable';
import CategoryFormDrawer from './components/CategoryFormDrawer';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';

interface CategoriesManagerProps {
    categories: CategoryData[];
    filters: {
        search?: string;
    };
}

export default function CategoriesManager({ categories, filters }: CategoriesManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');

    // Modals and Drawer States
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<CategoryData | null>(null);

    // Delete confirmation state
    const [deletingCategory, setDeletingCategory] = useState<CategoryData | null>(null);
    const [passwordValue, setPasswordValue] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        setSearchQuery(filters.search || '');
    }, [filters]);

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        router.get(
            '/manager/categories',
            { search: query },
            { preserveState: true, replace: true }
        );
    };

    const handleOpenAddDrawer = () => {
        setCategoryToEdit(null);
        setIsDrawerOpen(true);
    };

    const handleEditCategory = (category: CategoryData) => {
        setCategoryToEdit(category);
        setIsDrawerOpen(true);
    };

    const handleDeleteCategory = (category: CategoryData) => {
        setDeletingCategory(category);
        setPasswordValue('');
        setDeleteError(null);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();
        if (!deletingCategory) return;

        if (!passwordValue) {
            setDeleteError('Vui lòng nhập mật khẩu xác nhận');
            return;
        }

        setIsDeleting(true);
        setDeleteError(null);

        router.delete(`/manager/categories/${deletingCategory.id}`, {
            data: { password: passwordValue },
            onSuccess: () => {
                setIsDeleting(false);
                setDeletingCategory(null);
                setPasswordValue('');
            },
            onError: (errs: any) => {
                setIsDeleting(false);
                if (errs.password) {
                    setDeleteError(errs.password);
                } else {
                    setDeleteError('Không thể xóa danh mục. Vui lòng kiểm tra lại.');
                }
            },
        });
    };

    return (
        <DashboardLayout>
            <Head title="Quản lý danh mục sản phẩm" />

            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Quản lý danh mục sản phẩm
                    </h1>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Kho hàng &bull; Danh mục sản phẩm
                    </p>
                </div>

                {/* Filter Bar */}
                <CategoryFilterBar
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    onOpenAddDrawer={handleOpenAddDrawer}
                />

                {/* Category Accordion Tree Table */}
                <CategoryTable
                    categories={categories}
                    onEdit={handleEditCategory}
                    onDelete={handleDeleteCategory}
                />
            </div>

            {/* Category Form Drawer */}
            <CategoryFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                categoryToEdit={categoryToEdit}
            />

            {/* Delete Password Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!deletingCategory}
                title="Xác nhận xóa danh mục"
                description={`Bạn có chắc chắn muốn xóa danh mục ${deletingCategory?.name || ''}? Các sản phẩm thuộc danh mục sẽ chuyển thành không rõ.`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingCategory(null)}
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
