import { Head, router } from '@inertiajs/react';
import { Plus, Search, Upload, Download, UtensilsCrossed, RotateCcw } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';
import CategoryFormModal from './components/CategoryFormModal';
import ExcelImportModal from './components/ExcelImportModal';
import ProductFormDrawer from './components/ProductFormDrawer';
import type { MenuItemData } from './components/ProductTable';
import ProductTable from './components/ProductTable';

interface Category {
    id: number;
    name: string;
    description?: string;
}

interface ProductsManagerProps {
    items: MenuItemData[];
    categories: Category[];
    filters: {
        status?: string;
        search?: string;
        category_id?: string;
        min_price?: string;
        max_price?: string;
    };
    priceRangeLimits?: {
        min: number;
        max: number;
    };
}

export default function ProductsManager({
    items,
    categories,
    filters,
}: ProductsManagerProps) {
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedCategory, setSelectedCategory] = useState(filters.category_id || 'all');

    // Modals and Drawer States
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState<MenuItemData | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    // Delete confirmation state
    const [deletingProduct, setDeletingProduct] = useState<MenuItemData | null>(null);
    const [passwordValue, setPasswordValue] = useState('');
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Sync state with filters on reload/nav
    const [prevFilters, setPrevFilters] = useState(filters);

    if (filters !== prevFilters) {
        setPrevFilters(filters);
        setStatusFilter(filters.status || 'all');
        setSearchQuery(filters.search || '');
        setSelectedCategory(filters.category_id || 'all');
    }

    // 100% Instant Frontend Filtering via useMemo without backend HTTP roundtrips
    const filteredItems = useMemo(() => {
        return items.filter((product) => {
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !query ||
                product.name.toLowerCase().includes(query) ||
                String(product.id).includes(query);

            const matchesCategory =
                selectedCategory === 'all' || String(product.category_id) === selectedCategory;

            let matchesStatus = true;

            if (statusFilter === 'active') {
                matchesStatus = product.is_available === true;
            } else if (statusFilter === 'inactive') {
                matchesStatus = product.is_available === false;
            }

            return matchesSearch && matchesCategory && matchesStatus;
        });
    }, [items, searchQuery, selectedCategory, statusFilter]);

    const handleStatusChange = (status: string) => {
        setStatusFilter(status);
    };

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
    };

    const handleCategoryChange = (catId: string) => {
        setSelectedCategory(catId);
    };

    const handleOpenAddDrawer = () => {
        setProductToEdit(null);
        setIsDrawerOpen(true);
    };

    const handleEditProduct = (product: MenuItemData) => {
        setProductToEdit(product);
        setIsDrawerOpen(true);
    };

    const handleDeleteProduct = (product: MenuItemData) => {
        setDeletingProduct(product);
        setPasswordValue('');
        setDeleteError(null);
    };

    const confirmDelete = (e: React.FormEvent) => {
        e.preventDefault();

        if (!deletingProduct) {
return;
}

        if (!passwordValue) {
            setDeleteError('Vui lòng nhập mật khẩu xác nhận');

            return;
        }

        setIsDeleting(true);
        setDeleteError(null);

        router.delete(`/manager/products/${deletingProduct.id}`, {
            data: { password: passwordValue },
            onSuccess: () => {
                setIsDeleting(false);
                setDeletingProduct(null);
                setPasswordValue('');
            },
            onError: (errs: any) => {
                setIsDeleting(false);

                if (errs.password) {
                    setDeleteError(errs.password);
                } else {
                    setDeleteError('Không thể xóa sản phẩm. Vui lòng kiểm tra lại.');
                }
            },
        });
    };

    const handleExportExcel = () => {
        window.location.href = '/manager/products/export';
    };

    const hasActiveFilter = Boolean(searchQuery || selectedCategory !== 'all' || statusFilter !== 'all');

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý sản phẩm, hàng hóa" />

            <ManagerPageLayout
                icon={UtensilsCrossed}
                title="Sản phẩm & Thực đơn"
                subtitle="Quản lý danh sách món ăn, giá bán & định mức VAT"
                badge={
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {items.length} món
                    </span>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                        >
                            <Upload className="w-3.5 h-3.5 stroke-[1.5]" />
                            <span>Nhập Excel</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                        >
                            <Download className="w-3.5 h-3.5 stroke-[1.5]" />
                            <span>Xuất Excel</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleOpenAddDrawer}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5 stroke-2" />
                            <span>Thêm món</span>
                        </button>
                    </div>
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
                                placeholder="Tìm tên món / mã SP..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>

                        {/* Category Filter */}
                        <div className="w-48">
                            <select
                                value={selectedCategory}
                                onChange={(e) => handleCategoryChange(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả danh mục ({categories.length})</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={String(cat.id)}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="w-44">
                            <select
                                value={statusFilter}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả trạng thái</option>
                                <option value="active">Đang kinh doanh</option>
                                <option value="inactive">Ngừng kinh doanh</option>
                            </select>
                        </div>

                        {/* Reset Filter Button */}
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={() => {
                                    handleSearchChange('');
                                    handleCategoryChange('all');
                                    handleStatusChange('all');
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
                {/* Product Data Table with Instant Frontend Filtering */}
                <ProductTable
                    items={filteredItems}
                    onEdit={handleEditProduct}
                    onDelete={handleDeleteProduct}
                />
            </ManagerPageLayout>

            {/* Product Form Drawer */}
            <ProductFormDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                productToEdit={productToEdit}
                categories={categories}
                onOpenAddCategoryModal={() => setIsCategoryModalOpen(true)}
            />

            {/* Excel Import Modal */}
            <ExcelImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
            />

            {/* Category Quick Add Modal */}
            <CategoryFormModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
            />

            {/* Delete Password Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!deletingProduct}
                title="Xác nhận xóa sản phẩm"
                description={`Bạn có chắc chắn muốn xóa sản phẩm ${deletingProduct?.name || ''}? Thao tác này sẽ cập nhật trạng thái ngừng kinh doanh.`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingProduct(null)}
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
