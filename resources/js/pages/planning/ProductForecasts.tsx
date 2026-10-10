import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowUpRight,
    Boxes,
    ChevronLeft,
    ChevronRight,
    Eye,
    Search,
    X,
} from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import DataQualityBadge from '../../components/planning/DataQualityBadge';
import ForecastDetailDrawer from '../../components/planning/ForecastDetailDrawer';
import type {ProductForecastItem} from '../../components/planning/ForecastDetailDrawer';
import {
    formatQuantity,
    formatWape,
    MODEL_NAMES,
} from '../../components/planning/planningFormatters';
import RunStatusBanner from '../../components/planning/RunStatusBanner';
import type {ForecastRunSummary} from '../../components/planning/RunStatusBanner';
import DashboardLayout from '../../layouts/DashboardLayout';

interface CategoryOption {
    id: number;
    name: string;
}

interface ProductFilters {
    search?: string | null;
    category_id?: number | null;
    horizon_days?: number | null;
    quality?: string | null;
    synthetic_dataset_id?: number | null;
}

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: PaginationLink[];
}

interface ProductForecastsProps {
    activeRun?: ForecastRunSummary | null;
    products?: PaginatedData<ProductForecastItem>;
    forecasts?: PaginatedData<ProductForecastItem>;
    categories?: CategoryOption[];
    filters?: ProductFilters;
}

