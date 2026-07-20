import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import CategoryFilterBar from './components/CategoryFilterBar';
import CategoryTable, { CategoryData } from './components/CategoryTable';
import CategoryFormDrawer from './components/CategoryFormDrawer';

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
    };

    const confirmDelete = () => {
        if (!deletingCategory) return;
        setIsDeleting(true);
        router.delete(`/manager/categories/${deletingCategory.id}`, {
            onSuccess: () => {
                setIsDeleting(false);
                setDeletingCategory(null);
            },
            onError: () => {
                setIsDeleting(false);
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

            {/* Delete Confirmation Modal */}
            {deletingCategory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Xác nhận xóa danh mục</h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Hành động này không thể hoàn tác.</p>
                            </div>
                        </div>

                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            Bạn có chắc chắn muốn xóa danh mục <strong className="font-semibold">{deletingCategory.name}</strong>? Các sản phẩm thuộc danh mục này sẽ chuyển sang trạng thái chưa phân loại (không bị xóa sản phẩm).
                        </p>

                        <div className="flex justify-end space-x-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeletingCategory(null)}
                                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                            >
                                {isDeleting ? 'Đang xóa...' : 'Đồng ý xóa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
