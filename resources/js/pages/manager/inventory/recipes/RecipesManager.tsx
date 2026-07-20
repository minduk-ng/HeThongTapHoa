import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
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

    const applyFilters = (newFilters: Record<string, any>) => {
        router.get(
            '/manager/inventory/recipes',
            {
                search: searchQuery,
                category_id: selectedCategory,
                ...newFilters,
            },
            { preserveState: true, replace: true }
        );
    };

    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        applyFilters({ search: query });
    };

    const handleCategoryChange = (catId: string) => {
        setSelectedCategory(catId);
        applyFilters({ category_id: catId });
    };

    return (
        <DashboardLayout>
            <Head title="Quản lý định lượng & Công thức món" />

            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Quản lý định lượng & Công thức món
                    </h1>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Kho hàng &bull; Định lượng nguyên liệu pha chế & Giá vốn ước tính (COGS)
                    </p>
                </div>

                {/* Filter Bar */}
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-xs">
                    <div className="flex flex-1 flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[200px]">
                            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Tìm theo tên sản phẩm..."
                                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <select
                            value={selectedCategory}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                            className="px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">Tất cả danh mục</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Recipe Table */}
                <RecipeTable
                    products={products}
                    onEditRecipe={(product) => setSelectedProduct(product)}
                />
            </div>

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
