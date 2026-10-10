import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowUpRight,
    Boxes,
    ChevronRight,
    Coins,
    Cpu,
    Filter,
    PackagePlus,
    ShieldCheck,
    Target,
    TrendingUp,
} from 'lucide-react';
import { useState, useTransition } from 'react';
import ActualForecastChart from '../../components/planning/ActualForecastChart';
import type {ActualForecastPoint} from '../../components/planning/ActualForecastChart';
import DataQualityBadge from '../../components/planning/DataQualityBadge';
import {
    formatCurrency,
    formatQuantity,
    formatWape,
    MODEL_NAMES,
} from '../../components/planning/planningFormatters';
import RunStatusBanner from '../../components/planning/RunStatusBanner';
import type {ForecastRunSummary} from '../../components/planning/RunStatusBanner';
import DashboardLayout from '../../layouts/DashboardLayout';

interface KpiSummary {
    growth_items_count?: number;
    procurement_needed_count?: number;
    estimated_value?: number;
    average_wape?: number | null;
}

interface CategoryOption {
    id: number;
    name: string;
}

interface QualityDistItem {
    quality: string;
    count: number;
}

interface ModelDistItem {
    model_key: string;
    count: number;
}

interface TopGrowingProduct {
    id: number;
    name: string;
    category_name?: string | null;
    forecast_quantity: number;
    data_quality: string;
    model_key: string;
}

interface UrgentReorderItem {
    id: number;
    ingredient_id: number;
    ingredient_name: string;
    supplier_name?: string | null;
    stock_quantity: number;
    safety_stock: number;
    reorder_point: number;
    suggested_quantity: number;
    unit: string;
    status: string;
}

interface OverviewFilters {
    synthetic_dataset_id?: number | null;
    category_id?: number | null;
    horizon_days?: number | null;
}

interface OverviewProps {
    activeRun?: ForecastRunSummary | null;
    activeEvalRun?: ForecastRunSummary | null;
    recentRuns?: ForecastRunSummary[];
    summary?: {
        total_forecasts_count?: number;
        total_recommendations_count?: number;
        [key: string]: unknown;
    };
    kpis?: KpiSummary;
    chartData?: ActualForecastPoint[];
    cutoffDate?: string | null;
    categories?: CategoryOption[];
    dataQualityDistribution?: QualityDistItem[];
    modelDistribution?: ModelDistItem[];
    topGrowingProducts?: TopGrowingProduct[];
    urgentReorders?: UrgentReorderItem[];
    filters?: OverviewFilters;
}

