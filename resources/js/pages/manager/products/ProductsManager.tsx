import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ProductFilterBar from './components/ProductFilterBar';
import ProductTable, { MenuItemData } from './components/ProductTable';
import ProductFormDrawer from './components/ProductFormDrawer';
import ExcelImportModal from './components/ExcelImportModal';
import CategoryFormModal from './components/CategoryFormModal';

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

    const handlePriceChange = (min: string, max: string) => {
        setMinPrice(min);
        setMaxPrice(max);
        applyFilters({ min_price: min, max_price: max });
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
    };

    const confirmDelete = () => {
        if (!deletingProduct) return;
        setIsDeleting(true);
        router.delete(`/manager/products/${deletingProduct.id}`, {
            onSuccess: () => {
                setIsDeleting(false);
                setDeletingProduct(null);
            },
            onError: () => {
                setIsDeleting(false);
            },
        });
    };

    const handleExportExcel = () => {
        window.location.href = '/manager/products/export';
    };

    return (
        <DashboardLayout>
            <Head title="Quản lý sản phẩm, hàng hóa" />

            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Quản lý sản phẩm, hàng hóa
                    </h1>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Kho hàng &bull; Sản phẩm, hàng hóa
                    </p>
                </div>

                {/* Filter Bar */}
                <ProductFilterBar
                    statusFilter={statusFilter}
                    onStatusChange={handleStatusChange}
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    selectedCategory={selectedCategory}
                    onCategoryChange={handleCategoryChange}
                    minPrice={minPrice}
                    maxPrice={maxPrice}
                    onPriceChange={handlePriceChange}
                    priceLimits={priceRangeLimits}
                    categories={categories}
                    onOpenAddDrawer={handleOpenAddDrawer}
                    onExportExcel={handleExportExcel}
                    onImportExcelClick={() => setIsImportModalOpen(true)}
                />

                {/* Product Data Table */}
                <ProductTable
                    items={items}
                    onEdit={handleEditProduct}
                    onDelete={handleDeleteProduct}
                />
            </div>

            {/* Product Add / Edit Overlay Drawer */}
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

            {/* Category Add Modal */}
            <CategoryFormModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
            />

            {/* Delete Confirmation Modal */}
            {deletingProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Xác nhận xóa sản phẩm</h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">Hành động này không thể hoàn tác.</p>
                            </div>
                        </div>

                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            Bạn có chắc chắn muốn xóa sản phẩm <strong className="font-semibold">{deletingProduct.name}</strong> (Mã: SP{String(deletingProduct.id).padStart(5, '0')})? File ảnh sản phẩm trên ổ đĩa sẽ tự động bị xóa.
                        </p>

                        <div className="flex justify-end space-x-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeletingProduct(null)}
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
