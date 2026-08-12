import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, SlidersHorizontal, Ticket } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import PromotionStatsCards from './components/PromotionStatsCards';
import PromotionAnalyticsCharts from './components/PromotionAnalyticsCharts';
import PromotionFormDrawer from './components/PromotionFormDrawer';

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
    max_usage: number | null;
    exclusive: boolean;
    stackable: boolean;
    conditions: { cond_type: string; cond_value: string }[];
    actions: { action_type: string; action_value: number; max_discount_amount: number | null }[];
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
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

    useEffect(() => {
        fetch('/manager/promotions/analytics', { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setAnalytics(data))
            .catch(() => {});
    }, []);

    const applyFilters = () => {
        router.get('/manager/promotions', {
            search: search || undefined,
            status: statusFilter === 'all' ? undefined : statusFilter,
        }, { preserveState: true });
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Khuyến mãi" />
            <ManagerPageLayout
                sidebar={
                    <>
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <Ticket className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">Khuyến mãi</h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Quản lý chiến dịch ưu đãi cho thanh toán POS</p>
                        </div>
                        <button type="button" onClick={() => { setEditing(null); setDrawerOpen(true); }}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl">
                            <Plus className="w-4 h-4" /><span>Chiến dịch mới</span>
                        </button>
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5" /><span>Bộ lọc</span>
                            </label>
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm chiến dịch..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500" />
                            </div>
                            <div>
                                <label className="text-[11px] text-zinc-500 block mb-1">Trạng thái</label>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700">
                                    <option value="all">Tất cả</option>
                                    <option value="running">Đang chạy</option>
                                    <option value="ended">Đã kết thúc</option>
                                </select>
                            </div>
                            <button type="button" onClick={applyFilters}
                                className="w-full px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl">Lọc</button>
                        </div>
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 mt-auto">
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                                <div className="text-[11px] text-zinc-500">Tổng chiến dịch</div>
                                <div className="font-display text-2xl font-normal text-zinc-900 dark:text-zinc-100">{stats?.total_campaigns ?? 0}</div>
                            </div>
                        </div>
                    </>
                }
            >
                <div className="space-y-4">
                    <PromotionStatsCards stats={analytics?.kpis ?? stats} />
                    {analytics && <PromotionAnalyticsCharts daily={analytics.daily_chart} types={analytics.type_breakdown} />}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
                        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
                            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Campaign Performance</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-zinc-50 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400 text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3">Mã / Tên chiến dịch</th>
                                        <th className="px-4 py-3">Loại</th>
                                        <th className="px-4 py-3 text-right">Số đơn</th>
                                        <th className="px-4 py-3 text-right">Hiệu suất</th>
                                        <th className="px-4 py-3 text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {promotions.length === 0 ? (
                                        <tr><td colSpan={5} className="py-12 px-6 text-center text-zinc-500">Chưa có chiến dịch nào</td></tr>
                                    ) : promotions.map((p) => {
                                        const perf = p.max_usage ? Math.min(100, Math.round((p.used_count / p.max_usage) * 100)) : null;
                                        return (
                                            <tr key={p.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-pointer"
                                                onClick={() => { setEditing(p); setDrawerOpen(true); }}>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.code || `KM_${p.id}`}</div>
                                                    <div className="text-xs text-zinc-500">{p.name}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2.5 py-1 rounded text-xs font-medium ${TYPE_CLASS[p.type]}`}>{TYPE_LABEL[p.type]}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium tabular-nums">{p.used_count}</td>
                                                <td className="px-4 py-3">
                                                    {perf === null ? (
                                                        <span className="text-xs text-zinc-400">—</span>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                                                                <div className="bg-sky-600 h-full rounded-full" style={{ width: `${perf}%` }} />
                                                            </div>
                                                            <span className="text-xs font-medium text-sky-600 w-8 text-right">{perf}%</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs text-blue-600">Sửa</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
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
        </DashboardLayout>
    );
}
