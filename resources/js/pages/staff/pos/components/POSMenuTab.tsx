import React, { useState } from 'react';

export interface CategoryData {
    id: number;
    name: string;
}

export interface POSProductData {
    id: number;
    name: string;
    price: number;
    vat_rate: number;
    image?: string | null;
    category_id: number;
    category?: CategoryData;
}

interface CartItem {
    menu_item_id: number;
    name: string;
    quantity: number;
    unit_price: number;
    vat_rate: number;
    note?: string;
    isConfirmed?: boolean;
}

interface POSMenuTabProps {
    products: POSProductData[];
    categories: CategoryData[];
    cartItems: CartItem[];
    onToggleProduct: (product: POSProductData) => void;
}

export default function POSMenuTab({
    products,
    categories,
    cartItems,
    onToggleProduct,
}: POSMenuTabProps) {
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredProducts = products.filter((product) => {
        const matchesCategory =
            selectedCategoryId === 'all' || String(product.category_id) === selectedCategoryId;
        const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const isProductInCart = (productId: number) => {
        return cartItems.some((item) => item.menu_item_id === productId);
    };

    const getCartItemQuantity = (productId: number) => {
        const item = cartItems.find((i) => i.menu_item_id === productId);
        return item ? item.quantity : 0;
    };

    return (
        <div className="h-full flex flex-col min-h-0 space-y-3">
            {/* Top Fixed Header Controls (Search & Category Tabs) */}
            <div className="shrink-0 space-y-2.5">
                {/* Search Bar */}
                <div className="relative">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm tên món ăn / đồ uống..."
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Horizontal Category Pill Tabs */}
                <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
                    <button
                        type="button"
                        onClick={() => setSelectedCategoryId('all')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                            selectedCategoryId === 'all'
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                        }`}
                    >
                        Tất cả món ({products.length})
                    </button>
                    {categories.map((cat) => {
                        const count = products.filter((p) => p.category_id === cat.id).length;
                        const isSelected = selectedCategoryId === String(cat.id);
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategoryId(String(cat.id))}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                                    isSelected
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                            >
                                {cat.name} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Scrollable Products Grid */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredProducts.map((product) => {
                        const inCart = isProductInCart(product.id);
                        const qty = getCartItemQuantity(product.id);

                        return (
                            <div
                                key={product.id}
                                onClick={() => onToggleProduct(product)}
                                className={`relative cursor-pointer p-3 rounded-xl border-2 transition-all select-none flex flex-col justify-between ${
                                    inCart
                                        ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/60 shadow-md ring-2 ring-blue-400/50'
                                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                                }`}
                            >
                                <div className="aspect-square w-full rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 mb-2 border border-zinc-100 dark:border-zinc-800 relative">
                                    {product.image ? (
                                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-zinc-400">
                                            ☕
                                        </div>
                                    )}

                                    {inCart && (
                                        <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shadow-md">
                                            {qty}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 line-clamp-2">
                                        {product.name}
                                    </h4>
                                    <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
                                        {Number(product.price).toLocaleString('vi-VN')} đ
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
