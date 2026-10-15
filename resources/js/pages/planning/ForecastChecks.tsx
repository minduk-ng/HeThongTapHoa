import { Head, Link } from '@inertiajs/react';
import {
    Activity,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Database,
    Eye,
    FileSpreadsheet,
    FileText,
    History,
    Loader2,
    Play,
    RefreshCw,
} from 'lucide-react';
import { useMemo, useRef, useState, useEffect } from 'react';
import DatePicker from '../../components/DatePicker';
import { checkDateBounds, createCheckSubmission, pollForecastCheck } from '../../components/planning/forecastCheckRequests';
import ForecastCheckResults from '../../components/planning/ForecastCheckResults';
import {
    initialModelKey,
    shiftCheckDate,
} from '../../components/planning/forecastCheckView';
import {
    formatDate,
    formatRunStatusLabel,
} from '../../components/planning/planningFormatters';
import DashboardLayout from '../../layouts/DashboardLayout';
import type {
    ForecastCheckItem,
    SyntheticDatasetOption,
} from '../../types/forecast-check';

interface MenuItemOption {
    id: number;
    name: string;
}

interface PaginationData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    links: Array<{ url: string | null; label: string; active: boolean }>;
}

interface ForecastChecksProps {
    datasets?: SyntheticDatasetOption[];
    menuItems?: MenuItemOption[];
    recentChecks?: PaginationData<ForecastCheckItem>;
    activeCheck?: ForecastCheckItem | null;
    filters?: {
        synthetic_dataset_id?: number | null;
    };
}


