import { Head, router } from '@inertiajs/react';
import { Plus, Search, Ticket, Pencil, Eye, Filter, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DataTableColumn } from '../../../components/DataTable';
import DataTable from '../../../components/DataTable';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';
import PromotionAnalyticsCharts from './components/PromotionAnalyticsCharts';
import PromotionCodesModal from './components/PromotionCodesModal';
import PromotionFormDrawer from './components/PromotionFormDrawer';
import PromotionInvoicesModal from './components/PromotionInvoicesModal';
import PromotionStatsCards from './components/PromotionStatsCards';

interface AnalyticsKpis {
    total_revenue: number;
    total_orders: number;
    total_discount: number;
    avg_discount: number;
    roi: number;
}

interface AnalyticsData {
    kpis: AnalyticsKpis;
    daily_chart: { date: string; usage_count: number; revenue: number }[];
    type_breakdown: { type: string; count: number; percent: number }[];
}

export interface PromotionData {
    id: number;
    name: string;
    type: 'promotion' | 'coupon' | 'voucher';
    code: string | null;
    start_date: string | null;
    end_date: string | null;
    status: boolean;
    used_count: number;
    revenue: number;
    discount_total: number;
    max_usage: number | null;
    target_usage: number | null;
    stackable: boolean;
    conditions: { cond_type: string; cond_value: string }[];
    actions: { action_type: string; action_value: number; max_discount_amount: number | null }[];
    code_prefix: string | null;
    code_quantity: number | null;
    code_random: boolean;
    codes_count: number;
    codes_used: number;
    time_slots: { day_of_week: number; start_time: string; end_time: string }[];
}

interface Props {
    promotions: PromotionData[];
    stats: { total_campaigns: number; total_orders: number; total_revenue: number; total_discount: number; avg_discount: number; roi: number };
    filters: { search?: string; status?: string };
    menu_items: { id: number; name: string }[];
    menu_categories: { id: number; name: string }[];
}

