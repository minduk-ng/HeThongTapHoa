import React, { useState, useMemo } from 'react';
import { ChefHat, ChevronUp, ChevronDown, Image as ImageIcon, Edit3, Rows3 } from 'lucide-react';

export interface RecipeItem {
    id: number;
    product_id: number;
    ingredient_id: number;
    amount: number;
    unit: string;
    ingredient?: {
        id: number;
        name: string;
        cost_price: number;
        unit: string;
    };
}

export interface ProductRecipeData {
    id: number;
    name: string;
    price: number;
    image: string | null;
    category_id: number | null;
    category?: {
        id: number;
        name: string;
    };
    recipes?: RecipeItem[];
}

interface RecipeTableProps {
    products: ProductRecipeData[];
    onEditRecipe: (product: ProductRecipeData) => void;
}

type SortField = 'name' | 'category' | 'price' | 'cogs' | 'margin';
type SortDirection = 'asc' | 'desc';

export default function RecipeTable({ products, onEditRecipe }: RecipeTableProps) {
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Calculate COGS (Cost of Goods Sold) for a product
    const calculateCOGS = (product: ProductRecipeData) => {
        if (!product.recipes || product.recipes.length === 0) return 0;
        return product.recipes.reduce((sum, item) => {
            const cost = item.ingredient ? Number(item.ingredient.cost_price) : 0;
            return sum + item.amount * cost;
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
            return <ChevronUp className="w-3.5 h-3.5 ml-1 text-zinc-300 dark:text-zinc-600 opacity-50 inline" />;
        }
        return sortDirection === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        ) : (
            <ChevronDown className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl shadow-xs">
            {/* Scrollable Data Area */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-left text-sm relative">
                    <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800 select-none">
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
                                <td colSpan={isCompact ? 7 : 8} className="py-12 px-6">
                                    <div className="flex items-start space-x-4 max-w-md">
                                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 flex items-center justify-center shrink-0">
                                            <ChefHat className="w-5 h-5 stroke-[1.5]" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                Không tìm thấy định lượng
                                            </h4>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                                                Không tìm thấy món ăn nào phù hợp với bộ lọc. Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc chọn danh mục khác.
                                            </p>
                                        </div>
                                    </div>
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
                                        <td className={`px-4 text-center text-zinc-500 text-xs tabular-nums ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {realIndex}
                                        </td>
                                        {!isCompact && (
                                            <td className="py-3 px-4">
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                                    {product.image ? (
                                                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ImageIcon className="w-5 h-5 text-zinc-400 stroke-[1.5]" />
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        <td className={`px-4 font-medium text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <div>
                                                <p className="font-bold">{product.name}</p>
                                                <span className="text-xs text-zinc-400 tabular-nums">
                                                    {hasRecipes ? `${product.recipes!.length} thành phần định lượng` : 'Chưa thiết lập định lượng'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className={`px-4 text-zinc-600 dark:text-zinc-400 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {product.category?.name ?? '—'}
                                        </td>
                                        <td className={`px-4 text-right font-medium text-zinc-900 dark:text-zinc-100 tabular-nums ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {formatCurrency(product.price)}
                                        </td>
                                        <td className={`px-4 text-right font-semibold text-amber-600 dark:text-amber-400 tabular-nums ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {hasRecipes ? formatCurrency(cogs) : '—'}
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {hasRecipes ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
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
                                                className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-50 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900 flex items-center justify-center space-x-1 mx-auto transition-colors"
                                            >
                                                <Edit3 className="w-3.5 h-3.5 stroke-[1.5]" />
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
                                ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                        }`}
                    >
                        <Rows3 className="w-4 h-4 stroke-[1.5]" />
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
