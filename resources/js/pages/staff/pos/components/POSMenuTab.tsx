import React, { useState } from 'react';
import { Search, UtensilsCrossed } from 'lucide-react';
import { CategoryData, POSProductData, CartItem } from '../types/pos.types';
import { cdnAsset } from '../../../../utils/cdn';

interface POSMenuTabProps {
    products: POSProductData[];
    categories: CategoryData[];
    cartItems: CartItem[];
    onToggleProduct: (product: POSProductData) => void;
    searchQuery: string;
}

export default function POSMenuTab({
    products,
    categories,
    cartItems,
    onToggleProduct,
    searchQuery,
}: POSMenuTabProps) {
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

    const safeProducts = Array.isArray(products) ? products : [];
    const safeCategories = Array.isArray(categories) ? categories : [];

    const filteredProducts = safeProducts.filter((product) => {
        const matchesCategory =
            selectedCategoryId === 'all' ||
            String(product.category_id) === selectedCategoryId;
        const matchesSearch = product.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const isProductInCart = (productId: number) => {
        return cartItems.some(
            (item) => item.menu_item_id === productId && item.quantity > 0,
        );
    };

    const getCartItemQuantity = (productId: number) => {
        return cartItems
            .filter((item) => item.menu_item_id === productId)
            .reduce((sum, item) => sum + item.quantity, 0);
    };

    return (
        <div className="flex h-full min-h-0 flex-col space-y-3">
            {/* Top Fixed Header Controls (Search & Category Tabs) */}
            <div className="shrink-0 space-y-2.5">

                {/* Horizontal Category Pill Tabs */}
                <div className="no-scrollbar flex items-center space-x-2 overflow-x-auto pb-1">
                    <button
                        type="button"
                        onClick={() => setSelectedCategoryId('all')}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 ${
                            selectedCategoryId === 'all'
                                ? 'bg-sky-600 text-white'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                    >
                        Tất cả món ({safeProducts.length})
                    </button>
                    {safeCategories.map((cat) => {
                        const count = safeProducts.filter(
                            (p) => p.category_id === cat.id,
                        ).length;
                        const isSelected =
                            selectedCategoryId === String(cat.id);
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() =>
                                    setSelectedCategoryId(String(cat.id))
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 ${
                                    isSelected
                                        ? 'bg-sky-600 text-white'
                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                                }`}
                            >
                                {cat.name} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Scrollable Products Grid */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {filteredProducts.map((product) => {
                        const inCart = isProductInCart(product.id);
                        const qty = getCartItemQuantity(product.id);
                        const maxServings =
                            product.max_servings !== undefined
                                ? product.max_servings
                                : 999;
                        const isOutOfStock = maxServings <= 0;
                        const isLowStock = maxServings > 0 && maxServings <= 5;

                        return (
                            <div
                                key={product.id}
                                onClick={() =>
                                    !isOutOfStock && onToggleProduct(product)
                                }
                                className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-2 transition-all duration-200 ease-out select-none hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] hover:shadow-xs ${
                                    isOutOfStock
                                        ? 'cursor-not-allowed border-rose-200 bg-zinc-50 opacity-50 dark:border-rose-900 dark:bg-zinc-800/40'
                                        : inCart
                                          ? 'border-sky-600 bg-sky-50/60 dark:bg-sky-950/40'
                                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
                                }`}
                            >
                                <div className="relative mb-1.5 aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
                                    {product.image ? (
                                        <img
                                            src={cdnAsset(product.image, { w: 400, format: 'webp' })}
                                            alt={product.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center text-zinc-400">
                                            <UtensilsCrossed className="h-5 w-5 stroke-[1.5]" />
                                        </div>
                                    )}

                                    {/* Stock badges */}
                                    {isOutOfStock ? (
                                        <span className="absolute top-1 left-1 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            Hết hàng
                                        </span>
                                    ) : isLowStock ? (
                                        <span className="absolute top-1 left-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            Còn {maxServings} suất
                                        </span>
                                    ) : null}

                                    {inCart && (
                                        <span className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
                                            {qty}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <h4 className="line-clamp-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                        {product.name}
                                    </h4>
                                    <span className="mt-1 block text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        {Number(product.price).toLocaleString(
                                            'vi-VN',
                                        )}{' '}
                                        đ
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
