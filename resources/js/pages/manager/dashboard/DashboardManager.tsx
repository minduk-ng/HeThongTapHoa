import { Head, router } from '@inertiajs/react';
import { 
    TrendingUp, TrendingDown, 
    ChefHat, ConciergeBell, CheckCircle2,
    AlertCircle, RotateCcw, Loader2, Info, HelpCircle
} from 'lucide-react';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import DashboardLayout from '../../../layouts/DashboardLayout';

interface WarningItem {
    code: string;
    name: string;
    stock_quantity: number;
    unit: string;
    min_stock_alert: number;
}

interface TableMapItem {
    id: number;
    name: string;
    status: 'ready' | 'occupied' | 'reserved' | 'billing';
    reservation_name: string | null;
}

interface ChartItem {
    label: string;
    revenue: number;
}

interface TopProductItem {
    product_id: number;
    name: string;
    sales_count: number;
}

interface TopProductsMeta {
    source: string;
    refund_basis: string;
    unidentified_line_count: number;
    unidentified_net_quantity: number;
    invalid_line_count: number;
    generated_at: string;
}

interface DashboardProps {
    filters: {
        date_range: string;
        available_ranges: string[];
        top_k?: number;
    };
    kpis: {
        revenue: { value: number; comparison_percentage: number; trend: 'up' | 'down' };
        orders: { value: number; pending_count: number };
        tables: { occupied: number; total: number };
        inventory_warnings_count: number;
    };
    live_operations: {
        kds: {
            pending_count: number;
            completed_count: number;
            recent_items: Array<{ id: number; name: string; quantity: number; time_ago: string }>;
        };
        serving: { queue_count: number };
        tables_map: TableMapItem[];
    } | null;
    analytics: {
        chart_data: ChartItem[];
        top_products: TopProductItem[];
        top_products_meta?: TopProductsMeta;
    };
    inventory_warnings: WarningItem[];
}