export default function ProductForecasts({
    activeRun,
    products,
    forecasts,
    categories = [],
    filters = {},
}: ProductForecastsProps) {
    // Resolve products data (either products or forecasts prop)
    const productList = products || forecasts || {
        data: [],
        current_page: 1,
        last_page: 1,
        per_page: 15,
        total: 0,
        from: null,
        to: null,
        links: [],
    };

    // Filter local states
    const [searchTerm, setSearchTerm] = useState(filters.search || '');
    const [selectedCategory, setSelectedCategory] = useState<string>(
        filters.category_id !== null && filters.category_id !== undefined ? String(filters.category_id) : ''
    );
    const [selectedHorizon, setSelectedHorizon] = useState<number>(
        filters.horizon_days || activeRun?.horizon_days || 7
    );
    const [selectedQuality, setSelectedQuality] = useState<string>(filters.quality || '');
    const [, startTransition] = useTransition();

    // Drawer state
    const [selectedProduct, setSelectedProduct] = useState<ProductForecastItem | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const triggerRefs = useRef<Record<number, HTMLButtonElement | null>>({});

    const handleOpenDrawer = (product: ProductForecastItem) => {
        setSelectedProduct(product);
        setIsDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
    };

    const applyFilters = (overrides?: Partial<ProductFilters>) => {
        startTransition(() => {
            const currentParams: Record<string, string | number> = {};

            const searchVal = overrides?.search !== undefined ? overrides.search : searchTerm.trim();
            const catVal = overrides?.category_id !== undefined
                ? overrides.category_id
                : (selectedCategory ? Number(selectedCategory) : null);
            const horizonVal = overrides?.horizon_days !== undefined
                ? overrides.horizon_days
                : selectedHorizon;
            const qualityVal = overrides?.quality !== undefined
                ? overrides.quality
                : (selectedQuality || null);

            if (searchVal) {
                currentParams.search = searchVal;
            }

            if (catVal !== null && catVal !== undefined) {
                currentParams.category_id = catVal;
            }

            if (horizonVal) {
                currentParams.horizon_days = horizonVal;
            }

            if (qualityVal) {
                currentParams.quality = qualityVal;
            }

            if (filters.synthetic_dataset_id) {
                currentParams.synthetic_dataset_id = filters.synthetic_dataset_id;
            }

            router.get('/planning/products', currentParams, {
                preserveState: true,
                preserveScroll: true,
            });
        });
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setSelectedCategory('');
        setSelectedQuality('');
        startTransition(() => {
            const currentParams: Record<string, string | number> = {};

            if (filters.synthetic_dataset_id) {
                currentParams.synthetic_dataset_id = filters.synthetic_dataset_id;
            }

            if (selectedHorizon) {
                currentParams.horizon_days = selectedHorizon;
            }

            router.get('/planning/products', currentParams, {
                preserveState: true,
                preserveScroll: true,
            });
        });
    };

    return (
        <DashboardLayout>
            <Head title="Dự báo sản phẩm" />

            <div className="space-y-6 pb-12">
                {/* 1. Page Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            Dự báo nhu cầu sản phẩm
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Xem chi tiết số lượng dự báo, độ tin cậy và mô hình ứng dụng cho từng mặt hàng.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/planning"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
                        >
                            <span>Tổng quan</span>
                        </Link>
                        <Link
                            href="/planning/procurement"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
                        >
                            <span>Đề xuất nhập hàng</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                            href="/planning/evaluation"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
                        >
                            <span>Đánh giá mô hình</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </div>

                {/* 2. Run Status Banner */}
                <RunStatusBanner
                    run={activeRun}
                    defaultHorizon={selectedHorizon}
                />

                {/* 3. Server Filters Bar */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            applyFilters();
                        }}
                        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
                    >
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Tìm tên sản phẩm..."
                                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-hidden focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                        </div>

                        {/* Category Filter */}
                        <div>
                            <select
                                value={selectedCategory}
                                onChange={(e) => {
                                    setSelectedCategory(e.target.value);
                                    applyFilters({ category_id: e.target.value ? Number(e.target.value) : null });
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-purple-500 focus:outline-hidden focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value="">Tất cả danh mục</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Horizon Filter */}
                        <div>
                            <select
                                value={selectedHorizon}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setSelectedHorizon(val);
                                    applyFilters({ horizon_days: val });
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-purple-500 focus:outline-hidden focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value={7}>Chu kỳ 7 ngày</option>
                                <option value={30}>Chu kỳ 30 ngày</option>
                            </select>
                        </div>

                        {/* Quality Filter */}
                        <div>
                            <select
                                value={selectedQuality}
                                onChange={(e) => {
                                    setSelectedQuality(e.target.value);
                                    applyFilters({ quality: e.target.value || null });
                                }}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-purple-500 focus:outline-hidden focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value="">Tất cả chất lượng DL</option>
                                <option value="sufficient">Đầy đủ (Sufficient)</option>
                                <option value="limited">Hạn chế (Limited)</option>
                                <option value="insufficient">Thiếu dữ liệu (Insufficient)</option>
                            </select>
                        </div>

                        {/* Filter Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                type="submit"
                                className="flex-1 rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-purple-700 transition"
                            >
                                Lọc
                            </button>
                            {(searchTerm || selectedCategory || selectedQuality) && (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                    title="Xóa bộ lọc"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* 4. Products Table (Desktop) & Cards (Mobile) */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                    {/* Header info */}
                    <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <Boxes className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Danh sách dự báo sản phẩm
                            </h2>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            Tổng số: <strong className="font-semibold text-slate-800 dark:text-slate-200">{productList.total}</strong> sản phẩm
                        </span>
                    </div>

                    {productList.data.length === 0 ? (
                        <div className="py-16 text-center">
                            <Boxes className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                            <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                                Không tìm thấy sản phẩm dự báo nào
                            </h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                                Vui lòng thử thay đổi điều kiện tìm kiếm hoặc chạy lượt dự báo mới từ trang Tổng quan.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table (hidden on mobile) */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                        <tr>
                                            <th className="px-6 py-3 font-semibold">Sản phẩm</th>
                                            <th className="px-4 py-3 font-semibold">Mô hình áp dụng</th>
                                            <th className="px-4 py-3 font-semibold">Chất lượng DL</th>
                                            <th className="px-4 py-3 font-semibold text-right">Tổng dự báo ({selectedHorizon}d)</th>
                                            <th className="px-4 py-3 font-semibold text-right">Khoảng tin cậy</th>
                                            <th className="px-4 py-3 font-semibold text-right">Độ lệch WAPE</th>
                                            <th className="px-6 py-3 font-semibold text-center">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {productList.data.map((item) => {
                                            const modelLabel = MODEL_NAMES[item.model_key] || item.model_key;
                                            const hasBounds = item.lower_bound !== null && item.upper_bound !== null;

                                            return (
                                                <tr
                                                    key={item.id}
                                                    onClick={() => handleOpenDrawer(item)}
                                                    className="cursor-pointer transition-colors hover:bg-purple-50/40 dark:hover:bg-purple-950/20"
                                                >
                                                    <td className="px-6 py-3.5">
                                                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                            {item.name}
                                                        </div>
                                                        {item.category_name && (
                                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                                {item.category_name}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                            {modelLabel}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <DataQualityBadge quality={item.data_quality} />
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                                        {formatQuantity(item.forecast_quantity)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                                                        {hasBounds
                                                            ? `${formatQuantity(item.lower_bound)} - ${formatQuantity(item.upper_bound)}`
                                                            : '-'}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                                                        {formatWape(item.wape)}
                                                    </td>
                                                    <td className="px-6 py-3.5 text-center">
                                                        <button
                                                            ref={(el) => {
                                                                triggerRefs.current[item.id] = el;
                                                            }}
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenDrawer(item);
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                                                        >
                                                            <Eye className="h-3.5 w-3.5 text-slate-400" />
                                                            <span>Chi tiết</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card List (shown on mobile only) */}
                            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                                {productList.data.map((item) => {
                                    const modelLabel = MODEL_NAMES[item.model_key] || item.model_key;
                                    const hasBounds = item.lower_bound !== null && item.upper_bound !== null;

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => handleOpenDrawer(item)}
                                            className="p-4 space-y-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                                                        {item.name}
                                                    </h3>
                                                    {item.category_name && (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                            {item.category_name}
                                                        </p>
                                                    )}
                                                </div>
                                                <DataQualityBadge quality={item.data_quality} />
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60">
                                                <div>
                                                    <span className="text-slate-500 dark:text-slate-400">Tổng dự báo ({selectedHorizon}d):</span>
                                                    <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
                                                        {formatQuantity(item.forecast_quantity)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 dark:text-slate-400">Sai số WAPE:</span>
                                                    <div className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums mt-0.5">
                                                        {formatWape(item.wape)}
                                                    </div>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-slate-500 dark:text-slate-400">Mô hình:</span>
                                                    <span className="ml-1.5 font-medium text-slate-700 dark:text-slate-300">
                                                        {modelLabel}
                                                    </span>
                                                </div>
                                                {hasBounds && (
                                                    <div className="col-span-2 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                                                        Khoảng tin cậy: {formatQuantity(item.lower_bound)} - {formatQuantity(item.upper_bound)}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex justify-end pt-1">
                                                <button
                                                    ref={(el) => {
                                                        triggerRefs.current[item.id] = el;
                                                    }}
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenDrawer(item);
                                                    }}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    <span>Xem chi tiết ngày</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Pagination Controls */}
                            {productList.links && productList.links.length > 3 && (
                                <div className="border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 dark:border-slate-800">
                                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                        Hiển thị <span className="font-semibold">{productList.from ?? 0}</span> đến{' '}
                                        <span className="font-semibold">{productList.to ?? 0}</span> trong{' '}
                                        <span className="font-semibold">{productList.total}</span> sản phẩm
                                    </div>

                                    <div className="flex items-center gap-1">
                                        {productList.links.map((link, idx) => {
                                            const isPrev = link.label.includes('Previous') || link.label.includes('&laquo;');
                                            const isNext = link.label.includes('Next') || link.label.includes('&raquo;');

                                            if (!link.url) {
                                                return (
                                                    <span
                                                        key={idx}
                                                        className="px-2.5 py-1 text-xs text-slate-300 dark:text-slate-600 rounded-lg"
                                                    >
                                                        {isPrev ? <ChevronLeft className="h-4 w-4" /> : isNext ? <ChevronRight className="h-4 w-4" /> : link.label}
                                                    </span>
                                                );
                                            }

                                            return (
                                                <Link
                                                    key={idx}
                                                    href={link.url}
                                                    preserveScroll
                                                    preserveState
                                                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors tabular-nums ${
                                                        link.active
                                                            ? 'bg-purple-600 text-white'
                                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    {isPrev ? <ChevronLeft className="h-4 w-4" /> : isNext ? <ChevronRight className="h-4 w-4" /> : link.label}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* On-Demand Detail Drawer */}
            <ForecastDetailDrawer
                isOpen={isDrawerOpen}
                product={selectedProduct}
                onClose={handleCloseDrawer}
            />
        </DashboardLayout>
    );
}
