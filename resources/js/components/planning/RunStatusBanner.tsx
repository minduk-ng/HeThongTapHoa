import { usePage, router } from '@inertiajs/react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Database,
    Loader2,
    Play,
    RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import type { PageProps } from '../../types/auth';
import {
    formatDateTime,
    formatDate,
    formatRunStatusLabel,
    formatSourceLabel,
    isRunStale,
} from './planningFormatters';

export interface ForecastRunSummary {
    id?: number;
    kind?: string;
    horizon_days?: number;
    data_cutoff?: string | null;
    status?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    error_message?: string | null;
    is_active?: boolean;
    synthetic_dataset_id?: number | null;
    synthetic_dataset?: { id?: number; name?: string } | null;
    syntheticDataset?: { id?: number; name?: string } | null;
}

interface RunStatusBannerProps {
    sourceDatasetId?: number | null;
    latestRunStatus?: string | null;
    run?: ForecastRunSummary | null;
    sourceDatasetName?: string | null;
    defaultHorizon?: number;
    className?: string;
}

export default function RunStatusBanner({
    sourceDatasetId,
    latestRunStatus,
    run,
    sourceDatasetName,
    defaultHorizon = 7,
    className = '',
}: RunStatusBannerProps) {
    const { auth } = usePage<PageProps>().props;
    const canRun = Boolean(
        auth?.is_admin || auth?.permissions?.includes('planning.run'),
    );
    const { isSubmitting, guard } = useSubmitGuard();
    const [horizonDays, setHorizonDays] = useState<number>(
        run?.horizon_days || defaultHorizon,
    );

    const status = run?.status ?? latestRunStatus;
    const isRunning = status === 'running';
    const isQueued = status === 'queued';
    const isFailed = status === 'failed';
    const isCompleted = run?.status === 'completed';
    const isEmpty = !run || !run.id;
    const isStaleRun = Boolean(
        !isEmpty &&
        (run.status === 'stale' ||
            (isCompleted &&
                isRunStale(run.completed_at || run.data_cutoff, 24))),
    );

    const datasetId = sourceDatasetId ?? run?.synthetic_dataset_id;
    const sourceLabel = formatSourceLabel(
        sourceDatasetName ||
            run?.syntheticDataset?.name ||
            run?.synthetic_dataset?.name ||
            (datasetId != null ? { id: datasetId } : null),
    );

    const handleTriggerRun = () => {
        if (!canRun || isSubmitting || isRunning || isQueued) {
            return;
        }

        // ponytail: submit guard paired with 8-second safety timeout
        guard(async () => {
            return new Promise<void>((resolve) => {
                let resolved = false;
                const timer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                }, 8000);

                router.post(
                    '/planning/runs',
                    {
                        horizon_days: horizonDays,
                        synthetic_dataset_id:
                            sourceDatasetId ??
                            run?.synthetic_dataset_id ??
                            null,
                    },
                    {
                        preserveScroll: true,
                        onFinish: () => {
                            if (!resolved) {
                                resolved = true;
                                clearTimeout(timer);
                                resolve();
                            }
                        },
                        onError: () => {
                            if (!resolved) {
                                resolved = true;
                                clearTimeout(timer);
                                resolve();
                            }
                        },
                    },
                );
            });
        });
    };

    // 1. EMPTY STATE
    if (isEmpty && !isRunning && !isQueued && !isFailed) {
        return (
            <div
                className={`planning-ui rounded-2xl border border-dashed border-slate-300 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800/80 ${className}`}
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3.5">
                        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
                            <Clock className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                    {formatRunStatusLabel('empty')}
                                </span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    Nguồn:{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                        {sourceLabel}
                                    </span>
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                Hệ thống chưa có lượt dự báo nào đang hoạt động.
                                Hãy chạy tính toán dự báo ban đầu để tạo kế
                                hoạch.
                            </p>
                        </div>
                    </div>

                    {canRun && (
                        <div className="flex items-center gap-2.5 sm:self-center">
                            <select
                                value={horizonDays}
                                aria-label="Kỳ dự báo"
                                onChange={(e) =>
                                    setHorizonDays(Number(e.target.value))
                                }
                                disabled={isSubmitting}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value={7}>7 ngày</option>
                                <option value={14}>14 ngày</option>
                                <option value={30}>30 ngày</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleTriggerRun}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                <span>Khởi tạo dự báo</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 2. QUEUED / RUNNING STATE
    if (isRunning || isQueued) {
        return (
            <div
                className={`planning-ui rounded-2xl border border-sky-200 bg-sky-50/70 p-5 shadow-xs dark:border-sky-800/70 dark:bg-sky-950/40 ${className}`}
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3.5">
                        <div className="rounded-xl bg-sky-100 p-2.5 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
                            {isRunning ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <Clock className="h-5 w-5" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-900/80 dark:text-sky-200">
                                    <Activity className="h-3 w-3 animate-pulse" />
                                    {formatRunStatusLabel(status)}
                                </span>
                                <span className="text-xs text-sky-700 dark:text-sky-300">
                                    {run?.id
                                        ? `Lượt #${run.id}`
                                        : 'Lượt mới nhất'}
                                    {run?.horizon_days != null &&
                                        ` • Kỳ dự báo ${run.horizon_days} ngày`}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-sky-900 dark:text-sky-100">
                                {isRunning
                                    ? 'Đang tiến hành chạy mô hình dự báo và tối ưu mức tồn kho an toàn...'
                                    : 'Lượt tính toán đã được xếp hàng và sẽ bắt đầu trong giây lát...'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-sky-700 dark:text-sky-300">
                        <Database className="h-4 w-4" />
                        <span>
                            Nguồn: <strong>{sourceLabel}</strong>
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // 3. FAILED STATE
    if (isFailed) {
        return (
            <div
                className={`planning-ui rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-xs dark:border-rose-800/70 dark:bg-rose-950/40 ${className}`}
            >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3.5">
                        <div className="rounded-xl bg-rose-100 p-2.5 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/80 dark:text-rose-200">
                                    {formatRunStatusLabel('failed')}
                                </span>
                                <span className="text-xs text-rose-700 dark:text-rose-300">
                                    {run?.id
                                        ? `Lượt #${run.id}`
                                        : 'Lượt mới nhất'}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-rose-900 dark:text-rose-100">
                                {run?.error_message ||
                                    'Có lỗi xảy ra trong quá trình tính toán lượt dự báo.'}
                            </p>
                        </div>
                    </div>

                    {canRun && (
                        <button
                            type="button"
                            onClick={handleTriggerRun}
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4" />
                            )}
                            <span>Thử lại</span>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (!run) {
        return null;
    }

    // 4. COMPLETED OR STALE STATE
    return (
        <div
            className={`planning-ui rounded-2xl border bg-white p-5 shadow-xs transition-colors dark:bg-slate-800/90 ${
                isStaleRun
                    ? 'border-amber-200 bg-amber-50/30 dark:border-amber-800/70 dark:bg-amber-950/20'
                    : 'border-slate-200 dark:border-slate-700'
            } ${className}`}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3.5">
                    <div
                        className={`rounded-xl p-2.5 ${
                            isStaleRun
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                        }`}
                    >
                        {isStaleRun ? (
                            <AlertTriangle className="h-5 w-5" />
                        ) : (
                            <CheckCircle2 className="h-5 w-5" />
                        )}
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                                    isStaleRun
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-200'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-200'
                                }`}
                            >
                                {isStaleRun
                                    ? formatRunStatusLabel('stale')
                                    : formatRunStatusLabel('completed')}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Lượt{' '}
                                <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">
                                    #{run.id}
                                </span>
                            </span>
                            <span className="text-slate-300 dark:text-slate-600">
                                •
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Nguồn:{' '}
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                    {sourceLabel}
                                </span>
                            </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                            {latestRunStatus &&
                                latestRunStatus !== run.status && (
                                    <span>
                                        Lượt mới nhất:{' '}
                                        {formatRunStatusLabel(latestRunStatus)}.
                                        Đang giữ kết quả của lượt #{run.id}.
                                    </span>
                                )}
                            <span>
                                Điểm cắt dữ liệu (Cutoff):{' '}
                                <strong className="text-slate-800 tabular-nums dark:text-slate-200">
                                    {formatDate(run.data_cutoff)}
                                </strong>
                            </span>
                            <span>
                                Chạy lúc:{' '}
                                <strong className="text-slate-800 tabular-nums dark:text-slate-200">
                                    {formatDateTime(
                                        run.completed_at || run.started_at,
                                    )}
                                </strong>
                            </span>
                            <span>
                                Kỳ dự báo:{' '}
                                <strong className="text-slate-800 tabular-nums dark:text-slate-200">
                                    {run.horizon_days ?? 7} ngày
                                </strong>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 sm:self-end lg:self-center">
                    {canRun && (
                        <>
                            <select
                                value={horizonDays}
                                onChange={(e) =>
                                    setHorizonDays(Number(e.target.value))
                                }
                                disabled={isSubmitting}
                                aria-label="Chọn kỳ dự báo"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value={7}>7 ngày</option>
                                <option value={14}>14 ngày</option>
                                <option value={30}>30 ngày</option>
                            </select>

                            <button
                                type="button"
                                onClick={handleTriggerRun}
                                disabled={isSubmitting}
                                title="Chạy lại mô hình dự báo"
                                className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                                <span>
                                    {isStaleRun
                                        ? 'Tính lại ngay'
                                        : 'Chạy lại dự báo'}
                                </span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