const TYPE_LABEL: Record<string, string> = { promotion: 'Promotion', coupon: 'Coupon', voucher: 'Voucher' };
const TYPE_CLASS: Record<string, string> = {
    promotion: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    coupon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    voucher: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function PromotionsManager({ promotions, stats, filters, menu_items, menu_categories }: Props) {
    const [search, setSearch] = useState(filters.search || '');
    const [statusFilter, setStatusFilter] = useState(filters.status || 'all');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<PromotionData | null>(null);
    const [invoiceView, setInvoiceView] = useState<number | null>(null);
    const [codeView, setCodeView] = useState<PromotionData | null>(null);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

    useEffect(() => {
        const params = new URLSearchParams();

        if (statusFilter !== 'all') {
params.set('status', statusFilter);
}

        if (search) {
params.set('search', search);
}

        fetch(`/manager/promotions/analytics?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setAnalytics(data))
            .catch(() => {});
    }, [statusFilter, search]);

    const applyFilters = () => {
        router.get('/manager/promotions', {
            search: search || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
        }, { preserveState: true });
    };

    // Lọc ngay lập tức theo search + statusFilter (không chờ server) — đồng bộ với stat/chart
    const [now, setNow] = useState(0);
    useEffect(() => {
        queueMicrotask(() => setNow(Date.now()));
        const timer = setInterval(() => setNow(Date.now()), 30000);

        return () => clearInterval(timer);
    }, []);

    const filteredPromotions = useMemo(() => {
        const q = search.trim().toLowerCase();
        // end_date từ server dạng d/m/Y
        const toTs = (v: string | null) => {
            if (!v) {
return null;
}

            const [d, m, y] = v.split('/').map(Number);

            if (!d || !m || !y) {
return null;
}

            return new Date(y, m - 1, d, 23, 59, 59).getTime();
        };

        return promotions.filter((p) => {
            if (statusFilter !== 'all') {
                const endTs = toTs(p.end_date);

                if (statusFilter === 'running') {
                    if (!p.status) {
return false;
}

                    if (endTs !== null && endTs < now) {
return false;
}
                } else if (statusFilter === 'ended') {
                    if (endTs === null || endTs >= now) {
return false;
}
                }
            }

            if (q) {
                const code = (p.code || `KM_${p.id}`).toLowerCase();

                if (!code.includes(q) && !p.name.toLowerCase().includes(q)) {
return false;
}
            }

            return true;
        });
    }, [promotions, search, statusFilter, now]);

    const columns: DataTableColumn<PromotionData>[] = [
        { key: 'name', header: 'Mã / Tên chiến dịch', align: 'left', render: (p) => (
            <div>
                <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.code || `KM_${p.id}`}</div>
                <div className="text-xs text-zinc-500">{p.name}</div>
            </div>
        )},
        { key: 'type', header: 'Loại', align: 'center', sortable: true, render: (p) => (
            <span className={`px-2.5 py-1 rounded text-xs font-medium ${TYPE_CLASS[p.type]}`}>{TYPE_LABEL[p.type]}</span>
        )},
        { key: 'used_count', header: 'Số đơn', align: 'center', sortable: true, render: (p) => <span className="font-medium tabular-nums">{p.used_count}</span> },
        { key: 'revenue', header: 'Tổng doanh thu', align: 'right', sortable: true, render: (p) => <span className="tabular-nums">{(p.revenue ?? 0).toLocaleString('vi-VN')} đ</span> },
        { key: 'discount_total', header: 'Tổng giảm giá', align: 'right', sortable: true, render: (p) => <span className="tabular-nums">{(p.discount_total ?? 0).toLocaleString('vi-VN')} đ</span> },
        { key: 'perf', header: 'Hiệu suất', align: 'center', render: (p) => {
                    const perf = p.codes_count > 0
                        ? (p.codes_count ? Math.min(100, Math.round((p.codes_used / p.codes_count) * 100)) : null)
                        : ((p.target_usage ?? p.max_usage) ? Math.min(100, Math.round((p.used_count / (p.target_usage ?? p.max_usage!)) * 100)) : null);

            return perf === null ? <span className="text-xs text-zinc-400">—</span> : (
                <div className="flex items-center gap-2">
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-sky-600 h-full rounded-full" style={{ width: `${perf}%` }} />
                    </div>
                    <span className="text-xs font-medium text-sky-600 w-8 text-right">{perf}%</span>
                </div>
            );
        }},
        { key: 'actions', header: 'Thao tác', align: 'center', render: (p) => (
            <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => {
 setEditing(p); setDrawerOpen(true); 
}} title="Sửa"
                    className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/60">
                    <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setInvoiceView(p.id)} title="Xem hoá đơn đã dùng mã"
                    className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <Eye className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setCodeView(p)} title="Xem danh sách mã"
                    className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <Ticket className="w-4 h-4" />
                </button>
            </div>
        )},
    ];

    const hasActiveFilter = Boolean(search || statusFilter !== 'all');

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Khuyến mãi" />
            <ManagerPageLayout
                icon={Ticket}
                title="Khuyến mãi & Ưu đãi"
                subtitle="Quản lý chiến dịch khuyến mãi tự động, coupon & voucher cho POS"
                badge={
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {stats?.total_campaigns ?? filteredPromotions.length} chiến dịch
                    </span>
                }
                hasActiveFilter={hasActiveFilter}
                actions={
                    <button
                        type="button"
                        onClick={() => {
 setEditing(null); setDrawerOpen(true); 
}}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5 stroke-2" />
                        <span>Tạo khuyến mãi</span>
                    </button>
                }
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                                placeholder="Tìm theo tên chiến dịch..."
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500"
                            />
                        </div>

                        {/* Status Filter */}
                        <div className="w-44">
                            <select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value);
                                    router.get('/manager/promotions', {
                                        search: search || undefined,
                                        status: e.target.value === 'all' ? undefined : e.target.value,
                                    }, { preserveState: true });
                                }}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả trạng thái</option>
                                <option value="running">Đang chạy</option>
                                <option value="ended">Đã kết thúc</option>
                            </select>
                        </div>

                        {/* Filter Buttons */}
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={applyFilters}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-colors shadow-2xs"
                            >
                                <Filter className="w-3.5 h-3.5" />
                                <span>Lọc</span>
                            </button>
                            {hasActiveFilter && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch('');
                                        setStatusFilter('all');
                                        router.get('/manager/promotions', {}, { preserveState: true });
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                    title="Đặt lại bộ lọc"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Đặt lại</span>
                                </button>
                            )}
                        </div>
                    </div>
                }
            >
                <div className="space-y-4 flex-1 min-h-0 overflow-y-auto p-4">
                    <PromotionStatsCards stats={analytics?.kpis ?? stats} />
                    {analytics && <PromotionAnalyticsCharts daily={analytics.daily_chart} types={analytics.type_breakdown} />}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs overflow-hidden">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
                            <h3 className="font-display text-base font-medium text-zinc-900 dark:text-zinc-100">Danh sách chiến dịch khuyến mãi</h3>
                        </div>
                        <div>
                            <DataTable<PromotionData>
                                columns={columns}
                                rows={filteredPromotions}
                                rowKey={(p) => p.id}
                                emptyMessage="Chưa có chiến dịch nào"
                                defaultSortKey="id"
                                defaultSortDirection="desc"
                                getSortValue={(p, key) => {
                                    if (key === 'name') {
return p.name;
}

                                    if (key === 'type') {
return p.type;
}

                                    if (key === 'revenue') {
return p.revenue ?? 0;
}

                                    if (key === 'discount_total') {
return p.discount_total ?? 0;
}

                                    if (key === 'used_count') {
return p.used_count;
}

                                    return p.id;
                                }}
                            />
                        </div>
                    </div>
                </div>
            </ManagerPageLayout>

            <PromotionFormDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                promotionToEdit={editing}
                menuItems={menu_items}
                menuCategories={menu_categories}
            />

            <PromotionInvoicesModal isOpen={invoiceView !== null} onClose={() => setInvoiceView(null)} promotionId={invoiceView} />

            <PromotionCodesModal isOpen={codeView !== null} onClose={() => setCodeView(null)} promotion={codeView} />
        </DashboardLayout>
    );
}
