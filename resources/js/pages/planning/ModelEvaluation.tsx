import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    BarChart2,
    CheckCircle2,
    Cpu,
    History,
    Info,
    Play,
    Settings,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import ModelMetricChart from '../../components/planning/ModelMetricChart';
import type { MetricType, ModelMetricPoint } from '../../components/planning/ModelMetricChart';
import {
    formatDate,
    formatDateTime,
    formatQuantity,
    formatRunStatusLabel,
    formatWape,
    MODEL_NAMES,
} from '../../components/planning/planningFormatters';
import RunStatusBanner from '../../components/planning/RunStatusBanner';
import type { ForecastRunSummary } from '../../components/planning/RunStatusBanner';
import DashboardLayout from '../../layouts/DashboardLayout';

interface EvaluationRunSummary {
    id: number;
    kind: string;
    horizon_days: number;
    data_cutoff: string | null;
    status: string;
    created_at: string;
    configuration?: Record<string, unknown> | null;
}

interface MethodologyData {
    initial_training_window: number;
    horizon: number;
    origin_step: number;
    origins_count: number;
    origins_min: number;
    primary_metric: string;
    tie_break_wape_threshold: number;
    snapshot_id: string;
    config_id: string;
    data_cutoff?: string | null;
    formulas: {
        mae: string;
        rmse: string;
        wape: string;
    };
    limitations: string[];
}

interface ModelEvaluationProps {
    activeRun?: ForecastRunSummary | null;
    evaluations?: unknown[];
    candidates?: string[];
    candidate_keys?: string[];
    metrics?: string[];
    modelComparison?: ModelMetricPoint[];
    recentRuns?: EvaluationRunSummary[];
    methodology?: MethodologyData;
    filters?: { synthetic_dataset_id?: number | null };
    can_apply_model?: boolean;
}

type TabType = 'performance' | 'history' | 'config';

