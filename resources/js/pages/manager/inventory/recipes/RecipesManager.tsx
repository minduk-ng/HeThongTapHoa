import React, { useState, useEffect, useMemo } from 'react';
import { Head } from '@inertiajs/react';
import { ChefHat, Search, SlidersHorizontal, BookOpen, Layers } from 'lucide-react';
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

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Quản lý định lượng & Công thức món" />

            <ManagerPageLayout
                sidebar={
                    <>
                        {/* Header */}
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <ChefHat className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Định lượng</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                Định lượng & Công thức
                            </h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Định lượng nguyên liệu & tính giá vốn ước tính (COGS)
                            </p>
                        </div>

                        {/* Filter Controls */}
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.5]" />
                                <span>Bộ lọc sản phẩm</span>
                            </label>

                            {/* Search Bar */}
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    placeholder="Tìm sản phẩm..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                                />
                            </div>

                            {/* Category Select */}
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Danh mục món</label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => handleCategoryChange(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                                >
                                    <option value="all">Tất cả danh mục ({categories.length})</option>
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Guidelines Note Box */}
                        <div className="p-3 bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/60 dark:border-sky-900/40 rounded-xl text-xs text-sky-900 dark:text-sky-200 space-y-1">
                            <span className="font-semibold block flex items-center gap-1 text-[11px]">
                                <BookOpen className="w-3.5 h-3.5 text-sky-600" /> Hướng dẫn thiết lập:
                            </span>
                            <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                Nhấp chọn nút “Cấu hình công thức” ở mỗi món để khai báo lượng nguyên liệu tiêu hao khi bán 1 suất.
                            </p>
                        </div>

                        {/* Mini Overview Stats */}
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5 mt-auto">
                            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 block">
                                Tiến độ cấu hình
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                    <div className="flex items-center text-zinc-500 text-[11px] mb-1">
                                        <ChefHat className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                        <span>Đã cấu hình</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-zinc-900 dark:text-zinc-100">
                                        {configuredCount} / {totalProducts}
                                    </span>
                                </div>

                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                    <div className="flex items-center text-zinc-500 text-[11px] mb-1">
                                        <Layers className="w-3.5 h-3.5 mr-1 text-sky-600" />
                                        <span>Chưa có ĐL</span>
                                    </div>
                                    <span className="font-display text-lg font-normal text-amber-600 dark:text-amber-400">
                                        {totalProducts - configuredCount}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
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