export default function DashboardManager({ filters, kpis, live_operations, analytics, inventory_warnings }: DashboardProps) {
    // Realtime WebSocket sync via Echo
    useEffect(() => {
        if (filters.date_range !== 'today') {
return;
}

        const echo = (window as any).Echo;

        if (!echo) {
return;
}

        const posChannel = echo.private('pos-channel');
        
        const reloadDashboard = () => {
            router.reload({
                only: ['kpis', 'live_operations', 'analytics', 'inventory_warnings'],
                onError: () => {}
            });
        };

        posChannel
            .listen('.TableStatusUpdated', reloadDashboard)
            .listen('.OrderSentToKitchen', reloadDashboard)
            .listen('.OrderCompleted', reloadDashboard)
            .listen('.ItemsReadyToServe', reloadDashboard)
            .listen('.ItemsServed', reloadDashboard)
            .listen('.TableTransferred', reloadDashboard);

        const inventoryChannel = echo.private('inventory-channel');
        inventoryChannel.listen('.IngredientStockUpdated', reloadDashboard);

        return () => {
            echo.leaveChannel('private-pos-channel');
            echo.leaveChannel('private-inventory-channel');
        };
    }, [filters.date_range]);

    // Defensiveness checks
    const safeWarnings = Array.isArray(inventory_warnings) ? inventory_warnings : [];
    const safeChartData = Array.isArray(analytics?.chart_data) ? analytics.chart_data : [];
    const safeTablesMap = Array.isArray(live_operations?.tables_map) ? live_operations.tables_map : [];
    const safeRecentKds = Array.isArray(live_operations?.kds?.recent_items) ? live_operations.kds.recent_items : [];

    const initialK = filters.top_k ?? 5;
    const [selectedK, setSelectedK] = useState<number>(initialK);
    const [isLoadingTopK, setIsLoadingTopK] = useState(false);
    const [topKError, setTopKError] = useState<string | null>(null);
    const [displayedProducts, setDisplayedProducts] = useState<TopProductItem[]>(
        Array.isArray(analytics?.top_products) ? analytics.top_products : []
    );
    const [displayedMeta, setDisplayedMeta] = useState<TopProductsMeta | null>(
        analytics?.top_products_meta ?? null
    );
    const [prevProps, setPrevProps] = useState({
        analytics,
        dateRange: filters.date_range,
        topK: filters.top_k,
    });
    const topKSequenceRef = useRef<number>(0);

    // Adjust state when parent props change and no request is pending
    if (
        !isLoadingTopK &&
        (prevProps.analytics !== analytics ||
            prevProps.dateRange !== filters.date_range ||
            prevProps.topK !== filters.top_k)
    ) {
        setPrevProps({
            analytics,
            dateRange: filters.date_range,
            topK: filters.top_k,
        });
        setDisplayedProducts(Array.isArray(analytics?.top_products) ? analytics.top_products : []);
        setDisplayedMeta(analytics?.top_products_meta ?? null);

        if (filters.top_k) {
            setSelectedK(filters.top_k);
        }
    }

    const handleKChange = useCallback((k: number) => {
        const seq = ++topKSequenceRef.current;

        setSelectedK(k);
        setIsLoadingTopK(true);
        setTopKError(null);

        router.get(
            '/',
            { date_range: filters.date_range, top_k: k },
            {
                preserveState: true,
                preserveScroll: true,
                only: ['analytics', 'filters'],
                onSuccess: (page) => {
                    if (seq === topKSequenceRef.current) {
                        const newAnalytics = page.props.analytics as DashboardProps['analytics'] | undefined;
                        const newFilters = page.props.filters as DashboardProps['filters'] | undefined;

                        if (newAnalytics?.top_products) {
                            setDisplayedProducts(newAnalytics.top_products);
                        }

                        if (newAnalytics?.top_products_meta) {
                            setDisplayedMeta(newAnalytics.top_products_meta);
                        }

                        if (newFilters?.top_k) {
                            setSelectedK(newFilters.top_k);
                        }

                        setTopKError(null);
                        setIsLoadingTopK(false);
                    }
                },
                onError: () => {
                    if (seq === topKSequenceRef.current) {
                        setTopKError('Không thể tải danh sách món bán chạy.');
                        setIsLoadingTopK(false);
                    }
                },
                onFinish: () => {
                    if (seq === topKSequenceRef.current) {
                        setIsLoadingTopK(false);
                    }
                },
            }
        );
    }, [filters.date_range]);

    const handleRetryTopK = useCallback(() => {
        handleKChange(selectedK);
    }, [handleKChange, selectedK]);

    const getProductRowKey = (prod: TopProductItem, index: number): string => {
        if (prod.product_id != null) {
            return Number.isSafeInteger(Number(prod.product_id))
                ? String(prod.product_id)
                : String(prod.product_id);
        }

        return `top-product-${index}`;
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    };

    const handleRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        router.get('/', { date_range: e.target.value, top_k: selectedK }, { preserveState: true });
    };

    const getTableColorClass = (status: string) => {
        switch (status) {
            case 'occupied': return 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400';
            case 'reserved': return 'bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-950/20 dark:border-purple-900/40 dark:text-purple-400';
            case 'billing': return 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-400';
            default: return 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/10 dark:border-emerald-900/30 dark:text-emerald-400 opacity-60';
        }
    };

    const tableOccupancyPercent = kpis.tables.total > 0 ? (kpis.tables.occupied / kpis.tables.total) * 100 : 0;

    return (
        <DashboardLayout>
            <Head title="Tổng quan Quản lý" />
            
            {/* Header section with Toolbar filter */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                <div>
                    <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Tổng quan</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Giám sát hoạt động và doanh thu cửa hàng</p>
                </div>
                <div className="flex gap-2">
                    <select 
                        value={filters.date_range} 
                        onChange={handleRangeChange}
                        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-semibold px-4 py-2 focus:border-sky-500 focus:outline-hidden"
                    >
                        <option value="today">Hôm nay</option>
                        <option value="yesterday">Hôm qua</option>
                        <option value="last_7_days">7 ngày qua</option>
                        <option value="this_month">Tháng này</option>
                    </select>
                </div>
            </div>

            {/* Row 1: KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {/* KPI 1: Doanh thu */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 p-5 rounded-2xl shadow-xs hover:border-sky-500/50 transition-colors duration-150">
                    <p className="text-xs font-medium text-zinc-500">Doanh thu</p>
                    <div className="font-display text-3xl font-semibold mt-1 text-zinc-900 dark:text-white tabular-nums">
                        {formatCurrency(kpis.revenue.value)}
                    </div>
                    <div className="mt-3 flex items-center gap-1">
                        {kpis.revenue.trend === 'up' ? (
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-rose-500" />
                        )}
                        <span className={`font-bold text-xs ${kpis.revenue.comparison_percentage >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {kpis.revenue.comparison_percentage >= 0 ? '+' : ''}{kpis.revenue.comparison_percentage}%
                        </span>
                        <span className="text-zinc-400 text-xs ml-1">vs kỳ trước</span>
                    </div>
                </div>

                {/* KPI 2: Tổng đơn */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 p-5 rounded-2xl shadow-xs hover:border-sky-500/50 transition-colors duration-150">
                    <p className="text-xs font-medium text-zinc-500">Tổng đơn hàng</p>
                    <div className="font-display text-3xl font-semibold mt-1 text-zinc-900 dark:text-white tabular-nums">
                        {kpis.orders.value} <span className="text-sm font-normal text-zinc-500">đơn</span>
                    </div>
                    <div className="mt-3 flex items-center gap-1">
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 rounded-full text-[11px] font-semibold">
                            {kpis.orders.pending_count} đơn đang xử lý
                        </span>
                    </div>
                </div>

                {/* KPI 3: Bàn bận */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 p-5 rounded-2xl shadow-xs hover:border-sky-500/50 transition-colors duration-150">
                    <p className="text-xs font-medium text-zinc-500">Trạng thái bàn</p>
                    <div className="font-display text-3xl font-semibold mt-1 text-zinc-900 dark:text-white tabular-nums">
                        {kpis.tables.occupied}/{kpis.tables.total} <span className="text-sm font-normal text-zinc-500">bàn bận</span>
                    </div>
                    <div className="mt-3 w-full">
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${tableOccupancyPercent}%` }}></div>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium tabular-nums">{Math.round(tableOccupancyPercent)}% công suất</p>
                    </div>
                </div>

                {/* KPI 4: Nguyên liệu hết */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 p-5 rounded-2xl shadow-xs hover:border-sky-500/50 transition-colors duration-150 border-l-4 border-l-rose-500">
                    <p className="text-xs font-medium text-zinc-500">Kho nguyên liệu</p>
                    <div className="font-display text-3xl font-semibold mt-1 text-rose-600 dark:text-rose-400 tabular-nums">
                        {kpis.inventory_warnings_count} <span className="text-sm font-normal text-zinc-500">mặt hàng hết</span>
                    </div>
                    <div className="mt-3">
                        <span className="text-rose-500 font-semibold text-xs">Cần nhập kho ngay</span>
                    </div>
                </div>
            </div>

            {/* Row 2: Live Operations Monitor (Only if range is 'today') */}
            {filters.date_range === 'today' && live_operations && (
                <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 mb-4 animate-fade-in">
                    {/* Kitchen Display Monitor */}
                    <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col shadow-xs">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-900 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                            <div className="flex items-center gap-2">
                                <ChefHat className="w-5 h-5 text-sky-600" />
                                <h4 className="font-display text-sm font-bold text-zinc-900 dark:text-white">Giám sát Bếp</h4>
                            </div>
                            <button 
                                onClick={() => router.get('/staff/kitchen')} 
                                className="text-xs text-sky-600 dark:text-sky-400 font-semibold hover:underline"
                            >
                                Chi tiết
                            </button>
                        </div>
                        <div className="p-5 flex-1 flex flex-col gap-4">
                            <div className="flex items-center justify-around py-4 bg-zinc-50 dark:bg-zinc-800/20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                <div className="text-center">
                                    <p className="font-display text-3xl font-black text-amber-500 tabular-nums">
                                        {String(live_operations.kds.pending_count).padStart(2, '0')}
                                    </p>
                                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-full text-[11px] font-bold uppercase tracking-wider">Đang chờ</span>
                                </div>
                                <div className="w-px h-12 bg-zinc-200 dark:bg-zinc-800"></div>
                                <div className="text-center">
                                    <p className="font-display text-3xl font-black text-emerald-500 tabular-nums">
                                        {String(live_operations.kds.completed_count).padStart(2, '0')}
                                    </p>
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-full text-[11px] font-bold uppercase tracking-wider">Hoàn thành</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {safeRecentKds.map((kdsItem) => (
                                    <div key={kdsItem.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/10 rounded-xl flex justify-between items-center border border-zinc-100 dark:border-zinc-800/40">
                                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate pr-2">
                                            {kdsItem.name} (x{kdsItem.quantity})
                                        </span>
                                        <span className="text-[11px] text-zinc-400 shrink-0 font-medium tabular-nums">{kdsItem.time_ago}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Serving Status Card */}
                    <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col shadow-xs">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-900 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                            <div className="flex items-center gap-2">
                                <ConciergeBell className="w-5 h-5 text-sky-600" />
                                <h4 className="font-display text-sm font-bold text-zinc-900 dark:text-white">Khu vực Phục vụ</h4>
                            </div>
                        </div>
                        <div className="p-5 flex-1 flex flex-col justify-center items-center text-center gap-6">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-full border-4 border-sky-100 dark:border-sky-950/60 flex items-center justify-center">
                                    <span className="font-display text-3xl font-black text-zinc-800 dark:text-white tabular-nums">
                                        {String(live_operations.serving.queue_count).padStart(2, '0')}
                                    </span>
                                </div>
                                {live_operations.serving.queue_count > 0 && (
                                    <div className="absolute -top-1 -right-1 w-5.5 h-5.5 bg-rose-500 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-white dark:border-zinc-900 animate-pulse">
                                        !
                                    </div>
                                )}
                            </div>
                            <div>
                                <h5 className="font-display text-sm font-bold text-zinc-800 dark:text-zinc-100">Món ăn chờ phục vụ</h5>
                                <p className="text-xs text-zinc-400 mt-1">Đang chờ nhân viên chạy bàn phân phối</p>
                            </div>
                            <button 
                                onClick={() => router.get('/staff/serving')}
                                className="w-full py-2.5 bg-sky-600 text-white font-bold rounded-xl shadow-xs hover:bg-sky-500 active:scale-[0.98] transition-colors text-xs"
                            >
                                Đến màn hình phục vụ
                            </button>
                        </div>
                    </div>

                    {/* Active Tables Map Layout */}
                    <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col shadow-xs">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-900 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                            <h4 className="font-display text-sm font-bold text-zinc-900 dark:text-white">Sơ đồ bàn thực tế</h4>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-1 text-[11px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Bận</div>
                                <div className="flex items-center gap-1 text-[11px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Trả</div>
                                <div className="flex items-center gap-1 text-[11px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Cọc</div>
                            </div>
                        </div>
                        <div className="p-4 flex-1 grid grid-cols-4 gap-2 overflow-y-auto max-h-[250px]">
                            {safeTablesMap.map((tbl) => (
                                <div 
                                    key={tbl.id} 
                                    className={`aspect-square border rounded-xl flex flex-col items-center justify-center text-center p-1.5 transition-colors duration-150 ${getTableColorClass(tbl.status)}`}
                                    title={tbl.reservation_name ? `Cọc: ${tbl.reservation_name}` : tbl.status}
                                >
                                    <span className="text-[11px] font-bold tracking-tight">{tbl.name}</span>
                                    <span className="text-[11px] opacity-80 scale-90 truncate max-w-full font-medium mt-0.5">
                                        {tbl.status === 'ready' ? 'Trống' : tbl.status === 'billing' ? 'Trả' : tbl.status === 'reserved' ? 'Cọc' : 'Bận'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Row 3: Charts & Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Revenue hourly chart block */}
                <div className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col shadow-xs">
                    <div className="p-5 border-b border-zinc-100 dark:border-zinc-900 flex justify-between items-center">
                        <div>
                            <h4 className="font-display text-sm font-bold text-zinc-900 dark:text-white">Phân tích doanh thu</h4>
                            <p className="text-xs text-zinc-400 mt-0.5">Thống kê biểu đồ cột / miền</p>
                        </div>
                    </div>
                    <div className="p-5 flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={safeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-zinc-800/50" />
                                <XAxis 
                                    dataKey="label" 
                                    stroke="#94a3b8" 
                                    fontSize={10} 
                                    tickLine={false} 
                                    interval={filters.date_range === 'today' || filters.date_range === 'yesterday' ? 2 : 'preserveStartEnd'}
                                />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={(tick) => `${tick / 1000}k`} />
                                <Tooltip 
                                    formatter={(value) => [formatCurrency(Number(value)), 'Doanh thu']}
                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Sidebar stats list: Top Products & Stock warnings */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Top Products */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 p-5 rounded-2xl shadow-xs flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <h5 className="font-display text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                                    Top {selectedK} món bán chạy
                                </h5>
                                {isLoadingTopK && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 dark:text-sky-400" />
                                )}
                            </div>
                            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                                {[5, 10, 20].map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => handleKChange(k)}
                                        className={`px-2 py-0.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                                            selectedK === k
                                                ? 'bg-white dark:bg-zinc-700 text-sky-600 dark:text-sky-400 shadow-xs'
                                                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                                        }`}
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {topKError ? (
                            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-center my-auto">
                                <AlertCircle className="w-5 h-5 text-rose-500 mx-auto mb-1.5" />
                                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mb-2.5">{topKError}</p>
                                <button
                                    type="button"
                                    onClick={handleRetryTopK}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Thử lại
                                </button>
                            </div>
                        ) : (
                            <div className={`space-y-2 flex-1 relative transition-opacity duration-150 ${isLoadingTopK ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                                    {displayedProducts.map((prod, index) => (
                                        <div 
                                            key={getProductRowKey(prod, index)} 
                                            className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors"
                                        >
                                            <span className={`w-5.5 h-5.5 rounded-lg text-[11px] flex items-center justify-center font-bold shrink-0 ${
                                                index === 0 ? 'bg-sky-600 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                            }`}>
                                                {index + 1}
                                            </span>
                                            <span className="flex-1 text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate" title={prod.name}>
                                                {prod.name}
                                            </span>
                                            <span className="text-sky-600 dark:text-sky-400 font-black text-xs tabular-nums">
                                                {prod.sales_count} món
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {displayedProducts.length === 0 && (
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 italic text-center py-6">
                                        Chưa có dữ liệu đơn hàng trong kỳ
                                    </p>
                                )}
                            </div>
                        )}

                        {displayedMeta && (displayedMeta.unidentified_line_count > 0 || displayedMeta.invalid_line_count > 0) && (
                            <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                                <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                                <div className="space-y-0.5">
                                    {displayedMeta.unidentified_line_count > 0 && (
                                        <p>
                                            Bỏ qua {displayedMeta.unidentified_line_count} dòng chưa xác định món ({displayedMeta.unidentified_net_quantity} sản phẩm).
                                        </p>
                                    )}
                                    {displayedMeta.invalid_line_count > 0 && (
                                        <p>
                                            Bỏ qua {displayedMeta.invalid_line_count} dòng dữ liệu không hợp lệ.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500" title="Hoàn tiền theo giá trị tiền (không kèm số lượng món) không được khấu trừ vào số lượng bán.">
                            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Hoàn tiền theo giá trị tiền (amount-only) không suy diễn số lượng hoàn.</span>
                        </div>
                    </div>

                    {/* Stock Warnings widget */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 p-5 rounded-2xl shadow-xs flex-1 flex flex-col">
                        <h5 className="font-display text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-4">Cảnh báo kho nguyên liệu</h5>
                        <div className="space-y-3 flex-1 overflow-y-auto max-h-[180px] pr-1">
                            {safeWarnings.map((ing) => (
                                <div key={ing.code} className="flex justify-between items-center gap-2">
                                    <div className="truncate">
                                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-250 truncate">{ing.name}</p>
                                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium tabular-nums">
                                            Tồn: {ing.stock_quantity} / Định mức: {ing.min_stock_alert} {ing.unit}
                                        </p>
                                    </div>
                                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-450 rounded-full text-[11px] font-bold uppercase shrink-0">
                                        Thiếu
                                    </span>
                                </div>
                            ))}
                            {safeWarnings.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-6 text-center text-emerald-500">
                                    <CheckCircle2 className="w-8 h-8 stroke-[1.5] mb-2" />
                                    <p className="text-xs font-bold">Kho nguyên liệu an toàn</p>
                                </div>
                            )}
                        </div>
                        {safeWarnings.length > 0 && (
                            <button 
                                onClick={() => router.get('/manager/inventory/ingredients')}
                                className="w-full mt-4 py-2 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold rounded-xl text-xs transition-colors"
                            >
                                Nhập nguyên liệu ngay
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
