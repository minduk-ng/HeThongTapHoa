import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, Upload, Download, UtensilsCrossed, Package, Layers, SlidersHorizontal } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import ProductTable, { MenuItemData } from './components/ProductTable';
import ProductFormDrawer from './components/ProductFormDrawer';
import ExcelImportModal from './components/ExcelImportModal';
import CategoryFormModal from './components/CategoryFormModal';
import DeleteConfirmModal from '../../../components/DeleteConfirmModal';

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
    priceRangeLimits,
}: ProductsManagerProps) {
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedCategory, setSelectedCategory] = useState(filters.category_id || 'all');
    const [minPrice, setMinPrice] = useState(filters.min_price || '');
    const [maxPrice, setMaxPrice] = useState(filters.max_price || '');

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
    useEffect(() => {
        setStatusFilter(filters.status || 'all');
        setSearchQuery(filters.search || '');
        setSelectedCategory(filters.category_id || 'all');
        setMinPrice(filters.min_price || '');
        setMaxPrice(filters.max_price || '');
    }, [filters]);

    // Handle filter application
    const applyFilters = (newFilters: Record<string, any>) => {
        router.get(
            '/manager/products',
            {
                status: statusFilter,
                search: searchQuery,
                category_id: selectedCategory,
                min_price: minPrice,
                max_price: maxPrice,
                ...newFilters,
            },
            { preserveState: true, replace: true }
        );
    };

    const handleStatusChange = (status: string) => {
        setStatusFilter(status);
        applyFilters({ status });
    };

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        applyFilters({ search: query });
    };

    const handleCategoryChange = (catId: string) => {
        setSelectedCategory(catId);
        applyFilters({ category_id: catId });
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
        if (!deletingProduct) return;

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

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý sản phẩm, hàng hóa" />

            <ManagerPageLayout
                sidebar={
                    <>
                        {/* Header */}
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <UtensilsCrossed className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                Sản phẩm & Thực đơn
                            </h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Quản lý danh sách món ăn, giá bán & định mức VAT
                            </p>
                        </div>

                        {/* Primary Fixed Action Buttons */}
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={handleOpenAddDrawer}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors duration-150 shadow-xs"
                            >
                                <Plus className="w-4 h-4 stroke-[2]" />
                                <span>Thêm sản phẩm mới</span>
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                >
                                    <Upload className="w-3.5 h-3.5 stroke-[1.5]" />
                                    <span>Nhập Excel</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportExcel}
                                    className="flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5 stroke-[1.5]" />
                                    <span>Xuất Excel</span>
                                </button>
                            </div>
                        </div>

                        {/* Filter Controls */}
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Bộ lọc tìm kiếm</span>
                            </label>

                            {/* Search Bar */}
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    placeholder="Tìm tên món / mã SP..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                                />
                            </div>

                            {/* Category Filter */}
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Danh mục</label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => handleCategoryChange(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
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
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Trạng thái kinh doanh</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                                >
                                    <option value="all">Tất cả trạng thái</option>
                                    <option value="active">Đang kinh doanh</option>
                                    <option value="inactive">Ngừng kinh doanh</option>
                                </select>
                            </div>
                        </div>

                        {/* Mini Overview Stats */}
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5 mt-auto">
                            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 block">
                                Thống kê tổng quan
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                    <div className="flex items-center text-zinc-500 text-[11px] mb-1">
                                        <Package className="w-3.5 h-3.5 mr-1 text-sky-600" />
                                        <span>Tổng món</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-zinc-900 dark:text-zinc-100">
                                        {items.length}
                                    </span>
                                </div>

                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                    <div className="flex items-center text-zinc-500 text-[11px] mb-1">
                                        <Layers className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                        <span>Danh mục</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-zinc-900 dark:text-zinc-100">
                                        {categories.length}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                }
            >
                {/* Product Data Table */}
                <ProductTable
                    items={items}
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
