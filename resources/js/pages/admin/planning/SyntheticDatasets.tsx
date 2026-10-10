import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    Database,
    ExternalLink,
    FlaskConical,
    Hash,
    Loader2,
    Play,
    Plus,
    Search,
    ShieldAlert,
    Sliders,
    Trash2,
    X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    formatDate,
    formatQuantity,
    formatRunStatusLabel,
} from '../../../components/planning/planningFormatters';
import DashboardLayout from '../../../layouts/DashboardLayout';

export interface SyntheticDatasetItem {
    id: number;
    name: string;
    description?: string | null;
    seed: number;
    configuration?: Record<string, unknown> | null;
    config?: Record<string, unknown> | null;
    configuration_hash?: string | null;
    generator_version?: string | null;
    dataset_hash?: string | null;
    source_label?: string | null;
    invoices_count?: number;
    creator?: { id: number; name: string; email: string } | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface SyntheticRunSummary {
    id: number;
    synthetic_dataset_id?: number | null;
    kind: string;
    horizon_days: number;
    status: string;
    created_at: string;
}

interface SyntheticDatasetsProps {
    datasets?: SyntheticDatasetItem[];
    recentRuns?: SyntheticRunSummary[];
    filters?: {
        search?: string | null;
    };
}

export default function SyntheticDatasets({
    datasets = [],
    recentRuns = [],
    filters = {},
}: SyntheticDatasetsProps) {
    const [search, setSearch] = useState(filters?.search || '');
    const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [datasetToDelete, setDatasetToDelete] = useState<SyntheticDatasetItem | null>(null);
    const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
    const [runningDatasetId, setRunningDatasetId] = useState<number | null>(null);

    // Scenario form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [days, setDays] = useState(120);
    const [ordersPerDay, setOrdersPerDay] = useState(20);
    const [seed, setSeed] = useState(42);

    // Advanced parameters
    const [trend, setTrend] = useState(0.0);
    const [weekly, setWeekly] = useState(true);
    const [promotionRate, setPromotionRate] = useState(0.05);
    const [promotionFactor, setPromotionFactor] = useState(1.5);
    const [noise, setNoise] = useState(0.1);
    const [zeroDemandRate, setZeroDemandRate] = useState(0.0);
    const [outlierRate, setOutlierRate] = useState(0.01);
    const [missingRate, setMissingRate] = useState(0.0);
    const [stockoutCensorRate, setStockoutCensorRate] = useState(0.0);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Filter datasets
    const filteredDatasets = useMemo(() => {
        return datasets.filter((d) => {
            const term = search.toLowerCase().trim();

            if (!term) {
                return true;
            }

            return (
                d.name.toLowerCase().includes(term) ||
                (d.description && d.description.toLowerCase().includes(term)) ||
                (d.dataset_hash && d.dataset_hash.toLowerCase().includes(term))
            );
        });
    }, [datasets, search]);

    // Mock preview chart series based on scenario parameters
    const previewSeries = useMemo(() => {
        const previewDays = Math.min(30, days);
        const series: Array<{ day: string; demand: number }> = [];

        const weeklyFactors: Record<number, number> = {
            0: 1.15,
            1: 0.85,
            2: 0.9,
            3: 0.95,
            4: 1.0,
            5: 1.2,
            6: 1.35,
        };

        let currentSeed = seed;

        for (let i = 0; i < previewDays; i++) {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            const rand1 = currentSeed / 233280;
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            const rand2 = currentSeed / 233280;

            const dayOfWeek = i % 7;
            const weekFactor = weekly ? (weeklyFactors[dayOfWeek] ?? 1.0) : 1.0;
            const trendFactor = 1.0 + trend * i;
            const isPromo = rand1 < promotionRate;
            const promoFactor = isPromo ? promotionFactor : 1.0;
            const noiseVal = noise > 0 ? (rand2 * 2 - 1) * noise * ordersPerDay : 0;

            let qty = Math.round(ordersPerDay * trendFactor * weekFactor * promoFactor + noiseVal);

            if (zeroDemandRate > 0 && rand1 < zeroDemandRate) {
                qty = 0;
            } else if (outlierRate > 0 && rand2 < outlierRate) {
                qty = Math.round(qty * 2.5);
            } else if (stockoutCensorRate > 0 && rand1 < stockoutCensorRate) {
                qty = Math.round(qty * 0.4);
            }

            series.push({
                day: `Ng. ${i + 1}`,
                demand: Math.max(0, qty),
            });
        }

        return series;
    }, [
        days,
        ordersPerDay,
        seed,
        trend,
        weekly,
        promotionRate,
        promotionFactor,
        noise,
        zeroDemandRate,
        outlierRate,
        stockoutCensorRate,
    ]);

    // Submit scenario creation
    const handleCreateDataset = (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setFormError('Vui lòng nhập tên tập dữ liệu.');

            return;
        }

        setIsSubmitting(true);
        setFormError(null);

        const configuration = {
            days,
            orders_per_day: ordersPerDay,
            base: ordersPerDay,
            trend,
            weekly,
            promotion_rate: promotionRate,
            promotion_factor: promotionFactor,
            noise,
            zero_demand_rate: zeroDemandRate,
            zero_demand: zeroDemandRate,
            outlier_rate: outlierRate,
            missing_rate: missingRate,
            stockout_censor_rate: stockoutCensorRate,
            stockout_censor: stockoutCensorRate,
        };

        router.post(
            '/admin/synthetic-datasets',
            {
                name: name.trim(),
                description: description.trim() || null,
                seed,
                configuration,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setIsSubmitting(false);
                    setIsCreateDrawerOpen(false);
                    setName('');
                    setDescription('');
                },
                onError: (err) => {
                    setIsSubmitting(false);
                    setFormError(String(Object.values(err)[0] || 'Lỗi khi tạo tập dữ liệu.'));
                },
            }
        );
    };

    // Trigger run demand forecast on a dataset
    const handleRunDataset = (datasetId: number) => {
        setRunningDatasetId(datasetId);

        router.post(
            '/planning/runs',
            {
                horizon_days: 7,
                synthetic_dataset_id: datasetId,
            },
            {
                preserveScroll: true,
                onFinish: () => {
                    setRunningDatasetId(null);
                },
            }
        );
    };

    // Confirm deletion
    const handleDeleteDataset = () => {
        if (!datasetToDelete) {
            return;
        }

        setIsDeleting(true);
        setDeleteError(null);

        router.delete(`/admin/synthetic-datasets/${datasetToDelete.id}`, {
            data: {
                confirmation: deleteConfirmationInput.trim(),
            },
            preserveScroll: true,
            onSuccess: () => {
                setIsDeleting(false);
                setDatasetToDelete(null);
                setDeleteConfirmationInput('');
                setDeleteError(null);
            },
            onError: (err) => {
                setIsDeleting(false);
                setDeleteError(String(Object.values(err)[0] || 'Lỗi khi xóa tập dữ liệu.'));
            },
        });
    };

    return (
        <DashboardLayout>
            <Head title="Thử nghiệm tập dữ liệu mô phỏng (Synthetic Workbench)" />

            <div className="space-y-6 pb-20">
                {/* Header Title */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                            Không gian thử nghiệm Dữ liệu mô phỏng (Synthetic)
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Sinh dữ liệu bán hàng giả lập để thử nghiệm độ chính xác mô hình dự báo và tối ưu tồn kho
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsCreateDrawerOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-sky-700"
                    >
                        <Plus className="h-4 w-4" />
                        Tạo kịch bản mới
                    </button>
                </div>

                {/* Prominent Sandbox Isolation Warning Banner */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/60 dark:bg-amber-950/40">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                            <ShieldAlert className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <h2 className="font-display text-sm font-bold text-amber-900 dark:text-amber-200">
                                Dữ liệu thử nghiệm — không ghi đè dữ liệu vận hành
                            </h2>
                            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                                Toàn bộ hóa đơn và nhu cầu mô phỏng được cô lập hoàn toàn trong môi trường Sandbox (tiền tố{' '}
                                <code className="rounded bg-amber-200/60 px-1 py-0.5 font-mono dark:bg-amber-900/80">
                                    SYN-
                                </code>
                                ). Không ảnh hưởng đến doanh thu thực tế, chỉ số tài chính, sổ cái tiền hay tồn kho vận hành của quán.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Toolbar / Search */}
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
                    <div className="relative min-w-[280px] flex-1">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Tìm kiếm theo tên tập dữ liệu, hash hoặc mô tả..."
                            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Tổng cộng: <strong className="text-slate-900 dark:text-white">{filteredDatasets.length}</strong> tập dữ liệu
                    </div>
                </div>

                {/* Dataset List */}
                {filteredDatasets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-800">
                        <FlaskConical className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                        <h3 className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-white">
                            Chưa có tập dữ liệu mô phỏng nào
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Bấm "Tạo kịch bản mới" để khởi tạo tập dữ liệu tổng hợp với các mẫu nhu cầu khác nhau.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        {filteredDatasets.map((dataset) => {
                            const isRunning = runningDatasetId === dataset.id;
                            const config = dataset.config || dataset.configuration || {};
                            const datasetRuns = recentRuns.filter(
                                (r) => r.synthetic_dataset_id === dataset.id
                            );
                            const latestRun = datasetRuns[0] || null;

                            return (
                                <div
                                    key={dataset.id}
                                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                                >
                                    <div>
                                        {/* Card Header */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                                                    <Database className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                                                        {dataset.name}
                                                    </h3>
                                                    <span className="text-xs text-slate-400">
                                                        Tạo bởi: {dataset.creator?.name || 'Hệ thống'} • {formatDate(dataset.created_at)}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDatasetToDelete(dataset);
                                                    setDeleteConfirmationInput('');
                                                }}
                                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                                                title="Xóa tập dữ liệu"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>

                                        {dataset.description && (
                                            <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-300">
                                                {dataset.description}
                                            </p>
                                        )}

                                        {/* Configuration Pills */}
                                        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                Seed: <strong className="tabular-nums">{dataset.seed}</strong>
                                            </span>
                                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                Khoảng: <strong className="tabular-nums">{Number(config.days ?? 120)}</strong> ngày
                                            </span>
                                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                Cơ sở: <strong className="tabular-nums">{Number(config.orders_per_day ?? 20)}</strong> đơn/ngày
                                            </span>
                                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                Số HĐ: <strong className="tabular-nums">{formatQuantity(dataset.invoices_count)}</strong>
                                            </span>
                                            <span className="rounded-lg bg-purple-50 px-2.5 py-1 font-medium text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                                v{dataset.generator_version || '1.0.0'}
                                            </span>
                                        </div>

                                        {/* Hashes */}
                                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-[11px] text-slate-400 dark:border-slate-800/60 dark:bg-slate-950/40">
                                            <div className="flex items-center gap-1 truncate font-mono">
                                                <Hash className="h-3 w-3 shrink-0" />
                                                <span>Hash: {dataset.dataset_hash ? dataset.dataset_hash.slice(0, 20) + '...' : '-'}</span>
                                            </div>
                                        </div>

                                        {/* Run Status Indicator */}
                                        <div className="mt-3 flex items-center justify-between text-xs">
                                            <span className="text-slate-500 dark:text-slate-400">Trạng thái chạy gần nhất:</span>
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                                                    latestRun?.status === 'completed'
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                        : latestRun?.status === 'running'
                                                          ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                                          : latestRun?.status === 'failed'
                                                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                }`}
                                            >
                                                {formatRunStatusLabel(latestRun?.status || 'empty')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => handleRunDataset(dataset.id)}
                                            disabled={isRunning}
                                            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 disabled:opacity-50"
                                        >
                                            {isRunning ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Play className="h-3.5 w-3.5" />
                                            )}
                                            Chạy dự báo
                                        </button>

                                        <Link
                                            href={`/planning/products?synthetic_dataset_id=${dataset.id}`}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <BarChart3 className="h-3.5 w-3.5" />
                                            Dự báo
                                        </Link>

                                        <Link
                                            href={`/planning/procurement?synthetic_dataset_id=${dataset.id}`}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Đề xuất mua
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create Scenario Drawer */}
            {isCreateDrawerOpen && (
                <div
                    className="fixed inset-0 z-50 overflow-hidden"
                    aria-labelledby="drawer-scenario-title"
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
                        onClick={() => setIsCreateDrawerOpen(false)}
                        aria-hidden="true"
                    />

                    <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
                        <div className="flex w-screen max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                                        <Sliders className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2
                                            id="drawer-scenario-title"
                                            className="font-display text-lg font-bold text-slate-900 dark:text-white"
                                        >
                                            Cấu hình Kịch bản Sinh Dữ liệu
                                        </h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Mô phỏng chuỗi thời gian nhu cầu với xu hướng, tính mùa vụ và nhiễu
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsCreateDrawerOpen(false)}
                                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Drawer Form Body */}
                            <form
                                onSubmit={handleCreateDataset}
                                className="flex-1 space-y-6 overflow-y-auto p-6"
                            >
                                {formError && (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                                        {formError}
                                    </div>
                                )}

                                {/* Basic Fields */}
                                <div className="space-y-4">
                                    <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        Thông tin cơ bản
                                    </h3>

                                    <div>
                                        <label
                                            htmlFor="scenario-name"
                                            className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                                        >
                                            Tên tập dữ liệu *
                                        </label>
                                        <input
                                            id="scenario-name"
                                            type="text"
                                            required
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="VD: Kịch bản Trà Sữa Mùa Hè - Có Khuyến Mãi"
                                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label
                                            htmlFor="scenario-desc"
                                            className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                                        >
                                            Mô tả mục đích
                                        </label>
                                        <textarea
                                            id="scenario-desc"
                                            rows={2}
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Ghi chú về đặc thù kịch bản để so sánh..."
                                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label
                                                htmlFor="scenario-days"
                                                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                                            >
                                                Số ngày (days)
                                            </label>
                                            <input
                                                id="scenario-days"
                                                type="number"
                                                min="10"
                                                max="365"
                                                value={days}
                                                onChange={(e) => setDays(parseInt(e.target.value) || 30)}
                                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs tabular-nums text-slate-900 focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label
                                                htmlFor="scenario-orders"
                                                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                                            >
                                                Đơn/ngày (base)
                                            </label>
                                            <input
                                                id="scenario-orders"
                                                type="number"
                                                min="1"
                                                max="500"
                                                value={ordersPerDay}
                                                onChange={(e) => setOrdersPerDay(parseInt(e.target.value) || 20)}
                                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs tabular-nums text-slate-900 focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                            />
                                        </div>

                                        <div>
                                            <label
                                                htmlFor="scenario-seed"
                                                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                                            >
                                                Hạt ngẫu nhiên (seed)
                                            </label>
                                            <input
                                                id="scenario-seed"
                                                type="number"
                                                value={seed}
                                                onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
                                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs tabular-nums text-slate-900 focus:border-sky-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Advanced Parameters */}
                                <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                                    <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        Tham số chuỗi thời gian nâng cao
                                    </h3>

                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                        {/* Trend */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Xu hướng (Trend):</span>
                                                <span className="font-mono tabular-nums">{trend}</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="-0.02"
                                                max="0.05"
                                                step="0.005"
                                                value={trend}
                                                onChange={(e) => setTrend(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>

                                        {/* Noise */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Tỷ lệ nhiễu (Noise):</span>
                                                <span className="font-mono tabular-nums">{noise}</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="0.5"
                                                step="0.05"
                                                value={noise}
                                                onChange={(e) => setNoise(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>

                                        {/* Promotion Rate */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Tần suất KM (Promo):</span>
                                                <span className="font-mono tabular-nums">{promotionRate * 100}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="0.3"
                                                step="0.02"
                                                value={promotionRate}
                                                onChange={(e) => setPromotionRate(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>

                                        {/* Promotion Factor */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Hệ số nhân KM (Promo Factor):</span>
                                                <span className="font-mono tabular-nums">{promotionFactor}x</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="1.0"
                                                max="3.0"
                                                step="0.1"
                                                value={promotionFactor}
                                                onChange={(e) => setPromotionFactor(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>

                                        {/* Missing Observations Rate */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Thiếu quan sát (Missing):</span>
                                                <span className="font-mono tabular-nums">{missingRate * 100}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="0.1"
                                                step="0.01"
                                                value={missingRate}
                                                onChange={(e) => setMissingRate(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>

                                        {/* Zero Demand Rate */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Tỷ lệ ngày 0 đơn:</span>
                                                <span className="font-mono tabular-nums">{zeroDemandRate * 100}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="0.4"
                                                step="0.05"
                                                value={zeroDemandRate}
                                                onChange={(e) => setZeroDemandRate(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>

                                        {/* Outlier Rate */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Tỷ lệ ngoại lai (Outliers):</span>
                                                <span className="font-mono tabular-nums">{outlierRate * 100}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="0.1"
                                                step="0.01"
                                                value={outlierRate}
                                                onChange={(e) => setOutlierRate(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>

                                        {/* Stockout Censor */}
                                        <div>
                                            <label className="flex justify-between font-medium text-slate-700 dark:text-slate-300">
                                                <span>Cắt gọt đứt hàng (Stockout):</span>
                                                <span className="font-mono tabular-nums">{stockoutCensorRate * 100}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="0.2"
                                                step="0.02"
                                                value={stockoutCensorRate}
                                                onChange={(e) => setStockoutCensorRate(parseFloat(e.target.value))}
                                                className="mt-2 w-full accent-sky-600"
                                            />
                                        </div>
                                    </div>

                                    {/* Weekly Toggle */}
                                    <div className="flex items-center gap-2 pt-1 text-xs">
                                        <input
                                            id="weekly-toggle"
                                            type="checkbox"
                                            checked={weekly}
                                            onChange={(e) => setWeekly(e.target.checked)}
                                            className="rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
                                        />
                                        <label
                                            htmlFor="weekly-toggle"
                                            className="font-medium text-slate-700 dark:text-slate-300"
                                        >
                                            Bật chu kỳ mùa vụ theo tuần (Thứ 6, Thứ 7 cao hơn ngày trong tuần)
                                        </label>
                                    </div>
                                </div>

                                {/* Preview Chart */}
                                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Xem trước hình dạng chuỗi nhu cầu (30 ngày đầu)
                                        </span>
                                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                            Dữ liệu minh họa
                                        </span>
                                    </div>

                                    <div className="h-44 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={previewSeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="previewColor" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                                                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} />
                                                <YAxis tick={{ fontSize: 10 }} />
                                                <Tooltip
                                                    contentStyle={{
                                                        borderRadius: '8px',
                                                        fontSize: '11px',
                                                    }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="demand"
                                                    name="Số lượng dự kiến (Dữ liệu minh họa)"
                                                    stroke="#0284c7"
                                                    fillOpacity={1}
                                                    fill="url(#previewColor)"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-xs hover:bg-sky-700 disabled:opacity-50"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Đang tạo kịch bản & sinh hóa đơn...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-4 w-4" />
                                                Sinh tập dữ liệu Sandbox
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Deletion Dialog (Requires typing exact dataset name) */}
            {datasetToDelete && (
                <div
                    className="fixed inset-0 z-50 overflow-y-auto"
                    aria-labelledby="delete-dialog-title"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="flex min-h-screen items-center justify-center p-4 text-center">
                        <div
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
                            onClick={() => {
                                if (!isDeleting) {
                                    setDatasetToDelete(null);
                                    setDeleteError(null);
                                }
                            }}
                            aria-hidden="true"
                        />

                        <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                                <AlertTriangle className="h-6 w-6" />
                                <h3
                                    id="delete-dialog-title"
                                    className="font-display text-lg font-bold text-slate-900 dark:text-white"
                                >
                                    Xác nhận xóa tập dữ liệu Sandbox
                                </h3>
                            </div>

                            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                Hành động này sẽ xóa vĩnh viễn tập dữ liệu cùng toàn bộ hóa đơn mô phỏng liên quan.
                                Để xác nhận, vui lòng nhập chính xác tên tập dữ liệu:
                            </p>

                            <div className="mt-2 rounded-lg bg-slate-100 p-2 font-mono text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                {datasetToDelete.name}
                            </div>

                            <input
                                type="text"
                                value={deleteConfirmationInput}
                                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                                placeholder="Nhập tên tập dữ liệu tại đây..."
                                className="mt-3 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                            />

                            {deleteError && (
                                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                                    {deleteError}
                                </div>
                            )}

                            <div className="mt-5 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => {
                                        setDatasetToDelete(null);
                                        setDeleteError(null);
                                    }}
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300"
                                >
                                    Hủy bỏ
                                </button>

                                <button
                                    type="button"
                                    disabled={
                                        isDeleting ||
                                        deleteConfirmationInput.trim() !== datasetToDelete.name
                                    }
                                    onClick={handleDeleteDataset}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {isDeleting ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                    Xác nhận Xóa vĩnh viễn
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
