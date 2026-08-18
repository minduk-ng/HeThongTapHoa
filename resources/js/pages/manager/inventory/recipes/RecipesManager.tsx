import React, { useState, useEffect, useMemo } from 'react';
import { Head } from '@inertiajs/react';
import { ChefHat, Search, SlidersHorizontal, BookOpen, Layers, RotateCcw } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import RecipeTable, { ProductRecipeData } from './components/RecipeTable';
import RecipeFormDrawer from './components/RecipeFormDrawer';

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
    const [selectedCategory, setSelectedCategory] = useState(filters.category_id || 'all');
    const [selectedProduct, setSelectedProduct] = useState<ProductRecipeData | null>(null);

    useEffect(() => {
        setSearchQuery(filters.search || '');
        setSelectedCategory(filters.category_id || 'all');
    }, [filters]);

    // 100% Instant Frontend Filtering via useMemo without backend HTTP roundtrips
    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !query ||
                product.name.toLowerCase().includes(query) ||
                String(product.id).includes(query);

            const matchesCategory =
                selectedCategory === 'all' || String(product.category_id) === selectedCategory;

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
    const configuredCount = products.filter((p) => p.recipes && p.recipes.length > 0).length;
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                            {totalProducts} món
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {configuredCount} đã có định lượng
                        </span>
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Bar */}
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Tìm theo tên món ăn..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>

                        {/* Category Select */}
                        <div className="w-48">
                            <select
                                value={selectedCategory}
                                onChange={(e) => handleCategoryChange(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả danh mục ({categories.length})</option>
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
                {/* Recipe Table with Instant Frontend Filtering */}
                <RecipeTable
                    products={filteredProducts}
                    onEditRecipe={(product) => setSelectedProduct(product)}
                />
            </ManagerPageLayout>

            {/* Recipe Form Drawer */}
            <RecipeFormDrawer
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                product={selectedProduct}
                ingredients={ingredients}
            />
        </DashboardLayout>
    );
}