export default function ModelEvaluation({
    activeRun,
    candidate_keys = [
        'sma_7',
        'sma_14',
        'sma_28',
        'holt_winters_additive',
        'holt_winters_multiplicative',
    ],
    modelComparison = [],
    recentRuns = [],
    methodology = {
        initial_training_window: 56,
        horizon: 7,
        origin_step: 7,
        origins_count: 8,
        origins_min: 3,
        primary_metric: 'wape',
        tie_break_wape_threshold: 0.5,
        snapshot_id: 'eval-snap-default',
        config_id: 'eval-cfg-v1',
        formulas: {
            mae: 'MAE = (1/n) * \\sum |y_t - \\hat{y}_t|',
            rmse: 'RMSE = \\sqrt{(1/n) * \\sum (y_t - \\hat{y}_t)^2}',
            wape: 'WAPE = (\\sum |y_t - \\hat{y}_t| / \\sum y_t) * 100%',
        },
        limitations: [
            'Yêu cầu tối thiểu 14 ngày dữ liệu cho SMA và 56 ngày cho Holt-Winters để đảm bảo độ tin cậy.',
            'Sản phẩm mới bán hoặc có chuỗi bán gián đoạn tự động chuyển về mô hình mặc định SMA (7 ngày).',
            'Biến động đột ngột từ các đợt khuyến mãi hoặc lễ tết chưa phản ánh đầy đủ trong mô hình chuỗi thời gian đơn thuần.',
        ],
    },
    filters = {},
    can_apply_model = false,
}: ModelEvaluationProps) {
    const [activeTab, setActiveTab] = useState<TabType>('performance');
    const [selectedMetric, setSelectedMetric] = useState<MetricType>('wape');
    const [isTriggeringRun, setIsTriggeringRun] = useState(false);

    // Dialog state for model application
    const [targetModelKey, setTargetModelKey] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isSubmittingApply, setIsSubmittingApply] = useState(false);

    // Determine the best/winning candidate or currently selected model
    const winningCandidate =
        [...modelComparison].sort(
            (a, b) =>
                ((b.selected_count ?? 0) - (a.selected_count ?? 0)) ||
                ((a.avg_wape ?? 999) - (b.avg_wape ?? 999))
        )[0] || null;

    const handleOpenConfirm = (modelKey: string) => {
        if (!can_apply_model) {
            return;
        }

        setTargetModelKey(modelKey);
        setIsConfirmOpen(true);
    };

    const handleConfirmApply = () => {
        if (!targetModelKey || !can_apply_model) {
            return;
        }

        setIsSubmittingApply(true);
        router.post(
            '/planning/models/apply',
            {
                model_key: targetModelKey,
                forecast_run_id: activeRun?.id,
            },
            {
                preserveScroll: true,
                onFinish: () => {
                    setIsSubmittingApply(false);
                    setIsConfirmOpen(false);
                },
            }
        );
    };

    const handleRunEvaluation = () => {
        setIsTriggeringRun(true);
        router.post(
            '/planning/evaluation/runs',
            {
                horizon_days: 7,
                synthetic_dataset_id: filters.synthetic_dataset_id,
            },
            {
                preserveScroll: true,
                onFinish: () => setIsTriggeringRun(false),
            }
        );
    };

    return (
        <DashboardLayout>
            <Head title="Đánh giá mô hình dự báo" />

            <div className="space-y-6 pb-12">
                {/* 1. Page Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            Đánh giá mô hình dự báo
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Kiểm thử Rolling Origin Cross-Validation và so sánh độ chính xác của 5 mô hình dự báo.
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
                            href="/planning/products"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
                        >
                            <span>Dự báo sản phẩm</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <button
                            type="button"
                            onClick={handleRunEvaluation}
                            disabled={isTriggeringRun}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-purple-700 transition disabled:opacity-50"
                        >
                            <Play className="h-3.5 w-3.5" />
                            <span>{isTriggeringRun ? 'Đang kích hoạt...' : 'Chạy đánh giá mới'}</span>
                        </button>
                    </div>
                </div>

                {/* 2. Run Status Banner */}
                <RunStatusBanner run={activeRun} />

                {/* 3. Navigation Tabs - Only active tab is rendered */}
                <div className="border-b border-slate-200 dark:border-slate-800">
                    <nav className="flex space-x-6" aria-label="Tabs">
                        <button
                            type="button"
                            onClick={() => setActiveTab('performance')}
                            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors ${
                                activeTab === 'performance'
                                    ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            <BarChart2 className="h-4 w-4" />
                            <span>Hiệu năng mô hình (Performance)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors ${
                                activeTab === 'history'
                                    ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            <History className="h-4 w-4" />
                            <span>Lịch sử đánh giá (History)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('config')}
                            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors ${
                                activeTab === 'config'
                                    ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                            <Settings className="h-4 w-4" />
                            <span>Cấu hình & Phương pháp luận (Config)</span>
                        </button>
                    </nav>
                </div>

                {/* TAB 1: PERFORMANCE (Only rendered when activeTab === 'performance') */}
                {activeTab === 'performance' && (
                    <div className="space-y-6">
                        {/* Primary CTA Bar */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-purple-200 bg-purple-50/60 p-4 dark:border-purple-900/60 dark:bg-purple-950/30">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-purple-600/10 p-2.5 text-purple-600 dark:bg-purple-400/10 dark:text-purple-400">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                        Mô hình khuyến nghị tối ưu:{' '}
                                        <span className="text-purple-600 dark:text-purple-400">
                                            {winningCandidate ? winningCandidate.name : 'Chưa xác định'}
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Đạt WAPE thấp nhất qua kiểm thử Rolling Origin. Áp dụng mô hình này sẽ cập nhật chiến lược dự báo toàn cửa hàng.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                disabled={!can_apply_model || !winningCandidate}
                                onClick={() => winningCandidate && handleOpenConfirm(winningCandidate.model_key)}
                                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                title={
                                    !can_apply_model
                                        ? 'Yêu cầu quyền planning.apply_model để thực hiện thao tác này'
                                        : 'Áp dụng mô hình khuyến nghị'
                                }
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                <span>Áp dụng mô hình được chọn</span>
                            </button>
                        </div>

                        {/* Metric Selector & Chart Card */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                                        So sánh sai số giữa 5 mô hình ứng viên
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Đánh giá trên toàn bộ mặt hàng qua 8 mốc thời gian rolling origins.
                                    </p>
                                </div>

                                {/* Metric Selector */}
                                <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMetric('wape')}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                            selectedMetric === 'wape'
                                                ? 'bg-white text-purple-700 shadow-2xs dark:bg-slate-700 dark:text-purple-300'
                                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        WAPE (Chuẩn)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMetric('mae')}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                            selectedMetric === 'mae'
                                                ? 'bg-white text-purple-700 shadow-2xs dark:bg-slate-700 dark:text-purple-300'
                                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        MAE
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedMetric('rmse')}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                            selectedMetric === 'rmse'
                                                ? 'bg-white text-purple-700 shadow-2xs dark:bg-slate-700 dark:text-purple-300'
                                                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        RMSE
                                    </button>
                                </div>
                            </div>

                            {/* Recharts Component */}
                            <div className="pt-2">
                                <ModelMetricChart
                                    data={modelComparison}
                                    metric={selectedMetric}
                                    height={280}
                                />
                            </div>
                        </div>

                        {/* Comparison Table containing 5 approved candidate models */}
                        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between dark:border-slate-800">
                                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <Cpu className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                    Bảng so sánh 5 mô hình ứng viên
                                </h3>
                                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                    {candidate_keys.length} mô hình đã kiểm thử
                                </span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                        <tr>
                                            <th className="px-6 py-3 font-semibold">Mô hình dự báo</th>
                                            <th className="px-4 py-3 font-semibold">Tham số cấu hình</th>
                                            <th className="px-4 py-3 font-semibold text-right">MAE trung bình</th>
                                            <th className="px-4 py-3 font-semibold text-right">RMSE trung bình</th>
                                            <th className="px-4 py-3 font-semibold text-right">WAPE trung bình</th>
                                            <th className="px-4 py-3 font-semibold text-center">Số mốc kiểm thử</th>
                                            <th className="px-4 py-3 font-semibold text-center">Trạng thái</th>
                                            <th className="px-6 py-3 font-semibold text-center">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {modelComparison.map((m) => {
                                            const isCurrentSelected = m.is_selected;

                                            return (
                                                <tr
                                                    key={m.model_key}
                                                    className={`transition-colors ${
                                                        isCurrentSelected
                                                            ? 'bg-purple-50/50 dark:bg-purple-950/20'
                                                            : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                                                    }`}
                                                >
                                                    <td className="px-6 py-3.5">
                                                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                            {m.name}
                                                        </div>
                                                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                                                            {m.model_key}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                                                        {m.model_key === 'sma_7' && 'window: 7'}
                                                        {m.model_key === 'sma_14' && 'window: 14'}
                                                        {m.model_key === 'sma_28' && 'window: 28'}
                                                        {m.model_key === 'holt_winters_additive' && 'season: 7, add'}
                                                        {m.model_key === 'holt_winters_multiplicative' && 'season: 7, mul'}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                                                        {formatQuantity(m.avg_mae, 3)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                                                        {formatQuantity(m.avg_rmse, 3)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-bold text-purple-700 dark:text-purple-300 tabular-nums">
                                                        {formatWape(m.avg_wape)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center text-slate-600 dark:text-slate-400 tabular-nums">
                                                        {m.origins_count || 8} mốc
                                                    </td>
                                                    <td className="px-4 py-3.5 text-center">
                                                        {isCurrentSelected ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                <span>Đang áp dụng</span>
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                                Ứng viên
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3.5 text-center">
                                                        <button
                                                            type="button"
                                                            disabled={!can_apply_model || isCurrentSelected}
                                                            onClick={() => handleOpenConfirm(m.model_key)}
                                                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                                                                isCurrentSelected
                                                                    ? 'opacity-40 cursor-not-allowed text-slate-400'
                                                                    : 'border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900/60'
                                                            }`}
                                                            title={
                                                                !can_apply_model
                                                                    ? 'Yêu cầu quyền planning.apply_model'
                                                                    : isCurrentSelected
                                                                    ? 'Mô hình này đang được áp dụng'
                                                                    : 'Áp dụng mô hình này'
                                                            }
                                                        >
                                                            <span>Áp dụng</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: HISTORY (Only rendered when activeTab === 'history') */}
                {activeTab === 'history' && (
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between dark:border-slate-800">
                                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <History className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                    Lịch sử các đợt đánh giá mô hình
                                </h3>
                                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                    {recentRuns.length} lượt gần nhất
                                </span>
                            </div>

                            {recentRuns.length === 0 ? (
                                <div className="py-12 text-center text-xs text-slate-400">
                                    Chưa có dữ liệu lịch sử đánh giá mô hình
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                            <tr>
                                                <th className="px-6 py-3 font-semibold">Mã lượt</th>
                                                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                                                <th className="px-4 py-3 font-semibold">Chu kỳ dự báo</th>
                                                <th className="px-4 py-3 font-semibold">Ngày chốt dữ liệu</th>
                                                <th className="px-4 py-3 font-semibold">Thời gian tạo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                            {recentRuns.map((r) => (
                                                <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                    <td className="px-6 py-3 font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                                                        #{r.id}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                                r.status === 'completed'
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                                    : r.status === 'running'
                                                                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                                                                    : r.status === 'failed'
                                                                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                                            }`}
                                                        >
                                                            <span>{formatRunStatusLabel(r.status)}</span>
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">
                                                        {r.horizon_days} ngày
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">
                                                        {formatDate(r.data_cutoff)}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums">
                                                        {formatDateTime(r.created_at)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 3: CONFIG & METHODOLOGY (Only rendered when activeTab === 'config') */}
                {activeTab === 'config' && (
                    <div className="space-y-6">
                        {/* Rolling Origin CV Configuration */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                Tham số kiểm thử Rolling Origin Cross-Validation
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Cửa sổ huấn luyện ban đầu:</span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                        {methodology.initial_training_window} ngày
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">Initial training window</span>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Chu kỳ dự báo kiểm thử:</span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                        {methodology.horizon} ngày
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">Evaluation horizon</span>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Bước trượt mốc đánh giá:</span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                        {methodology.origin_step} ngày
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">Origin rolling step</span>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Số mốc đánh giá chuẩn:</span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                        {methodology.origins_count} mốc
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">Tối thiểu {methodology.origins_min} mốc</span>
                                </div>
                            </div>

                            {/* Identifiers */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-100 dark:border-slate-800">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Snapshot ID:</span>
                                    <div className="font-mono font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                                        {methodology.snapshot_id}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Config ID:</span>
                                    <div className="font-mono font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                                        {methodology.config_id}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Cutoff Timestamp:</span>
                                    <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 tabular-nums">
                                        {methodology.data_cutoff ? formatDateTime(methodology.data_cutoff) : 'Theo lượt hiện hành'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mathematical Formulas */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <Info className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                                Công thức tính các chỉ số đo lường sai số
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                        WAPE (Độ lệch trọng số) - Chuẩn lựa chọn
                                    </h4>
                                    <div className="mt-2 rounded-lg bg-white p-3 font-mono text-[11px] text-purple-700 dark:bg-slate-900 dark:text-purple-300 border border-slate-200 dark:border-slate-800">
                                        {methodology.formulas.wape}
                                    </div>
                                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Tránh lỗi chia cho 0 khi ngày bán bằng 0, phản ánh chính xác quy mô sai lệch so với tổng nhu cầu thực tế.
                                    </p>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                        MAE (Sai số tuyệt đối trung bình)
                                    </h4>
                                    <div className="mt-2 rounded-lg bg-white p-3 font-mono text-[11px] text-slate-800 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                                        {methodology.formulas.mae}
                                    </div>
                                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Đo độ lệch tuyệt đối bình quân mỗi ngày, dùng làm tiêu chí phụ phân xử hòa (tie-breaker) khi chênh lệch WAPE &lt; 0.5%.
                                    </p>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                        RMSE (Căn bậc hai sai số bình phương)
                                    </h4>
                                    <div className="mt-2 rounded-lg bg-white p-3 font-mono text-[11px] text-slate-800 dark:bg-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                                        {methodology.formulas.rmse}
                                    </div>
                                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                        Phạt nặng các sai số đột biến lớn so với các sai số nhỏ, giúp phát hiện mô hình bất ổn định.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Limitations Disclosure */}
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-900/60 dark:bg-amber-950/20 space-y-3">
                            <h3 className="font-display text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                Giới hạn của phương pháp & Mô hình
                            </h3>
                            <ul className="list-disc list-inside space-y-1.5 text-xs text-amber-900/80 dark:text-amber-300/80">
                                {methodology.limitations.map((lim, idx) => (
                                    <li key={idx} className="leading-relaxed">
                                        {lim}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirmation Modal for Applying Selected Model */}
            {isConfirmOpen && targetModelKey && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-modal-title"
                >
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-purple-100 p-2.5 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <h3
                                    id="confirm-modal-title"
                                    className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                                >
                                    Xác nhận áp dụng mô hình
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Thao tác này yêu cầu quyền quản trị quy trình dự báo.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 space-y-1">
                            <p>
                                Bạn có chắc chắn muốn áp dụng mô hình{' '}
                                <strong className="font-semibold text-purple-600 dark:text-purple-400">
                                    {MODEL_NAMES[targetModelKey] || targetModelKey}
                                </strong>{' '}
                                cho toàn bộ hệ thống dự báo nhu cầu không?
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                                * Lượt chạy dự báo định kỳ tiếp theo sẽ sử dụng mô hình này để tính toán lượng dự báo cho các mặt hàng đủ điều kiện.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsConfirmOpen(false)}
                                disabled={isSubmittingApply}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmApply}
                                disabled={isSubmittingApply}
                                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-700 transition disabled:opacity-50"
                            >
                                {isSubmittingApply ? 'Đang lưu...' : 'Xác nhận áp dụng'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
