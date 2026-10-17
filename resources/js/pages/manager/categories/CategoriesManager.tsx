import { Head, router } from '@inertiajs/react';
import { Plus, Search, FolderTree, RotateCcw } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';
import CategoryFormModal from './components/CategoryFormModal';
import type { CategoryData } from './components/CategoryTable';
import CategoryTable from './components/CategoryTable';

interface CategoriesManagerProps {
    categories: CategoryData[];
    filters: {
        search?: string;
    };
}

export default function CategoriesManager({
    categories,
    filters,
}: CategoriesManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');

    // Modals States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState<CategoryData | null>(
        null,
    );

    // Delete confirmation state
    const [deletingCategory, setDeletingCategory] =
        useState<CategoryData | null>(null);
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
            const matchesChild = cat.items?.some((item) =>
                item.name.toLowerCase().includes(query),
            );

            return matchesName || matchesDesc || matchesChild;
        });
    }, [categories, searchQuery]);

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
    };

    const handleOpenAddModal = () => {
        setCategoryToEdit(null);
        setIsModalOpen(true);
    };

    const handleEditCategory = (category: CategoryData) => {
        setCategoryToEdit(category);
        setIsModalOpen(true);
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
                    setDeleteError(
                        'Không thể xóa danh mục. Vui lòng kiểm tra lại.',
                    );
                }
            },
        });
    };

    // Calculate summary statistics
    const totalCategories = categories.length;
    const totalProducts = categories.reduce(
        (sum, cat) => sum + (cat.items_count ?? cat.items?.length ?? 0),
        0,
    );

    const hasActiveFilter = Boolean(searchQuery);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý danh mục sản phẩm" />

            <ManagerPageLayout
                icon={FolderTree}
                title="Danh mục sản phẩm"
                subtitle="Phân loại & sắp xếp thực đơn hàng hóa"
                badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {totalCategories} danh mục
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {totalProducts} món
                        </span>
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <button
                        type="button"
                        onClick={handleOpenAddModal}
                        className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800"
                    >
                        <Plus className="h-3.5 w-3.5 stroke-2" />
                        <span>Thêm danh mục</span>
                    </button>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Bar */}
                        <div className="relative max-w-xs min-w-[200px] flex-1">
                            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) =>
                                    handleSearchChange(e.target.value)
                                }
                                placeholder="Tìm tên danh mục..."
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-8 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            />
                        </div>

                        {/* Reset Filter Button */}
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={() => handleSearchChange('')}
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
                {/* Category Accordion Table with Instant Filtering */}
                <CategoryTable
                    categories={filteredCategories}
                    onEdit={handleEditCategory}
                    onDelete={handleDeleteCategory}
                />
            </ManagerPageLayout>

            {/* Category Form Modal */}
            <CategoryFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
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
                <div className="fixed right-4 bottom-4 z-50 rounded-xl bg-rose-600 px-4 py-2 text-xs text-white shadow-lg">
                    {deleteError}
                </div>
            )}
        </DashboardLayout>
    );
}