export default function Overview({
    activeRun,
    recentRuns,
    kpis,
    chartData,
    cutoffDate,
    categories,
    dataQualityDistribution,
    modelDistribution,
    topGrowingProducts,
    urgentReorders,
    filters,
}: OverviewProps) {
    const [, startTransition] = useTransition();

    // Defensive guards on all list props
    const safeChartData = Array.isArray(chartData) ? chartData : [];
    const safeCategories = Array.isArray(categories) ? categories : [];
    const safeQualityDist = Array.isArray(dataQualityDistribution)
        ? dataQualityDistribution
        : [];
    const safeModelDist = Array.isArray(modelDistribution)
        ? modelDistribution
        : [];
    const safeTopGrowing = Array.isArray(topGrowingProducts)
        ? topGrowingProducts
        : [];
    const safeUrgentReorders = Array.isArray(urgentReorders)
        ? urgentReorders
        : [];
    const safeRecentRuns = Array.isArray(recentRuns) ? recentRuns : [];

    const [selectedHorizon, setSelectedHorizon] = useState<number>(
        filters?.horizon_days || activeRun?.horizon_days || 7
    );
    const [selectedCategory, setSelectedCategory] = useState<string>(
        filters?.category_id ? String(filters.category_id) : 'all'
    );

    const handleFilterChange = (categoryId: string, horizon: number) => {
        setSelectedCategory(categoryId);
        setSelectedHorizon(horizon);

        startTransition(() => {
            router.get(
                '/planning',
                {
                    synthetic_dataset_id: filters?.synthetic_dataset_id ?? null,
                    category_id: categoryId === 'all' ? null : Number(categoryId),
                    horizon_days: horizon,
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                }
            );
        });
    };

    // Total counts for distribution percentages
    const totalQualityCount = safeQualityDist.reduce((acc, q) => acc + q.count, 0);
    const totalModelCount = safeModelDist.reduce((acc, m) => acc + m.count, 0);

    return (
        <DashboardLayout>
            <Head title="Tổng quan Dự báo & Kế hoạch" />

            <div className="space-y-6 pb-12">
                {/* 1. Page Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            Tổng quan Dự báo & Kế hoạch
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Nhu cầu tiêu thụ sản phẩm, mô hình dự báo và tối ưu hoá tồn kho nguyên liệu.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/planning/products"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
                        >
                            <span>Dự báo sản phẩm</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
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

                {/* 3. 4 KPI Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* KPI 1: Forecast growth items */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Sản phẩm dự báo nhu cầu
                            </span>
                            <div className="rounded-xl bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                                <TrendingUp className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <span className="font-display tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                                {formatQuantity(kpis?.growth_items_count)}
                            </span>
                            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">món</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Có nhu cầu dự báo trong kỳ tới
                        </p>
                    </div>

                    {/* KPI 2: Procurement items needing order */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Đề xuất nhập nguyên liệu
                            </span>
                            <div className="rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                                <PackagePlus className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <span className="font-display tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                                {formatQuantity(kpis?.procurement_needed_count)}
                            </span>
                            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">mặt hàng</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Cần đặt hàng bổ sung tồn kho
                        </p>
                    </div>

                    {/* KPI 3: Estimated value */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Ước tính chi phí mua hàng
                            </span>
                            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                                <Coins className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <span className="font-display tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                                {formatCurrency(kpis?.estimated_value)}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Giá trị dự kiến theo đề xuất
                        </p>
                    </div>

                    {/* KPI 4: Average WAPE */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Sai số trung bình (WAPE)
                            </span>
                            <div className="rounded-xl bg-purple-50 p-2 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                                <Target className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="mt-3">
                            <span className="font-display tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                                {formatWape(kpis?.average_wape)}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Độ lệch dự báo theo mô hình chọn
                        </p>
                    </div>
                </div>

                {/* 4. Actual Forecast Chart with Controls */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700/60">
                        <div>
                            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                                Diễn biến Nhu cầu & Dự báo
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                So sánh lịch sử nhu cầu thực tế và đường dự đoán tương lai theo chu kỳ.
                            </p>
                        </div>

                        {/* Chart Filters & Horizon Toggle */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Category Filter */}
                            <div className="flex items-center gap-1.5">
                                <Filter className="h-3.5 w-3.5 text-slate-400" />
                                <select
                                    value={selectedCategory}
                                    onChange={(e) =>
                                        handleFilterChange(e.target.value, selectedHorizon)
                                    }
                                    aria-label="Lọc theo danh mục sản phẩm"
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                    <option value="all">Tất cả danh mục</option>
                                    {safeCategories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Horizon 7 / 30 day Toggle */}
                            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-700/60">
                                <button
                                    type="button"
                                    onClick={() => handleFilterChange(selectedCategory, 7)}
                                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                                        selectedHorizon === 7
                                            ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-800 dark:text-slate-100 font-semibold'
                                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    7 ngày
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleFilterChange(selectedCategory, 30)}
                                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                                        selectedHorizon === 30
                                            ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-800 dark:text-slate-100 font-semibold'
                                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    30 ngày
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="p-5">
                        <ActualForecastChart
                            data={safeChartData}
                            cutoffDate={cutoffDate}
                            height={340}
                        />
                    </div>
                </div>

                {/* 5. Two Cards: Data Quality Card & Model Distribution Card */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Card A: Data Quality Breakdown */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700/60">
                            <div className="flex items-center gap-2">
                                <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                                    <ShieldCheck className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                        Chất lượng dữ liệu lịch sử
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Đánh giá độ tin cậy của chuỗi chu kỳ doanh thu
                                    </p>
                                </div>
                            </div>
                            <span className="tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400">
                                {totalQualityCount} sản phẩm
                            </span>
                        </div>

                        <div className="mt-4 space-y-3">
                            {safeQualityDist.length === 0 ? (
                                <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                                    Chưa có thống kê chất lượng dữ liệu.
                                </p>
                            ) : (
                                safeQualityDist.map((item) => {
                                    const percent =
                                        totalQualityCount > 0
                                            ? Math.round((item.count / totalQualityCount) * 100)
                                            : 0;

                                    return (
                                        <div
                                            key={item.quality}
                                            className="flex items-center justify-between gap-3 text-xs"
                                        >
                                            <div className="flex items-center gap-2">
                                                <DataQualityBadge quality={item.quality} />
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                                    <div
                                                        className="h-full rounded-full bg-sky-500"
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                                <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300 w-12 text-right">
                                                    {item.count} món ({percent}%)
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Card B: Model Distribution Breakdown */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700/60">
                            <div className="flex items-center gap-2">
                                <div className="rounded-lg bg-purple-50 p-1.5 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                                    <Cpu className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                        Phân bổ mô hình dự báo
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Mô hình được áp dụng tối ưu theo từng sản phẩm
                                    </p>
                                </div>
                            </div>
                            <span className="tabular-nums text-xs font-medium text-slate-500 dark:text-slate-400">
                                {totalModelCount} phân bổ
                            </span>
                        </div>

                        <div className="mt-4 space-y-3">
                            {safeModelDist.length === 0 ? (
                                <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                                    Chưa có thống kê mô hình áp dụng.
                                </p>
                            ) : (
                                safeModelDist.map((item) => {
                                    const percent =
                                        totalModelCount > 0
                                            ? Math.round((item.count / totalModelCount) * 100)
                                            : 0;

                                    return (
                                        <div
                                            key={item.model_key}
                                            className="flex items-center justify-between gap-3 text-xs"
                                        >
                                            <span className="font-medium text-slate-700 dark:text-slate-300">
                                                {MODEL_NAMES[item.model_key] || item.model_key}
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                                    <div
                                                        className="h-full rounded-full bg-purple-500"
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                                <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300 w-12 text-right">
                                                    {item.count} món ({percent}%)
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* 6. Bottom Section: Top Growing Products & Urgent Reorders */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Top Growing Products Table (2 cols on lg) */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80 lg:col-span-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700/60">
                            <div>
                                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                    Sản phẩm nhu cầu cao nhất
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Top 10 sản phẩm có tổng sản lượng dự báo lớn nhất
                                </p>
                            </div>
                            <Link
                                href="/planning/products"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                            >
                                <span>Xem tất cả</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                            {safeTopGrowing.length === 0 ? (
                                <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                                    Chưa có dữ liệu sản phẩm trong lượt dự báo này.
                                </p>
                            ) : (
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
                                            <th className="pb-2 font-medium">Sản phẩm</th>
                                            <th className="pb-2 font-medium">Danh mục</th>
                                            <th className="pb-2 text-right font-medium">Dự báo (kỳ)</th>
                                            <th className="pb-2 text-center font-medium">Mô hình</th>
                                            <th className="pb-2 text-right font-medium">Chất lượng</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                                        {safeTopGrowing.map((prod) => (
                                            <tr key={prod.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/60">
                                                <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                                                    {prod.name}
                                                </td>
                                                <td className="py-2.5 text-slate-500 dark:text-slate-400">
                                                    {prod.category_name || '-'}
                                                </td>
                                                <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                                    {formatQuantity(prod.forecast_quantity)}
                                                </td>
                                                <td className="py-2.5 text-center">
                                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                        {MODEL_NAMES[prod.model_key] || prod.model_key}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-right">
                                                    <DataQualityBadge quality={prod.data_quality} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Urgent Reorder Summary Cards (1 col on lg) */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-700/60">
                            <div>
                                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                    Nguyên liệu cấp bách
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Tồn kho dưới điểm đặt hàng hoặc cần nhập thêm
                                </p>
                            </div>
                            <Link
                                href="/planning/procurement"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                            >
                                <span>Tạo đơn</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>

                        <div className="mt-4 space-y-3">
                            {safeUrgentReorders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                                    <Boxes className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                                    <span className="mt-2">Tồn kho hiện tại an toàn, chưa cần đặt hàng khẩn cấp.</span>
                                </div>
                            ) : (
                                safeUrgentReorders.map((item) => (
                                    <div
                                        key={item.id}
                                        className="rounded-xl border border-amber-200/60 bg-amber-50/20 p-3 transition-colors dark:border-amber-900/40 dark:bg-amber-950/20"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                                                    {item.ingredient_name}
                                                </h4>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    NCC: {item.supplier_name || 'Mặc định'}
                                                </p>
                                            </div>
                                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                                                <AlertTriangle className="h-3 w-3" />
                                                <span>Cần nhập</span>
                                            </span>
                                        </div>

                                        <div className="mt-2.5 flex items-center justify-between border-t border-amber-200/40 pt-2 text-xs dark:border-amber-900/30">
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400">Hiện có: </span>
                                                <strong className="tabular-nums text-slate-700 dark:text-slate-300">
                                                    {formatQuantity(item.stock_quantity)} {item.unit}
                                                </strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400">Đề xuất: </span>
                                                <strong className="tabular-nums font-bold text-amber-700 dark:text-amber-300">
                                                    +{formatQuantity(item.suggested_quantity)} {item.unit}
                                                </strong>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* 7. Recent Runs Footnote / Quick history if any */}
                {safeRecentRuns.length > 1 && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Lịch sử chạy gần đây: </span>
                        {safeRecentRuns.slice(0, 5).map((r, idx) => (
                            <span key={r.id}>
                                #{r.id} ({r.kind} - {r.status})
                                {idx < Math.min(safeRecentRuns.length, 5) - 1 ? ' • ' : ''}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
