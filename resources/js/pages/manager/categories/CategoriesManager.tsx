import { Head, router } from '@inertiajs/react';
import { Plus, Search, FolderTree, RotateCcw } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';
import CategoryFormDrawer from './components/CategoryFormDrawer';
import type { CategoryData } from './components/CategoryTable';
import CategoryTable from './components/CategoryTable';

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

    const [prevFilters, setPrevFilters] = useState(filters);

    if (filters !== prevFilters) {
        setPrevFilters(filters);
        setSearchQuery(filters.search || '');
    }

    // 100% Instant Frontend Search/Filtering via useMemo
    const filteredCategories = useMemo(() => {
        return categories.filter((cat) => {
            const query = searchQuery.trim().toLowerCase();

            if (!query) {
return true;
}

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

        if (!deletingCategory) {
return;
}

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

    const hasActiveFilter = Boolean(searchQuery);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý danh mục sản phẩm" />

            <ManagerPageLayout
                icon={FolderTree}
                title="Danh mục sản phẩm"
                subtitle="Phân loại & sắp xếp thực đơn hàng hóa"
                badge={
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                            {totalCategories} danh mục
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {totalProducts} món
                        </span>
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <button
                        type="button"
                        onClick={handleOpenAddDrawer}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5 stroke-2" />
                        <span>Thêm danh mục</span>
                    </button>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Bar */}
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Tìm tên danh mục..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>

                        {/* Reset Filter Button */}
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={() => handleSearchChange('')}
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
