import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    CheckCircle2,
    Cpu,
    History,
    Info,
    Play,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import ModelMetricChart from '../../components/planning/ModelMetricChart';
import type {
    MetricType,
    ModelMetricPoint,
} from '../../components/planning/ModelMetricChart';
import { recommendedModelKeys } from '../../components/planning/modelRecommendation';
import PlanningDialog from '../../components/planning/PlanningDialog';
import {
    formatDate,
    formatDateTime,
    formatQuantity,
    formatRunStatusLabel,
    formatWape,
    MODEL_NAMES,
} from '../../components/planning/planningFormatters';
import PlanningTabs from '../../components/planning/PlanningTabs';
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
    holdoutComparison?: ModelMetricPoint[];
    selectedHorizon?: number;
    recentRuns?: EvaluationRunSummary[];
    methodology?: MethodologyData;
    filters?: { synthetic_dataset_id?: number | null };
    can_apply_model?: boolean;
}

type TabType = 'performance' | 'history' | 'config';
type StageType = 'validation' | 'holdout';

export default function ModelEvaluation({
    activeRun,
    candidate_keys = [
        'naive',
        'seasonal_naive_7',
        'sma_7',
        'sma_14',
        'sma_28',
        'holt_winters_additive',
        'holt_winters_multiplicative',
    ],
    modelComparison = [],
    holdoutComparison = [],
    selectedHorizon = 7,
    recentRuns = [],
    methodology = {
        initial_training_window: 56,
        horizon: 7,
        origin_step: 7,
        origins_count: 8,
        origins_min: 3,
        primary_metric: 'wape',
        tie_break_wape_threshold: 0,
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
    const [evaluationStage, setEvaluationStage] =
        useState<StageType>('validation');
    const [selectedMetric, setSelectedMetric] = useState<MetricType>('wape');
    const [horizon, setHorizon] = useState<number>(
        selectedHorizon || activeRun?.horizon_days || 7,
    );
    const [isTriggeringRun, setIsTriggeringRun] = useState(false);

    // Dialog state for model application
    const [targetModelKey, setTargetModelKey] = useState<string | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isSubmittingApply, setIsSubmittingApply] = useState(false);

    const recommendedKeys = recommendedModelKeys(modelComparison);
    const recommendedCandidates = modelComparison.filter((row) =>
        recommendedKeys.includes(row.model_key),
    );
    const primaryCandidate = recommendedCandidates[0];
    const contextQuery = new URLSearchParams({
        horizon_days: String(activeRun?.horizon_days || horizon),
    });

    if (filters.synthetic_dataset_id != null) {
        contextQuery.set(
            'synthetic_dataset_id',
            String(filters.synthetic_dataset_id),
        );
    }

    const handleHorizonChange = (newHorizon: number) => {
        setHorizon(newHorizon);
        router.get(
            '/planning/evaluation',
            {
                horizon_days: newHorizon,
                synthetic_dataset_id: filters.synthetic_dataset_id,
            },
            { preserveState: true, preserveScroll: true },
        );
    };

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
            },
        );
    };

    const handleRunEvaluation = () => {
        setIsTriggeringRun(true);
        router.post(
            '/planning/evaluation/runs',
            {
                horizon_days: horizon,
                synthetic_dataset_id: filters.synthetic_dataset_id,
            },
            {
                preserveScroll: true,
                onFinish: () => setIsTriggeringRun(false),
            },
        );
    };

    return (
        <DashboardLayout>
            <Head title="Đánh giá mô hình dự báo" />

            <div className="planning-ui space-y-6 pb-12">
                {/* 1. Page Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            Đánh giá mô hình dự báo
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Kiểm thử Rolling Origin Cross-Validation và so sánh
                            độ chính xác của 7 mô hình ứng viên.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Horizon Switcher */}
                        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-xs dark:border-slate-800 dark:bg-slate-900">
                            <span className="inline-flex items-center gap-1 px-2 font-medium text-slate-500 dark:text-slate-400">
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                <span>Kỳ dự báo:</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => handleHorizonChange(7)}
                                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                                    horizon === 7
                                        ? 'bg-sky-700 text-white shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                7 ngày
                            </button>
                            <button
                                type="button"
                                onClick={() => handleHorizonChange(30)}
                                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                                    horizon === 30
                                        ? 'bg-sky-700 text-white shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                30 ngày
                            </button>
                        </div>

                        <Link
                            href={`/planning?${contextQuery}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
                        >
                            <span>Tổng quan</span>
                        </Link>
                        <Link
                            href={`/planning/products?${contextQuery}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
                        >
                            <span>Dự báo sản phẩm</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <button
                            type="button"
                            onClick={handleRunEvaluation}
                            disabled={isTriggeringRun}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-3.5 py-2 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-sky-800 disabled:opacity-50"
                        >
                            <Play className="h-3.5 w-3.5" />
                            <span>
                                {isTriggeringRun
                                    ? 'Đang kích hoạt...'
                                    : `Chạy đánh giá mới (${horizon} ngày)`}
                            </span>
                        </button>
                    </div>
                </div>

                {/* 2. Run Status Banner */}
                <RunStatusBanner run={activeRun} />

                {/* 3. Navigation Tabs - Only active tab is rendered */}
                <PlanningTabs
                    id="model-eval-tabs"
                    label="Nội dung đánh giá"
                    options={[
                        { value: 'performance', label: 'Hiệu năng' },
                        { value: 'history', label: 'Lịch sử' },
                        { value: 'config', label: 'Phương pháp' },
                    ]}
                    value={activeTab}
                    onChange={setActiveTab}
                />

                {/* TAB 1: PERFORMANCE (Only rendered when activeTab === 'performance') */}
                {activeTab === 'performance' && (
                    <div
                        id="model-eval-tabs-panel-performance"
                        role="tabpanel"
                        aria-labelledby="model-eval-tabs-tab-performance"
                        tabIndex={0}
                        className="space-y-6 focus-visible:outline-none"
                    >
                        {/* Evaluation Stage Selector */}
                        <PlanningTabs
                            id="model-eval-stage"
                            label="Giai đoạn đánh giá"
                            options={[
                                { value: 'validation', label: 'Tập lựa chọn' },
                                {
                                    value: 'holdout',
                                    label: 'Tập kiểm tra cuối',
                                },
                            ]}
                            value={evaluationStage}
                            onChange={setEvaluationStage}
                        />

                        {evaluationStage === 'validation' ? (
                            <div
                                id="model-eval-stage-panel-validation"
                                role="tabpanel"
                                aria-labelledby="model-eval-stage-tab-validation"
                                tabIndex={0}
                                className="space-y-6 focus-visible:outline-none"
                            >
                                {/* Primary CTA Bar */}
                                <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 sm:flex-row sm:items-center dark:border-sky-900/60 dark:bg-sky-950/30">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-xl bg-sky-700/10 p-2.5 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
                                            <Sparkles className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                                {primaryCandidate
                                                    ? 'Mô hình được chọn cho nhiều sản phẩm nhất'
                                                    : 'Chưa có mô hình khuyến nghị'}{' '}
                                                <span className="text-sky-700 dark:text-sky-300">
                                                    {recommendedCandidates
                                                        .map((row) => row.name)
                                                        .join(', ')}
                                                </span>
                                            </h3>
                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                Ưu tiên số sản phẩm được chọn,
                                                khi bằng nhau ưu tiên WAPE thấp
                                                hơn trong các giá trị xác định.
                                            </p>
                                            {primaryCandidate ? (
                                                <>
                                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                        Được chọn cho{' '}
                                                        {
                                                            primaryCandidate.selected_count
                                                        }{' '}
                                                        sản phẩm. WAPE tham
                                                        khảo:{' '}
                                                        {primaryCandidate.avg_wape !==
                                                            null &&
                                                        Number.isFinite(
                                                            primaryCandidate.avg_wape,
                                                        )
                                                            ? formatWape(
                                                                  primaryCandidate.avg_wape,
                                                              )
                                                            : '—'}
                                                        .
                                                    </p>
                                                    {recommendedCandidates.length >
                                                        1 && (
                                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                            Đồng hạng. Nút áp
                                                            dụng chọn mô hình
                                                            đầu tiên trong danh
                                                            sách:{' '}
                                                            {
                                                                primaryCandidate.name
                                                            }
                                                            .
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                    Chưa có sản phẩm được chọn
                                                    hoặc chưa có kết quả đánh
                                                    giá để khuyến nghị mô hình.
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={
                                            !can_apply_model ||
                                            !primaryCandidate
                                        }
                                        onClick={() =>
                                            primaryCandidate &&
                                            handleOpenConfirm(
                                                primaryCandidate.model_key,
                                            )
                                        }
                                        className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        title={
                                            !can_apply_model
                                                ? 'Yêu cầu quyền planning.apply_model để thực hiện thao tác này'
                                                : 'Áp dụng mô hình khuyến nghị'
                                        }
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span>Áp dụng cho toàn cửa hàng</span>
                                    </button>
                                </div>

                                {/* Metric Selector & Chart Card */}
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                                        <div>
                                            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                                                So sánh sai số giữa 7 mô hình
                                                ứng viên (Tập lựa chọn)
                                            </h2>
                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                Đánh giá qua các mốc thời gian
                                                rolling origins trên tập dữ liệu
                                                lịch sử.
                                            </p>
                                        </div>

                                        {/* Metric Selector */}
                                        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                                            <button
                                                type="button"
                                                aria-pressed={
                                                    selectedMetric === 'wape'
                                                }
                                                onClick={() =>
                                                    setSelectedMetric('wape')
                                                }
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    selectedMetric === 'wape'
                                                        ? 'bg-white text-sky-700 shadow-2xs dark:bg-slate-700 dark:text-sky-300'
                                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                                }`}
                                            >
                                                WAPE (Chuẩn)
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={
                                                    selectedMetric === 'mae'
                                                }
                                                onClick={() =>
                                                    setSelectedMetric('mae')
                                                }
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    selectedMetric === 'mae'
                                                        ? 'bg-white text-sky-700 shadow-2xs dark:bg-slate-700 dark:text-sky-300'
                                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                                }`}
                                            >
                                                MAE
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={
                                                    selectedMetric === 'rmse'
                                                }
                                                onClick={() =>
                                                    setSelectedMetric('rmse')
                                                }
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    selectedMetric === 'rmse'
                                                        ? 'bg-white text-sky-700 shadow-2xs dark:bg-slate-700 dark:text-sky-300'
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

                                {/* Comparison Table containing 7 approved candidate models */}
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                                        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            <Cpu className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                            <span>
                                                Bảng so sánh 7 mô hình ứng viên
                                                (Tập lựa chọn)
                                            </span>
                                        </h3>
                                        <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                                            {candidate_keys.length} mô hình ứng
                                            viên
                                        </span>
                                    </div>

                                    <div
                                        role="region"
                                        aria-label="Bảng so sánh 7 mô hình ứng viên (Tập lựa chọn)"
                                        tabIndex={0}
                                        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-600"
                                    >
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                                <tr>
                                                    <th className="px-6 py-3 font-semibold">
                                                        Mô hình dự báo
                                                    </th>
                                                    <th className="px-4 py-3 font-semibold">
                                                        Tham số cấu hình
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-semibold">
                                                        MAE trung bình
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-semibold">
                                                        RMSE trung bình
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-semibold">
                                                        WAPE trung bình
                                                    </th>
                                                    <th className="px-4 py-3 text-center font-semibold">
                                                        Số mốc kiểm thử
                                                    </th>
                                                    <th className="px-4 py-3 text-center font-semibold">
                                                        Trạng thái
                                                    </th>
                                                    <th className="px-6 py-3 text-center font-semibold">
                                                        Thao tác
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                {modelComparison.map((m) => {
                                                    const isCurrentSelected =
                                                        m.is_selected;
                                                    const selectedCount =
                                                        m.selected_count ?? 0;

                                                    return (
                                                        <tr
                                                            key={m.model_key}
                                                            className={`transition-colors ${
                                                                isCurrentSelected
                                                                    ? 'bg-sky-50/50 dark:bg-sky-950/20'
                                                                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                                                            }`}
                                                        >
                                                            <td className="px-6 py-3.5">
                                                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                                    {m.name}
                                                                </div>
                                                                <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                                                    {
                                                                        m.model_key
                                                                    }
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                                                {m.model_key ===
                                                                    'naive' &&
                                                                    'Điểm quan sát cuối'}
                                                                {m.model_key ===
                                                                    'seasonal_naive_7' &&
                                                                    'period: 7'}
                                                                {m.model_key ===
                                                                    'sma_7' &&
                                                                    'window: 7'}
                                                                {m.model_key ===
                                                                    'sma_14' &&
                                                                    'window: 14'}
                                                                {m.model_key ===
                                                                    'sma_28' &&
                                                                    'window: 28'}
                                                                {m.model_key ===
                                                                    'holt_winters_additive' &&
                                                                    'season: 7, add'}
                                                                {m.model_key ===
                                                                    'holt_winters_multiplicative' &&
                                                                    'season: 7, mul'}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-right font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                                                {m.avg_mae !==
                                                                null ? (
                                                                    formatQuantity(
                                                                        m.avg_mae,
                                                                        3,
                                                                    )
                                                                ) : (
                                                                    <span className="font-normal text-slate-400">
                                                                        —
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-right font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                                                {m.avg_rmse !==
                                                                null ? (
                                                                    formatQuantity(
                                                                        m.avg_rmse,
                                                                        3,
                                                                    )
                                                                ) : (
                                                                    <span className="font-normal text-slate-400">
                                                                        —
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-right font-bold text-slate-800 tabular-nums dark:text-slate-200">
                                                                {m.avg_wape !==
                                                                null ? (
                                                                    formatWape(
                                                                        m.avg_wape,
                                                                    )
                                                                ) : (
                                                                    <span className="font-normal text-slate-400">
                                                                        —
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-center text-slate-600 tabular-nums dark:text-slate-400">
                                                                {m.origins_count ??
                                                                    0}{' '}
                                                                mốc
                                                            </td>
                                                            <td className="px-4 py-3.5 text-center">
                                                                {selectedCount >
                                                                0 ? (
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        <span>
                                                                            Được
                                                                            chọn
                                                                            cho{' '}
                                                                            {
                                                                                selectedCount
                                                                            }{' '}
                                                                            sản
                                                                            phẩm
                                                                        </span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                                        Chưa
                                                                        được
                                                                        chọn
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-3.5 text-center">
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        !can_apply_model ||
                                                                        isCurrentSelected
                                                                    }
                                                                    onClick={() =>
                                                                        handleOpenConfirm(
                                                                            m.model_key,
                                                                        )
                                                                    }
                                                                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                                                                        isCurrentSelected
                                                                            ? 'cursor-not-allowed text-slate-400 opacity-40'
                                                                            : 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/60'
                                                                    }`}
                                                                    title={
                                                                        !can_apply_model
                                                                            ? 'Yêu cầu quyền planning.apply_model'
                                                                            : isCurrentSelected
                                                                              ? `Được chọn cho ${selectedCount} sản phẩm`
                                                                              : 'Áp dụng mô hình này'
                                                                    }
                                                                >
                                                                    <span>
                                                                        Áp dụng
                                                                    </span>
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
                        ) : (
                            <div
                                id="model-eval-stage-panel-holdout"
                                role="tabpanel"
                                aria-labelledby="model-eval-stage-tab-holdout"
                                tabIndex={0}
                                className="space-y-6 focus-visible:outline-none"
                            >
                                {/* Holdout Explanatory Banner */}
                                <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 sm:flex-row sm:items-center dark:border-sky-900/60 dark:bg-sky-950/30">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-xl bg-sky-600/10 p-2.5 text-sky-600 dark:bg-sky-400/10 dark:text-sky-400">
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                                Tập kiểm tra cuối độc lập (
                                                {horizon} ngày)
                                            </h3>
                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                Được giữ lại {horizon} ngày cuối
                                                của lịch sử dữ liệu. Mô hình sau
                                                khi lựa chọn trên tập lựa chọn
                                                được huấn luyện lại trên toàn bộ
                                                dữ liệu trước tập kiểm tra cuối
                                                để kiểm chứng độc lập. Tuyệt đối
                                                không dùng kết quả này để chọn
                                                lại mô hình.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-2xs dark:border-sky-800 dark:bg-slate-900 dark:text-sky-300">
                                        <Info className="h-3.5 w-3.5" />
                                        <span>Độc lập kiểm chứng</span>
                                    </div>
                                </div>

                                {/* Metric Selector & Chart Card for Holdout */}
                                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                                        <div>
                                            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                                                So sánh sai số trên tập kiểm tra
                                                cuối
                                            </h2>
                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                Đo lường năng lực khái quát hóa
                                                trên chu kỳ {horizon} ngày độc
                                                lập cuối cùng.
                                            </p>
                                        </div>

                                        {/* Metric Selector */}
                                        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                                            <button
                                                type="button"
                                                aria-pressed={
                                                    selectedMetric === 'wape'
                                                }
                                                onClick={() =>
                                                    setSelectedMetric('wape')
                                                }
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    selectedMetric === 'wape'
                                                        ? 'bg-white text-sky-700 shadow-2xs dark:bg-slate-700 dark:text-sky-300'
                                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                                }`}
                                            >
                                                WAPE (Chuẩn)
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={
                                                    selectedMetric === 'mae'
                                                }
                                                onClick={() =>
                                                    setSelectedMetric('mae')
                                                }
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    selectedMetric === 'mae'
                                                        ? 'bg-white text-sky-700 shadow-2xs dark:bg-slate-700 dark:text-sky-300'
                                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                                }`}
                                            >
                                                MAE
                                            </button>
                                            <button
                                                type="button"
                                                aria-pressed={
                                                    selectedMetric === 'rmse'
                                                }
                                                onClick={() =>
                                                    setSelectedMetric('rmse')
                                                }
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                    selectedMetric === 'rmse'
                                                        ? 'bg-white text-sky-700 shadow-2xs dark:bg-slate-700 dark:text-sky-300'
                                                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                                }`}
                                            >
                                                RMSE
                                            </button>
                                        </div>
                                    </div>

                                    {/* Recharts Component for Holdout */}
                                    <div className="pt-2">
                                        <ModelMetricChart
                                            data={holdoutComparison}
                                            metric={selectedMetric}
                                            height={280}
                                        />
                                    </div>
                                </div>

                                {/* Comparison Table containing candidate models on Holdout */}
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                                        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                            <span>
                                                Bảng kết quả trên tập kiểm tra
                                                cuối
                                            </span>
                                        </h3>
                                        <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                                            Tập kiểm tra cuối: {horizon} ngày
                                            độc lập
                                        </span>
                                    </div>

                                    <div
                                        role="region"
                                        aria-label="Bảng kết quả trên tập kiểm tra cuối"
                                        tabIndex={0}
                                        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-600"
                                    >
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                                <tr>
                                                    <th className="px-6 py-3 font-semibold">
                                                        Mô hình dự báo
                                                    </th>
                                                    <th className="px-4 py-3 font-semibold">
                                                        Tham số cấu hình
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-semibold">
                                                        MAE
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-semibold">
                                                        RMSE
                                                    </th>
                                                    <th className="px-4 py-3 text-right font-semibold">
                                                        WAPE
                                                    </th>
                                                    <th className="px-4 py-3 text-center font-semibold">
                                                        Phạm vi kiểm tra
                                                    </th>
                                                    <th className="px-6 py-3 text-center font-semibold">
                                                        Phân loại
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                {holdoutComparison.map((m) => (
                                                    <tr
                                                        key={m.model_key}
                                                        className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                                                    >
                                                        <td className="px-6 py-3.5">
                                                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                                {m.name}
                                                            </div>
                                                            <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                                                                {m.model_key}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                                            {m.model_key ===
                                                                'naive' &&
                                                                'Điểm quan sát cuối'}
                                                            {m.model_key ===
                                                                'seasonal_naive_7' &&
                                                                'period: 7'}
                                                            {m.model_key ===
                                                                'sma_7' &&
                                                                'window: 7'}
                                                            {m.model_key ===
                                                                'sma_14' &&
                                                                'window: 14'}
                                                            {m.model_key ===
                                                                'sma_28' &&
                                                                'window: 28'}
                                                            {m.model_key ===
                                                                'holt_winters_additive' &&
                                                                'season: 7, add'}
                                                            {m.model_key ===
                                                                'holt_winters_multiplicative' &&
                                                                'season: 7, mul'}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                                            {m.avg_mae !==
                                                            null ? (
                                                                formatQuantity(
                                                                    m.avg_mae,
                                                                    3,
                                                                )
                                                            ) : (
                                                                <span className="font-normal text-slate-400">
                                                                    —
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                                            {m.avg_rmse !==
                                                            null ? (
                                                                formatQuantity(
                                                                    m.avg_rmse,
                                                                    3,
                                                                )
                                                            ) : (
                                                                <span className="font-normal text-slate-400">
                                                                    —
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-bold text-slate-800 tabular-nums dark:text-slate-200">
                                                            {m.avg_wape !==
                                                            null ? (
                                                                formatWape(
                                                                    m.avg_wape,
                                                                )
                                                            ) : (
                                                                <span className="font-normal text-slate-400">
                                                                    —
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-center text-slate-600 tabular-nums dark:text-slate-400">
                                                            {(m.origins_count ??
                                                                0) > 0
                                                                ? `1 mốc (${horizon} ngày)`
                                                                : '0 mốc'}
                                                        </td>
                                                        <td className="px-6 py-3.5 text-center">
                                                            <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                                                                Độc lập — Không
                                                                chọn lại
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: HISTORY (Only rendered when activeTab === 'history') */}
                {activeTab === 'history' && (
                    <div
                        id="model-eval-tabs-panel-history"
                        role="tabpanel"
                        aria-labelledby="model-eval-tabs-tab-history"
                        tabIndex={0}
                        className="space-y-6 focus-visible:outline-none"
                    >
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                                <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    <History className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                    Lịch sử các đợt đánh giá mô hình
                                </h3>
                                <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                                    {recentRuns.length} lượt gần nhất
                                </span>
                            </div>

                            {recentRuns.length === 0 ? (
                                <div className="py-12 text-center text-xs text-slate-400">
                                    Chưa có dữ liệu lịch sử đánh giá mô hình
                                </div>
                            ) : (
                                <div
                                    role="region"
                                    aria-label="Lịch sử các đợt đánh giá mô hình"
                                    tabIndex={0}
                                    className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-sky-600"
                                >
                                    <table className="w-full text-left text-xs">
                                        <thead className="border-b border-slate-200 bg-slate-50/75 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                            <tr>
                                                <th className="px-6 py-3 font-semibold">
                                                    Mã lượt
                                                </th>
                                                <th className="px-4 py-3 font-semibold">
                                                    Trạng thái
                                                </th>
                                                <th className="px-4 py-3 font-semibold">
                                                    Kỳ dự báo
                                                </th>
                                                <th className="px-4 py-3 font-semibold">
                                                    Ngày chốt dữ liệu
                                                </th>
                                                <th className="px-4 py-3 font-semibold">
                                                    Thời gian tạo
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                            {recentRuns.map((r) => (
                                                <tr
                                                    key={r.id}
                                                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                                                >
                                                    <td className="px-6 py-3 font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                                                        #{r.id}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                                r.status ===
                                                                'completed'
                                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                                    : r.status ===
                                                                        'running'
                                                                      ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                                                                      : r.status ===
                                                                          'failed'
                                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                                            }`}
                                                        >
                                                            <span>
                                                                {formatRunStatusLabel(
                                                                    r.status,
                                                                )}
                                                            </span>
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700 tabular-nums dark:text-slate-300">
                                                        {r.horizon_days} ngày
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-700 tabular-nums dark:text-slate-300">
                                                        {formatDate(
                                                            r.data_cutoff,
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 tabular-nums dark:text-slate-400">
                                                        {formatDateTime(
                                                            r.created_at,
                                                        )}
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
                    <div
                        id="model-eval-tabs-panel-config"
                        role="tabpanel"
                        aria-labelledby="model-eval-tabs-tab-config"
                        tabIndex={0}
                        className="space-y-6 focus-visible:outline-none"
                    >
                        {/* Rolling Origin CV Configuration */}
                        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                                <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                Tham số kiểm thử Rolling Origin Cross-Validation
                            </h3>

                            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Cửa sổ huấn luyện ban đầu:
                                    </span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                        {methodology.initial_training_window}{' '}
                                        ngày
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                        Initial training window
                                    </span>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Kỳ dự báo kiểm thử:
                                    </span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                        {methodology.horizon} ngày
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                        Kỳ dự báo dùng để đánh giá
                                    </span>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Bước trượt mốc đánh giá:
                                    </span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                        {methodology.origin_step} ngày
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                        Origin rolling step
                                    </span>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Số mốc đánh giá chuẩn:
                                    </span>
                                    <div className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                        {methodology.origins_count} mốc
                                    </div>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                        Tối thiểu {methodology.origins_min} mốc
                                    </span>
                                </div>
                            </div>

                            {/* Identifiers */}
                            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-2 text-xs sm:grid-cols-3 dark:border-slate-800">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">
                                        Snapshot ID:
                                    </span>
                                    <div className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200">
                                        {methodology.snapshot_id}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">
                                        Config ID:
                                    </span>
                                    <div className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-200">
                                        {methodology.config_id}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">
                                        Cutoff Timestamp:
                                    </span>
                                    <div className="mt-0.5 font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                        {methodology.data_cutoff
                                            ? formatDateTime(
                                                  methodology.data_cutoff,
                                              )
                                            : 'Theo lượt hiện hành'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mathematical Formulas */}
                        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                                <Info className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                                Công thức tính các chỉ số đo lường sai số
                            </h3>

                            <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-3">
                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                        WAPE (Độ lệch trọng số) - Chuẩn lựa chọn
                                    </h4>
                                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                        {methodology.formulas.wape}
                                    </div>
                                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                        Tránh lỗi chia cho 0 khi ngày bán bằng
                                        0, phản ánh chính xác quy mô sai lệch so
                                        với tổng nhu cầu thực tế.
                                    </p>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                        MAE (Sai số tuyệt đối trung bình)
                                    </h4>
                                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                        {methodology.formulas.mae}
                                    </div>
                                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                        Đo độ lệch tuyệt đối bình quân mỗi ngày,
                                        dùng làm tiêu chí phụ phân xử hòa
                                        (tie-breaker) khi chênh lệch WAPE &lt;
                                        0.5%.
                                    </p>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                        RMSE (Căn bậc hai sai số bình phương)
                                    </h4>
                                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                        {methodology.formulas.rmse}
                                    </div>
                                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                        Phạt nặng các sai số đột biến lớn so với
                                        các sai số nhỏ, giúp phát hiện mô hình
                                        bất ổn định.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Limitations Disclosure */}
                        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-900/60 dark:bg-amber-950/20">
                            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-amber-900 dark:text-amber-200">
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                Giới hạn của phương pháp & Mô hình
                            </h3>
                            <ul className="list-inside list-disc space-y-1.5 text-xs text-amber-900/80 dark:text-amber-300/80">
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
                <PlanningDialog
                    open={isConfirmOpen}
                    onClose={() => setIsConfirmOpen(false)}
                    busy={isSubmittingApply}
                    labelledBy="confirm-modal-title"
                >
                    <div className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-sky-100 p-2.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <h3
                                    id="confirm-modal-title"
                                    data-dialog-heading
                                    tabIndex={-1}
                                    className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                                >
                                    Xác nhận áp dụng mô hình
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Thao tác này yêu cầu quyền quản trị quy
                                    trình dự báo.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                            <p>
                                Bạn có chắc chắn muốn áp dụng mô hình{' '}
                                <strong className="font-semibold text-sky-700 dark:text-sky-300">
                                    {MODEL_NAMES[targetModelKey] ||
                                        targetModelKey}
                                </strong>{' '}
                                cho toàn cửa hàng không?
                            </p>
                            <p className="border-t border-slate-200 pt-1 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                Áp dụng cho các mặt hàng đủ điều kiện trong lượt
                                dự báo tiếp theo; không sửa kết quả dự báo lịch
                                sử.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsConfirmOpen(false)}
                                data-dialog-close
                                aria-label="Hủy áp dụng mô hình"
                                disabled={isSubmittingApply}
                                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmApply}
                                disabled={isSubmittingApply}
                                className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-sky-800 disabled:opacity-50"
                            >
                                {isSubmittingApply
                                    ? 'Đang lưu...'
                                    : 'Xác nhận áp dụng'}
                            </button>
                        </div>
                    </div>
                </PlanningDialog>
            )}
        </DashboardLayout>
    );
}
