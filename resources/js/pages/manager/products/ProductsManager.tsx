import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ProductFilterBar from './components/ProductFilterBar';
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

            {/* Delete Password Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!deletingProduct}
                title="Xác nhận xóa sản phẩm"
                description={`Bạn có chắc chắn muốn xóa sản phẩm ${deletingProduct?.name || ''} (Mã SP${String(deletingProduct?.id || 0).padStart(5, '0')})? File ảnh trên đĩa sẽ bị xóa.`}
                passwordValue={passwordValue}
                onPasswordChange={setPasswordValue}
                onClose={() => setDeletingProduct(null)}
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

