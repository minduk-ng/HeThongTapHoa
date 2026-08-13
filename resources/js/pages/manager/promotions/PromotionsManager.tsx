import { useEffect, useMemo, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Plus, Search, SlidersHorizontal, Ticket, Pencil, Eye } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DataTable, { DataTableColumn } from '../../../components/DataTable';
import PromotionStatsCards from './components/PromotionStatsCards';
import PromotionAnalyticsCharts from './components/PromotionAnalyticsCharts';
import PromotionFormDrawer from './components/PromotionFormDrawer';
import PromotionInvoicesModal from './components/PromotionInvoicesModal';
import PromotionCodesModal from './components/PromotionCodesModal';

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
    exclusive: boolean;
    stackable: boolean;
    conditions: { cond_type: string; cond_value: string }[];
    actions: { action_type: string; action_value: number; max_discount_amount: number | null }[];
    code_prefix: string | null;
    code_quantity: number | null;
    code_random: boolean;
    codes_count: number;
    codes_used: number;
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
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (search) params.set('search', search);
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
    const filteredPromotions = useMemo(() => {
        const q = search.trim().toLowerCase();
        const now = Date.now();
        // end_date từ server dạng d/m/Y
        const toTs = (v: string | null) => {
            if (!v) return null;
            const [d, m, y] = v.split('/').map(Number);
            if (!d || !m || !y) return null;
            return new Date(y, m - 1, d, 23, 59, 59).getTime();
        };
        return promotions.filter((p) => {
            if (statusFilter !== 'all') {
                const endTs = toTs(p.end_date);
                if (statusFilter === 'running') {
                    if (!p.status) return false;
                    if (endTs !== null && endTs < now) return false;
                } else if (statusFilter === 'ended') {
                    if (endTs === null || endTs >= now) return false;
                }
            }
            if (q) {
                const code = (p.code || `KM_${p.id}`).toLowerCase();
                if (!code.includes(q) && !p.name.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [promotions, search, statusFilter]);

    const columns: DataTableColumn<PromotionData>[] = [
        { key: 'name', header: 'Mã / Tên chiến dịch', render: (p) => (
            <div>
                <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.code || `KM_${p.id}`}</div>
                <div className="text-xs text-zinc-500">{p.name}</div>
            </div>
        )},
        { key: 'type', header: 'Loại', align: 'center', sortable: true, render: (p) => (
            <span className={`px-2.5 py-1 rounded text-xs font-medium ${TYPE_CLASS[p.type]}`}>{TYPE_LABEL[p.type]}</span>
        )},
        { key: 'used_count', header: 'Số đơn', align: 'center', sortable: true, render: (p) => <span className="font-medium tabular-nums">{p.used_count}</span> },
        { key: 'revenue', header: 'Tổng doanh thu', align: 'center', sortable: true, render: (p) => <span className="tabular-nums">{(p.revenue ?? 0).toLocaleString('vi-VN')} đ</span> },
        { key: 'discount_total', header: 'Tổng giảm giá', align: 'center', sortable: true, render: (p) => <span className="tabular-nums">{(p.discount_total ?? 0).toLocaleString('vi-VN')} đ</span> },
        { key: 'perf', header: 'Hiệu suất', align: 'center', render: (p) => {
                    const perf = (p.target_usage ?? p.max_usage) ? Math.min(100, Math.round((p.used_count / (p.target_usage ?? p.max_usage!)) * 100)) : null;
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
                <button type="button" onClick={() => { setEditing(p); setDrawerOpen(true); }} title="Sửa"
                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">
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
                <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
                    <PromotionStatsCards stats={analytics?.kpis ?? stats} />
                    {analytics && <PromotionAnalyticsCharts daily={analytics.daily_chart} types={analytics.type_breakdown} />}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
                        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
                            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Campaign Performance</h3>
                        </div>
                        <div className="p-3">
                            <DataTable<PromotionData>
                                columns={columns}
                                rows={filteredPromotions}
                                rowKey={(p) => p.id}
                                emptyMessage="Chưa có chiến dịch nào"
                                defaultSortKey="id"
                                defaultSortDirection="desc"
                                getSortValue={(p, key) => {
                                    if (key === 'name') return p.name;
                                    if (key === 'type') return p.type;
                                    if (key === 'revenue') return p.revenue ?? 0;
                                    if (key === 'discount_total') return p.discount_total ?? 0;
                                    if (key === 'used_count') return p.used_count;
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
