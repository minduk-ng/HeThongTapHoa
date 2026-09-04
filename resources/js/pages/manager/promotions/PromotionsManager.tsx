import { Head, router } from '@inertiajs/react';
import { Plus, Search, Ticket, Pencil, Eye, Filter, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

    const kanbanGroups = useMemo(() => {
        const toTimestamp = (v: string | null) => {
            if (!v) {
                return null;
            }

            const [d, m, y] = v.split('/').map(Number);

            if (!d || !m || !y) {
                return null;
            }

            return new Date(y, m - 1, d, 23, 59, 59).getTime();
        };

        return [
            {
                title: 'Đang chạy',
                countBadge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
                color: 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20',
                items: filteredPromotions.filter((p) => {
                    const end = toTimestamp(p.end_date);
                    const isNearEnd = p.status && end !== null && end - now >= 0 && end - now <= 7 * 86400000;

                    return p.status && (!end || end >= now) && !isNearEnd;
                }),
            },
            {
                title: 'Sắp kết thúc (≤ 7 ngày)',
                countBadge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
                color: 'border-amber-200/80 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20',
                items: filteredPromotions.filter((p) => {
                    const end = toTimestamp(p.end_date);

                    return p.status && end !== null && end - now >= 0 && end - now <= 7 * 86400000;
                }),
            },
            {
                title: 'Đã kết thúc',
                countBadge: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
                color: 'border-zinc-200/80 bg-zinc-50/40 dark:border-zinc-800/80 dark:bg-zinc-900/40',
                items: filteredPromotions.filter((p) => {
                    const end = toTimestamp(p.end_date);

                    return !p.status || (end !== null && end < now);
                }),
            },
        ];
    }, [filteredPromotions, now]);

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
                    {analytics && (
                        <PromotionAnalyticsCharts
                            daily={analytics.daily_chart}
                            types={analytics.type_breakdown}
                        />
                    )}
                    {/* Kanban Board 3 cột theo trạng thái */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                        {kanbanGroups.map((group) => (
                            <div
                                key={group.title}
                                className={`flex flex-col rounded-2xl border p-3.5 min-h-[280px] ${group.color}`}
                            >
                                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                                    <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        {group.title}
                                    </h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${group.countBadge}`}>
                                        {group.items.length}
                                    </span>
                                </div>

                                {group.items.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center p-6 text-xs text-zinc-400 dark:text-zinc-500">
                                        Không có chiến dịch nào
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {group.items.map((p) => {
                                            const perf = p.codes_count > 0
                                                ? (p.codes_count ? Math.min(100, Math.round((p.codes_used / p.codes_count) * 100)) : null)
                                                : ((p.target_usage ?? p.max_usage) ? Math.min(100, Math.round((p.used_count / (p.target_usage ?? p.max_usage!)) * 100)) : null);

                                            return (
                                                <div
                                                    key={p.id}
                                                    className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-3 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-xs text-zinc-900 dark:text-zinc-100 truncate" title={p.name}>
                                                                {p.name}
                                                            </div>
                                                            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                                {p.code || `KM_${p.id}`}
                                                            </div>
                                                        </div>
                                                        <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${TYPE_CLASS[p.type]}`}>
                                                            {TYPE_LABEL[p.type]}
                                                        </span>
                                                    </div>

                                                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                                                        <span>Số đơn: <strong className="text-zinc-800 dark:text-zinc-200 tabular-nums">{p.used_count}</strong></span>
                                                        <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">{(p.revenue ?? 0).toLocaleString('vi-VN')} đ</span>
                                                    </div>

                                                    {perf !== null && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                                                <div className="bg-sky-600 h-full rounded-full" style={{ width: `${perf}%` }} />
                                                            </div>
                                                            <span className="text-[11px] font-medium text-sky-600 tabular-nums">{perf}%</span>
                                                        </div>
                                                    )}

                                                    {p.end_date && (
                                                        <div className="mt-2 text-[11px] text-zinc-400">
                                                            <span>Đến: {p.end_date}</span>
                                                        </div>
                                                    )}

                                                    <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditing(p);
                                                                setDrawerOpen(true);
                                                            }}
                                                            title="Sửa"
                                                            className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/60 transition-colors"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setInvoiceView(p.id)}
                                                            title="Xem hoá đơn đã dùng mã"
                                                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCodeView(p)}
                                                            title="Xem danh sách mã"
                                                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                                        >
                                                            <Ticket className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
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
