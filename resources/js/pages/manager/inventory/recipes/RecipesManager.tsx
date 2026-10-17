import { Head } from '@inertiajs/react';
import { ChefHat, Search, RotateCcw } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import RecipeFormModal from './components/RecipeFormModal';
import type { ProductRecipeData } from './components/RecipeTable';
import RecipeTable from './components/RecipeTable';

interface Category {
    id: number;
    name: string;
}

interface Ingredient {
    id: number;
    code: string;
    name: string;
    unit: string;
    cost_price: number;
}

interface RecipesManagerProps {
    products: ProductRecipeData[];
    categories: Category[];
    ingredients: Ingredient[];
    filters: {
        search?: string;
        category_id?: string;
    };
}

export default function RecipesManager({
    products,
    categories,
    ingredients,
    filters,
}: RecipesManagerProps) {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [selectedCategory, setSelectedCategory] = useState(
        filters.category_id || 'all',
    );
    const [selectedProduct, setSelectedProduct] =
        useState<ProductRecipeData | null>(null);

    const [prevFilters, setPrevFilters] = useState(filters);

    if (filters !== prevFilters) {
        setPrevFilters(filters);
        setSearchQuery(filters.search || '');
        setSelectedCategory(filters.category_id || 'all');
    }

    // 100% Instant Frontend Filtering via useMemo without backend HTTP roundtrips
    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !query ||
                product.name.toLowerCase().includes(query) ||
                String(product.id).includes(query);

            const matchesCategory =
                selectedCategory === 'all' ||
                String(product.category_id) === selectedCategory;

            return matchesSearch && matchesCategory;
        });
    }, [products, searchQuery, selectedCategory]);

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
    };

    const handleCategoryChange = (catId: string) => {
        setSelectedCategory(catId);
    };

    // Calculate recipe stats
    const configuredCount = products.filter(
        (p) => p.recipes && p.recipes.length > 0,
    ).length;
    const totalProducts = products.length;

    const hasActiveFilter = Boolean(searchQuery || selectedCategory !== 'all');

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý định lượng & Công thức món" />

            <ManagerPageLayout
                icon={ChefHat}
                title="Định lượng & Công thức món"
                subtitle="Định lượng nguyên liệu và tính giá vốn ước tính (COGS)"
                badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {totalProducts} món
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {configuredCount} đã có định lượng
                        </span>
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
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
                                placeholder="Tìm theo tên món ăn..."
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-8 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            />
                        </div>

                        {/* Category Select */}
                        <div className="w-48">
                            <select
                                value={selectedCategory}
                                onChange={(e) =>
                                    handleCategoryChange(e.target.value)
                                }
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-900 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                            >
                                <option value="all">
                                    Tất cả danh mục ({categories.length})
                                </option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Reset Filter Button */}
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={() => {
                                    handleSearchChange('');
                                    handleCategoryChange('all');
                                }}
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
                {/* Recipe Table with Instant Frontend Filtering */}
                <RecipeTable
                    products={filteredProducts}
                    onEditRecipe={(product) => setSelectedProduct(product)}
                />
            </ManagerPageLayout>

            {/* Recipe Form Modal */}
            <RecipeFormModal
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                product={selectedProduct}
                ingredients={ingredients}
            />
        </DashboardLayout>
    );
}
