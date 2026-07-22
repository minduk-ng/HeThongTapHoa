import React, { useState, useEffect, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, FolderTree, Package, Layers } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
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

    // 100% Instant Frontend Search/Filtering via useMemo
    const filteredCategories = useMemo(() => {
        return categories.filter((cat) => {
            const query = searchQuery.trim().toLowerCase();
            if (!query) return true;
            const matchesName = cat.name.toLowerCase().includes(query);
            const matchesDesc = cat.description?.toLowerCase().includes(query);
            const matchesChild = cat.items?.some((item) => item.name.toLowerCase().includes(query));
            return matchesName || matchesDesc || matchesChild;
        });
    }, [categories, searchQuery]);

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
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

    // Calculate summary statistics
    const totalCategories = categories.length;
    const totalProducts = categories.reduce((sum, cat) => sum + (cat.items_count ?? cat.items?.length ?? 0), 0);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý danh mục sản phẩm" />

            <ManagerPageLayout
                sidebar={
                    <>
                        {/* Header */}
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <FolderTree className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                Danh mục sản phẩm
                            </h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Phân loại & sắp xếp thực đơn hàng hóa
                            </p>
                        </div>

                        {/* Primary Fixed Action Button */}
                        <div>
                            <button
                                type="button"
                                onClick={handleOpenAddDrawer}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors duration-150 shadow-xs"
                            >
                                <Plus className="w-4 h-4 stroke-[2]" />
                                <span>Thêm danh mục mới</span>
                            </button>
                        </div>

                        {/* Quick Filter Controls */}
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                                Tìm kiếm & Bộ lọc
                            </label>
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    placeholder="Tìm tên danh mục..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Mini Overview Stats */}
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5 mt-auto">
                            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 block">
                                Tổng quan danh mục
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                    <div className="flex items-center text-zinc-500 text-[11px] mb-1">
                                        <Layers className="w-3.5 h-3.5 mr-1 text-sky-600" />
                                        <span>Danh mục</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-zinc-900 dark:text-zinc-100">
                                        {totalCategories}
                                    </span>
                                </div>

                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                    <div className="flex items-center text-zinc-500 text-[11px] mb-1">
                                        <Package className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                        <span>Sản phẩm</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-zinc-900 dark:text-zinc-100">
                                        {totalProducts}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                }
            >
                {/* Category Accordion Table with Instant Filtering */}
                <CategoryTable
                    categories={filteredCategories}
                    onEdit={handleEditCategory}
                    onDelete={handleDeleteCategory}
                />
            </ManagerPageLayout>

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
                <div className="fixed bottom-4 right-4 z-50 bg-rose-600 text-white text-xs px-4 py-2 rounded-xl shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
