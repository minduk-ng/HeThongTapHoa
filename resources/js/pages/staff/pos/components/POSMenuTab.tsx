import { RotateCcw, UtensilsCrossed } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { cdnAsset, useCdnBaseUrl } from '../../../../utils/cdn';
import { usePOSMenuIndex } from '../hooks/usePOSMenuIndex';
import type { CategoryData, POSProductData, CartItem } from '../types/pos.types';
import type { SortMode } from '../utils/menuAlgorithms';
import {
    aggregateCartQuantities,
    parsePriceRange,
    queryMenu,
} from '../utils/menuAlgorithms';

interface POSMenuTabProps {
    products: POSProductData[];
    categories: CategoryData[];
    cartItems: CartItem[];
    onToggleProduct: (product: POSProductData) => void;
    searchQuery: string;
    onSearchChange?: (query: string) => void;
    disabled?: boolean;
    disabledReason?: string;
}

export default function POSMenuTab({
    products,
    categories,
    cartItems,
    onToggleProduct,
    searchQuery,
    onSearchChange,
    disabled = false,
    disabledReason,
}: POSMenuTabProps) {
    const cdnUrl = useCdnBaseUrl();
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
    const [minPrice, setMinPrice] = useState<string>('');
    const [maxPrice, setMaxPrice] = useState<string>('');
    const [sortMode, setSortMode] = useState<SortMode>('original');
    const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
    const [localQuery, setLocalQuery] = useState<string | null>(null);

    // Adjust local query override when parent searchQuery updates during render
    if (searchQuery !== prevSearchQuery) {
        setPrevSearchQuery(searchQuery);
        setLocalQuery(null);
    }

    const safeProducts = Array.isArray(products) ? products : [];
    const safeCategories = Array.isArray(categories) ? categories : [];

    const { index, indexError } = usePOSMenuIndex(safeProducts);

    const priceRangeResult = useMemo(
        () => parsePriceRange(minPrice, maxPrice),
        [minPrice, maxPrice],
    );

    // ponytail: single pass over cart rows per cart revision
    const cartQuantityByProduct = useMemo(
        () => aggregateCartQuantities(cartItems),
        [cartItems],
    );

    const effectiveQuery = localQuery !== null ? localQuery : searchQuery;

    // Call queryMenu only when index is available and range is valid
    const [lastValidProducts, setLastValidProducts] = useState<POSProductData[]>([]);
    const queryProducts = useMemo(() => {
        if (!index || indexError || !priceRangeResult.ok) {
            return null;
        }

        return queryMenu(index, {
            name: effectiveQuery,
            categoryId: selectedCategoryId,
            minMinor: priceRangeResult.minMinor,
            maxMinor: priceRangeResult.maxMinor,
            sort: sortMode,
        });
    }, [index, indexError, priceRangeResult, effectiveQuery, selectedCategoryId, sortMode]);

    if (queryProducts && queryProducts !== lastValidProducts) {
        setLastValidProducts(queryProducts);
    }

    const filteredProducts = queryProducts ?? lastValidProducts;
    const stale = !!indexError || !priceRangeResult.ok;

    const handleReset = () => {
        setSelectedCategoryId('all');
        setMinPrice('');
        setMaxPrice('');
        setSortMode('original');
        setLocalQuery('');
        onSearchChange?.('');
    };

    return (
        <div className="flex h-full min-h-0 flex-col space-y-3">
            {/* Top Fixed Header Controls (Categories, Price Range, Sort, Reset) */}
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

                {/* Filter & Sort Controls Row */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                    {/* Price range inputs */}
                    <div className="flex items-center space-x-1.5">
                        <span className="font-medium whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                            Khoảng giá:
                        </span>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Từ..."
                            aria-label="Giá tối thiểu (số thập phân, dấu chấm, tối đa 2 chữ số lẻ)"
                            value={minPrice}
                            onChange={(e) => setMinPrice(e.target.value)}
                            className={`w-20 rounded-lg border px-2 py-1 text-xs text-zinc-900 transition-colors focus:outline-none dark:text-zinc-100 ${
                                !priceRangeResult.ok &&
                                (priceRangeResult.field === 'min' ||
                                    priceRangeResult.field === 'range')
                                    ? 'border-rose-500 bg-rose-50/30 dark:border-rose-500 dark:bg-rose-950/20'
                                    : 'border-zinc-200 bg-zinc-50 focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800'
                            }`}
                        />
                        <span className="text-zinc-400">-</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Đến..."
                            aria-label="Giá tối đa (số thập phân, dấu chấm, tối đa 2 chữ số lẻ)"
                            value={maxPrice}
                            onChange={(e) => setMaxPrice(e.target.value)}
                            className={`w-20 rounded-lg border px-2 py-1 text-xs text-zinc-900 transition-colors focus:outline-none dark:text-zinc-100 ${
                                !priceRangeResult.ok &&
                                (priceRangeResult.field === 'max' ||
                                    priceRangeResult.field === 'range')
                                    ? 'border-rose-500 bg-rose-50/30 dark:border-rose-500 dark:bg-rose-950/20'
                                    : 'border-zinc-200 bg-zinc-50 focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800'
                            }`}
                        />
                    </div>

                    {/* Sort selector */}
                    <div className="flex items-center space-x-1.5">
                        <span className="font-medium whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                            Sắp xếp:
                        </span>
                        <select
                            aria-label="Sắp xếp món"
                            value={sortMode}
                            onChange={(e) =>
                                setSortMode(e.target.value as SortMode)
                            }
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 transition-colors focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                            <option value="original">Mặc định</option>
                            <option value="name-asc">Tên A - Z</option>
                            <option value="name-desc">Tên Z - A</option>
                            <option value="price-asc">Giá tăng dần</option>
                            <option value="price-desc">Giá giảm dần</option>
                        </select>
                    </div>

                    {/* Reset button */}
                    <button
                        type="button"
                        onClick={handleReset}
                        title="Đặt lại bộ lọc"
                        className="flex items-center space-x-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        <RotateCcw className="h-3 w-3" />
                        <span>Đặt lại</span>
                    </button>

                    {/* Field error next to price inputs */}
                    {!priceRangeResult.ok && (
                        <span className="text-xs font-medium text-rose-500 dark:text-rose-400">
                            {priceRangeResult.message}
                        </span>
                    )}
                </div>

                {/* Index error banner if payload refresh fails */}
                {stale && (
                    <p role="status" className="text-xs text-amber-700">
                        Đang hiển thị kết quả hợp lệ gần nhất. Tạm khóa chọn món đến khi dữ liệu và bộ lọc hợp lệ.
                    </p>
                )}
                {disabled && (
                    <p role="status" className="text-xs text-amber-700">
                        {disabledReason || 'Đang gửi đơn, tạm khóa chọn món.'}
                    </p>
                )}
                {indexError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                        {indexError}
                    </div>
                )}
            </div>

            {/* Scrollable Products Grid or Empty State */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredProducts.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
                        <UtensilsCrossed className="mb-2 h-8 w-8 stroke-[1.5] text-zinc-400 dark:text-zinc-500" />
                        <p
                            className={`text-sm font-medium ${
                                !priceRangeResult.ok || indexError
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                        >
                            {indexError
                                ? indexError
                                : !priceRangeResult.ok
                                  ? priceRangeResult.message
                                  : 'Không có món phù hợp'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        {filteredProducts.map((product) => {
                            const qty =
                                cartQuantityByProduct.get(product.id) ?? 0;
                            const inCart = qty > 0;
                            const maxServings =
                                product.max_servings !== undefined
                                    ? product.max_servings
                                    : 999;
                            const isOutOfStock = maxServings <= 0;
                            const isActionDisabled =
                                isOutOfStock || !product.is_available || stale || disabled;
                            const isLowStock =
                                maxServings > 0 && maxServings <= 5;

                            return (
                                <div
                                    key={product.id}
                                    role="button"
                                    aria-disabled={isActionDisabled}
                                    tabIndex={isActionDisabled ? -1 : 0}
                                    onClick={() =>
                                        !isActionDisabled &&
                                        onToggleProduct(product)
                                    }
                                    onKeyDown={(e) => {
                                        if (
                                            !isActionDisabled &&
                                            (e.key === 'Enter' ||
                                                e.key === ' ')
                                        ) {
                                            e.preventDefault();
                                            onToggleProduct(product);
                                        }
                                    }}
                                    className={`relative flex cursor-pointer flex-col justify-between rounded-xl border p-2 transition-colors duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                                        isActionDisabled
                                            ? 'cursor-not-allowed border-rose-200 bg-zinc-50 opacity-50 dark:border-rose-900 dark:bg-zinc-800/40'
                                            : inCart
                                              ? 'border-sky-600 bg-sky-50/60 dark:bg-sky-950/40'
                                              : 'border-zinc-200 bg-white hover:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-500'
                                    }`}
                                >
                                    <div className="relative mb-1.5 aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
                                        {product.image ? (
                                            <img
                                                src={cdnAsset(
                                                    product.image,
                                                    {
                                                        w: 400,
                                                        format: 'webp',
                                                    },
                                                    cdnUrl,
                                                )}
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
                                            <span className="absolute top-1 left-1 rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                                                Hết hàng
                                            </span>
                                        ) : isLowStock ? (
                                            <span className="absolute top-1 left-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
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
                                            {Number(
                                                product.price,
                                            ).toLocaleString('vi-VN')}{' '}
                                            đ
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
