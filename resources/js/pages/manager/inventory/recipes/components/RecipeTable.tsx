import React, { useState, useMemo } from 'react';

export interface RecipeItemData {
    id: number;
    menu_item_id: number;
    ingredient_id: number;
    amount: number;
    unit: string;
    ingredient?: {
        id: number;
        code: string;
        name: string;
        cost_price: number;
        unit: string;
    };
}

export interface ProductRecipeData {
    id: number;
    name: string;
    price: number;
    image?: string | null;
    category_id: number;
    category?: {
        id: number;
        name: string;
    };
    recipes?: RecipeItemData[];
}

interface RecipeTableProps {
    products: ProductRecipeData[];
    onEditRecipe: (product: ProductRecipeData) => void;
}

type SortField = 'id' | 'name' | 'category' | 'price' | 'cogs' | 'margin';
type SortDirection = 'asc' | 'desc';

export default function RecipeTable({ products, onEditRecipe }: RecipeTableProps) {
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('id');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Calculate COGS (Cost of Goods Sold) for a product
    const calculateCOGS = (product: ProductRecipeData) => {
        if (!product.recipes || product.recipes.length === 0) return 0;
        return product.recipes.reduce((sum, r) => {
            const unitCost = r.ingredient?.cost_price || 0;
            return sum + (Number(r.amount) * Number(unitCost));
        }, 0);
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const sortedProducts = useMemo(() => {
        const sorted = [...products];
        sorted.sort((a, b) => {
            let valA: any;
            let valB: any;

            if (sortField === 'cogs') {
                valA = calculateCOGS(a);
                valB = calculateCOGS(b);
            } else if (sortField === 'margin') {
                const cogsA = calculateCOGS(a);
                const cogsB = calculateCOGS(b);
                valA = a.price > 0 ? ((a.price - cogsA) / a.price) * 100 : 0;
                valB = b.price > 0 ? ((b.price - cogsB) / b.price) * 100 : 0;
            } else if (sortField === 'category') {
                valA = a.category?.name || '';
                valB = b.category?.name || '';
            } else {
                valA = a[sortField as keyof ProductRecipeData];
                valB = b[sortField as keyof ProductRecipeData];
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [products, sortField, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedItems = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedProducts.slice(start, start + pageSize);
    }, [sortedProducts, safeCurrentPage, pageSize]);

    const formatCurrency = (val: number) => {
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <span className="text-zinc-300 dark:text-zinc-600 ml-1 text-xs opacity-50">▲</span>;
        }
        return (
            <span className="text-blue-600 dark:text-blue-400 ml-1 text-xs font-bold">
                {sortDirection === 'asc' ? '▲' : '▼'}
            </span>
        );
    };

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs space-y-0">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800 select-none">
                        <tr>
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-12 text-xs' : 'py-3.5 w-16'}`}>STT</th>
                            {!isCompact && <th className="py-3.5 px-4 w-16">Ảnh</th>}
                            <th
                                onClick={() => handleSort('name')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Sản phẩm</span>
                                    {renderSortIcon('name')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('category')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Danh mục</span>
                                    {renderSortIcon('category')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('price')}
                                className={`px-4 text-right cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-end">
                                    <span>Giá bán</span>
                                    {renderSortIcon('price')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('cogs')}
                                className={`px-4 text-right cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-end">
                                    <span>Giá vốn ước tính (COGS)</span>
                                    {renderSortIcon('cogs')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('margin')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Tỷ suất lợi nhuận</span>
                                    {renderSortIcon('margin')}
                                </div>
                            </th>
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-32' : 'py-3.5 w-36'}`}>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedItems.length === 0 ? (
                            <tr>
                                <td colSpan={isCompact ? 7 : 8} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                                    Không có sản phẩm nào phù hợp.
                                </td>
                            </tr>
                        ) : (
                            paginatedItems.map((product, index) => {
                                const realIndex = (safeCurrentPage - 1) * pageSize + index + 1;
                                const cogs = calculateCOGS(product);
                                const hasRecipes = product.recipes && product.recipes.length > 0;
                                const marginPercent = product.price > 0
                                    ? Math.round(((product.price - cogs) / product.price) * 100)
                                    : 0;

                                return (
                                    <tr
                                        key={product.id}
                                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                                    >
                                        <td className={`px-4 text-center text-zinc-500 text-xs ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {realIndex}
                                        </td>
                                        {!isCompact && (
                                            <td className="py-3 px-4">
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                                    {product.image ? (
                                                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        <td className={`px-4 font-medium text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <div>
                                                <p className="font-bold">{product.name}</p>
                                                <span className="text-xs text-zinc-400">
                                                    {hasRecipes ? `${product.recipes!.length} thành phần định lượng` : 'Chưa thiết lập định lượng'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className={`px-4 text-zinc-600 dark:text-zinc-400 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {product.category?.name ?? '—'}
                                        </td>
                                        <td className={`px-4 text-right font-medium text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {formatCurrency(product.price)}
                                        </td>
                                        <td className={`px-4 text-right font-semibold text-amber-600 dark:text-amber-400 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {hasRecipes ? formatCurrency(cogs) : '—'}
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {hasRecipes ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                                    marginPercent >= 60
                                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                        : marginPercent >= 40
                                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                                }`}>
                                                    {marginPercent}% lợi nhuận
                                                </span>
                                            ) : (
                                                <span className="text-xs text-zinc-400">Chưa tính</span>
                                            )}
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <button
                                                type="button"
                                                onClick={() => onEditRecipe(product)}
                                                className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 flex items-center justify-center space-x-1 mx-auto"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                </svg>
                                                <span>Cài công thức</span>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table Footer Controls */}
            <div className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsCompact(!isCompact)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                            isCompact
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        <span>{isCompact ? 'Xem đầy đủ' : 'Thu gọn bảng'}</span>
                    </button>

                    <div className="flex items-center space-x-1 border-l border-zinc-200 dark:border-zinc-700 pl-3">
                        <span className="text-zinc-500 mr-1">Hiển thị:</span>
                        {[20, 50, 100].map((size) => (
                            <button
                                key={size}
                                type="button"
                                onClick={() => {
                                    setPageSize(size);
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                                    pageSize === size
                                        ? 'bg-blue-600 text-white'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                            >
                                {size}
                            </button>
                        ))}
                        <span className="text-zinc-400 ml-1">dòng/trang</span>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage(1)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        |&#9664;
                    </button>

                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9664;
                    </button>

                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-400">
                        <span>Trang</span>
                        <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={safeCurrentPage}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                    setCurrentPage(Math.min(Math.max(1, val), totalPages));
                                }
                            }}
                            className="w-12 text-center py-1 border rounded-md bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 font-semibold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                        <span>/ {totalPages}</span>
                    </div>

                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;
                    </button>

                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;|
                    </button>
                </div>
            </div>
        </div>
    );
}