export default function ForecastChecks({
    datasets = [],
    menuItems = [],
    recentChecks,
    activeCheck: initialActiveCheck = null,
    filters = {},
}: ForecastChecksProps) {
    const defaultDataset = useMemo(() => {
        if (filters.synthetic_dataset_id) {
            const found = datasets.find((d) => d.id === filters.synthetic_dataset_id);

            if (found) {
                return found;
            }
        }

        return datasets[0] || null;
    }, [datasets, filters.synthetic_dataset_id]);

    const [selectedDatasetId, setSelectedDatasetId] = useState<number | string>(
        defaultDataset ? defaultDataset.id : ''
    );

    const activeDataset = useMemo(() => {
        return datasets.find((d) => d.id === Number(selectedDatasetId)) || null;
    }, [datasets, selectedDatasetId]);

    const datasetMenuItems = useMemo(() => {
        if (!activeDataset || !activeDataset.configuration?.menu_item_ids) {
            return menuItems;
        }

        const allowedIds = new Set(activeDataset.configuration.menu_item_ids.map(Number));
        const filtered = menuItems.filter((i) => allowedIds.has(i.id));

        return filtered;
    }, [activeDataset, menuItems]);

    const [selectedItemId, setSelectedItemId] = useState<number | string>(() => {
        if (initialActiveCheck?.menu_item_id) {
            return initialActiveCheck.menu_item_id;
        }

        return datasetMenuItems[0]?.id || '';
    });

    const [startDate, setStartDate] = useState<string>(() => {
        if (initialActiveCheck?.start_date) {
            return String(initialActiveCheck.start_date);
        }

        return checkDateBounds(defaultDataset?.start_date, defaultDataset?.end_date)?.max ?? '';
    });

    const endDate = useMemo(() => shiftCheckDate(startDate, 6), [startDate]);
    const cutoffDate = useMemo(() => shiftCheckDate(startDate, -1), [startDate]);
    const bounds = checkDateBounds(activeDataset?.start_date, activeDataset?.end_date);
    const validDate = !!bounds && startDate >= bounds.min && startDate <= bounds.max;
    const [submission] = useState(() => createCheckSubmission());
    const activeIdRef = useRef(initialActiveCheck?.id);

    const [currentCheck, setCurrentCheck] = useState<ForecastCheckItem | null>(initialActiveCheck);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const [selectedModelKey, setSelectedModelKey] = useState<string>(() => {
        if (initialActiveCheck?.result?.candidates) {
            return initialModelKey(initialActiveCheck.result.candidates) || 'seasonal_naive_7';
        }

        return 'seasonal_naive_7';
    });

    const handleDatasetChange = (newId: string) => {
        setSelectedDatasetId(newId);
        const ds = datasets.find((d) => d.id === Number(newId));

        setStartDate(checkDateBounds(ds?.start_date, ds?.end_date)?.max ?? '');

        if (ds?.configuration?.menu_item_ids && ds.configuration.menu_item_ids.length > 0) {
            setSelectedItemId(ds.configuration.menu_item_ids[0]);
        }
    };

    // Polling effect while active check is queued or running
    useEffect(() => {
        if (!currentCheck || !['queued', 'running'].includes(currentCheck.status)) {
            return;
        }

        const checkId = currentCheck.id;

        return pollForecastCheck<ForecastCheckItem>(checkId, async (signal) => {
            const response = await fetch(`/planning/forecast-checks/${checkId}`, {
                signal, headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
throw new Error('Không thể đọc trạng thái.');
}

            return (await response.json()).data;
        }, (check) => {
            if (activeIdRef.current !== checkId) {
return;
}

            setCurrentCheck(check);

            if (check.result?.candidates) {
                setSelectedModelKey(initialModelKey(check.result.candidates) ?? '');
            }
        });
    }, [currentCheck]);

    const isFormStale = useMemo(() => {
        if (!currentCheck) {
            return false;
        }

        return (
            Number(selectedDatasetId) !== Number(currentCheck.synthetic_dataset_id) ||
            Number(selectedItemId) !== Number(currentCheck.menu_item_id) ||
            startDate !== currentCheck.start_date
        );
    }, [currentCheck, selectedDatasetId, selectedItemId, startDate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validDate) {
            setFormError('Chọn khoảng 7 ngày nằm trong dataset và có lịch sử phía trước.');

            return;
        }

        const token = submission.begin(JSON.stringify([selectedDatasetId, selectedItemId, startDate]));

        if (!token) {
return;
}

        setFormError(null);
        setIsSubmitting(true);
        let confirmed = false;

        try {
            const res = await fetch('/planning/forecast-checks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '',
                },
                body: JSON.stringify({
                    synthetic_dataset_id: Number(selectedDatasetId),
                    menu_item_id: Number(selectedItemId),
                    start_date: startDate,
                    submission_token: token,
                }),
            });

            const json = await res.json();

            if (!res.ok) {
                setFormError(json.message || 'Không thể tạo lượt kiểm tra. Vui lòng kiểm tra lại ngày bắt đầu.');
            } else if (json.data) {
                confirmed = true;
                activeIdRef.current = json.data.id;
                setCurrentCheck(json.data);

                if (json.data.result?.candidates) {
                    const k = initialModelKey(json.data.result.candidates);

                    if (k) {
                        setSelectedModelKey(k);
                    }
                }
            }
        } catch (err: any) {
            setFormError(err.message || 'Lỗi kết nối khi gửi yêu cầu.');
        } finally {
            submission.finish(confirmed);
            setIsSubmitting(false);
        }
    };

    const handleRetry = async () => {
        if (!currentCheck) {
            return;
        }

        setIsSubmitting(true);
        setFormError(null);

        try {
            const res = await fetch(`/planning/forecast-checks/${currentCheck.id}/retry`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content || '',
                },
            });
            const json = await res.json();

            if (!res.ok) {
                setFormError(json.message || 'Không thể chạy lại lượt kiểm tra.');
            } else if (json.data) {
                setCurrentCheck(json.data);
            }
        } catch (err: any) {
            setFormError(err.message || 'Lỗi kết nối.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DashboardLayout>
            <Head title="Kiểm tra dự báo 7 ngày — Tạp Hóa POS" />

            <div className="planning-ui space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Link href="/admin/synthetic-datasets" className="hover:text-sky-700 dark:hover:text-sky-300 transition-colors">
                                Dữ liệu mô phỏng
                            </Link>
                            <span>/</span>
                            <span className="text-slate-700 dark:text-slate-300">Kiểm tra dự báo 7 ngày</span>
                        </div>
                        <h1 className="font-display mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                            Kiểm tra dự báo 7 ngày
                        </h1>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Quan sát trực quan mức độ sai lệch của 7 mô hình ứng viên trên bất kỳ khoảng 7 ngày nào trong tập dữ liệu mô phỏng.
                        </p>
                    </div>

                    <Link
                        href="/admin/synthetic-datasets"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                    >
                        <Database className="h-4 w-4 text-purple-500" />
                        Danh sách tập dữ liệu
                    </Link>
                </div>

                {/* Form Card */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <label htmlFor="forecast-dataset" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Tập dữ liệu mô phỏng
                                </label>
                                <select
                                    id="forecast-dataset"
                                    value={selectedDatasetId}
                                    onChange={(e) => handleDatasetChange(e.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-2xs outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    {datasets.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            #{d.id} — {d.name} ({d.configuration?.days ?? 120} ngày)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="forecast-item" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Mặt hàng kiểm tra
                                </label>
                                <select
                                    id="forecast-item"
                                    value={selectedItemId}
                                    onChange={(e) => setSelectedItemId(e.target.value)}
                                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-2xs outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    {datasetMenuItems.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <span id="forecast-start-date-label" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Ngày bắt đầu (7 ngày kiểm tra)
                                </span>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        title="Lùi 7 ngày"
                                        aria-label="Lùi 7 ngày"
                                        disabled={!validDate || !bounds || shiftCheckDate(startDate, -7) < bounds.min}
                                        onClick={() => setStartDate((s) => shiftCheckDate(s, -7))}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </button>
                                    <div role="group" aria-labelledby="forecast-start-date-label" aria-invalid={!validDate} aria-describedby={formError ? 'forecast-form-error' : undefined} className="min-w-0 flex-1 [&>div]:w-full">
                                        <DatePicker
                                            mode="single"
                                            value={startDate || null}
                                            onChange={(value) => setStartDate(value ?? '')}
                                            minDate={bounds?.min}
                                            maxDate={bounds?.max}
                                            disabled={!bounds}
                                            className="min-h-11 w-full min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        title="Tiến 7 ngày"
                                        aria-label="Tiến 7 ngày"
                                        disabled={!validDate || !bounds || shiftCheckDate(startDate, 7) > bounds.max}
                                        onClick={() => setStartDate((s) => shiftCheckDate(s, 7))}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-end">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !validDate || !selectedDatasetId || !datasetMenuItems.some((item) => item.id === Number(selectedItemId))}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:opacity-50 transition-colors"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Đang tạo...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-4 w-4" />
                                            <span>Kiểm tra 7 ngày</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 flex flex-wrap items-center gap-2">
                            <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                            <span>
                                Khoảng kiểm tra: <strong className="text-slate-800 dark:text-slate-200">{formatDate(startDate)}</strong> đến <strong className="text-slate-800 dark:text-slate-200">{formatDate(endDate)}</strong>
                            </span>
                            <span>·</span>
                            <span>
                                Dữ liệu mô hình được dùng: từ đầu tập dữ liệu đến hết <strong className="text-slate-800 dark:text-slate-200">{formatDate(cutoffDate)}</strong>
                            </span>
                            <span>·</span>
                            <span className="font-semibold text-purple-700 dark:text-purple-300">
                                Nguồn: Dữ liệu mô phỏng
                            </span>
                        </div>

                        {formError && (
                            <div id="forecast-form-error" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{formError}</span>
                            </div>
                        )}

                        {isFormStale && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                                <span>
                                    Lựa chọn ở trên đã thay đổi so với kết quả đang hiển thị. Hãy bấm <strong>Kiểm tra 7 ngày</strong> để cập nhật.
                                </span>
                            </div>
                        )}
                    </form>
                </div>

                {/* Active check view */}
                {currentCheck && (
                    <div className="space-y-4">
                        {['queued', 'running'].includes(currentCheck.status) && (
                            <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-6 text-center dark:border-purple-900/50 dark:bg-purple-950/20">
                                <Loader2 className="mx-auto h-8 w-8 animate-spin text-purple-600" />
                                <h3 className="font-display mt-3 text-sm font-bold text-purple-900 dark:text-purple-200">
                                    {currentCheck.status === 'queued' ? 'Đang xếp hàng tính toán...' : 'Đang xử lý 7 mô hình ứng viên...'}
                                </h3>
                                <p className="mt-1 text-xs text-purple-700/80 dark:text-purple-300/80">
                                    Hệ thống đang tiền xử lý chuỗi và chạy Naive, Seasonal Naive, SMA và Holt-Winters.
                                </p>
                            </div>
                        )}

                        {currentCheck.status === 'failed' && (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="font-display text-sm font-bold text-rose-900 dark:text-rose-200">
                                                Lượt kiểm tra không thành công
                                            </h4>
                                            <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                                                {currentCheck.error_message || 'Xảy ra lỗi trong quá trình tính toán chuỗi.'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRetry}
                                        disabled={isSubmitting}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-sky-800 disabled:opacity-50 transition-colors"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        <span>Thử lại</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {currentCheck.status === 'completed' && currentCheck.result && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                        Xuất kết quả kiểm tra #{currentCheck.id}:
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <a
                                            href={`/planning/forecast-checks/${currentCheck.id}/exports/comparison.csv`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                                            <span>So sánh (CSV)</span>
                                        </a>
                                        <a
                                            href={`/planning/forecast-checks/${currentCheck.id}/exports/daily-errors.csv`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
                                            <span>Sai số theo ngày (CSV)</span>
                                        </a>
                                        <a
                                            href={`/planning/forecast-checks/${currentCheck.id}/exports/manifest.json`}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            <FileText className="h-3.5 w-3.5 text-purple-600" />
                                            <span>Manifest (JSON)</span>
                                        </a>
                                    </div>
                                </div>

                                <ForecastCheckResults
                                    check={currentCheck}
                                    selectedModelKey={selectedModelKey}
                                    onSelectModelKey={setSelectedModelKey}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* History */}
                {recentChecks && recentChecks.data.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <History className="h-4 w-4 text-purple-600" />
                                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                                    Lịch sử kiểm tra gần đây
                                </h4>
                            </div>
                            <span className="text-xs text-slate-400">
                                {recentChecks.total} lượt
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Mã</th>
                                        <th className="px-4 py-3 font-semibold">Mặt hàng</th>
                                        <th className="px-4 py-3 font-semibold">Tập dữ liệu</th>
                                        <th className="px-4 py-3 font-semibold">Khoảng kiểm tra</th>
                                        <th className="px-4 py-3 font-semibold">Trạng thái</th>
                                        <th className="px-4 py-3 font-semibold">Thời điểm tạo</th>
                                        <th className="px-4 py-3 font-semibold text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {recentChecks.data.map((item) => (
                                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                            <td className="px-4 py-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                                                #{item.id}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                                {item.item_label}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                                {item.dataset_label}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                                {formatDate(item.start_date)} — {formatDate(item.end_date)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                                    item.status === 'completed'
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                        : item.status === 'failed'
                                                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                            : 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                                                }`}>
                                                    {formatRunStatusLabel(item.status)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400">
                                                {item.created_at ? formatDate(item.created_at) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Link
                                                    href={`/planning/forecast-checks/${item.id}`}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                                                >
                                                    <Eye className="h-3.5 w-3.5 text-slate-400" />
                                                    <span>Xem</span>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
