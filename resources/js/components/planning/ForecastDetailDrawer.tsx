import { Link } from '@inertiajs/react';
import {
    Activity,
    ArrowRight,
    Boxes,
    Calendar,
    Layers,
    PackageCheck,
    Sparkles,
    X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import DataQualityBadge from './DataQualityBadge';
import {
    formatDate,
    formatQuantity,
    formatWape,
    MODEL_NAMES,
} from './planningFormatters';

export interface DailyForecastItem {
    id?: number;
    forecast_date: string;
    forecast_quantity: number;
    lower_bound?: number | null;
    upper_bound?: number | null;
}

export interface ProductForecastItem {
    id: number;
    menu_item_id: number;
    name: string;
    category_id?: number | null;
    category_name?: string | null;
    price?: number;
    image?: string | null;
    forecast_quantity: number;
    lower_bound?: number | null;
    upper_bound?: number | null;
    model_key: string;
    data_quality: string;
    data_cutoff?: string | null;
    mae?: number | null;
    rmse?: number | null;
    wape?: number | null;
    origins_count?: number;
    daily_forecasts: DailyForecastItem[];
}

interface ForecastDetailDrawerProps {
    isOpen: boolean;
    product: ProductForecastItem | null;
    onClose: () => void;
}

export default function ForecastDetailDrawer({
    isOpen,
    product,
    onClose,
}: ForecastDetailDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Save previous focus on open and restore on close
    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement | null;
            // Delay focus to allow animation frame
            const timer = setTimeout(() => {
                closeBtnRef.current?.focus();
            }, 50);

            return () => clearTimeout(timer);
        }

        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
            previousFocusRef.current.focus();
        }
    }, [isOpen]);

    // Handle Escape and Focus Trap
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();

                return;
            }

            if (e.key === 'Tab') {
                if (!drawerRef.current) {
                    return;
                }

                const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );

                if (focusableElements.length === 0) {
                    return;
                }

                const firstEl = focusableElements[0];
                const lastEl = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === firstEl) {
                        e.preventDefault();
                        lastEl.focus();
                    }
                } else {
                    if (document.activeElement === lastEl) {
                        e.preventDefault();
                        firstEl.focus();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !product) {
        return null;
    }

    const modelName = MODEL_NAMES[product.model_key] || product.model_key;
    const hasBounds = product.lower_bound != null && product.upper_bound != null;

    return (
        <div
            className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs transition-opacity duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forecast-drawer-title"
        >
            <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
                <div
                    ref={drawerRef}
                    className="w-screen max-w-xl border-l border-slate-200 bg-white shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                        <div className="space-y-1 pr-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                                    Chi tiết dự báo
                                </span>
                                <DataQualityBadge quality={product.data_quality} />
                            </div>
                            <h2
                                id="forecast-drawer-title"
                                className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                            >
                                {product.name}
                            </h2>
                            {product.category_name && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Nhóm: {product.category_name}
                                </p>
                            )}
                        </div>

                        <button
                            ref={closeBtnRef}
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            aria-label="Đóng ngăn chi tiết"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                        {/* Summary Metrics Grid */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Boxes className="h-3.5 w-3.5 text-purple-500" />
                                    Tổng chu kỳ
                                </span>
                                <div className="mt-1.5 font-display text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                    {formatQuantity(product.forecast_quantity)}
                                </div>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    {product.daily_forecasts.length} ngày
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Activity className="h-3.5 w-3.5 text-sky-500" />
                                    Khoảng tin cậy
                                </span>
                                <div className="mt-1.5 font-display text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                                    {hasBounds
                                        ? `${formatQuantity(product.lower_bound)} - ${formatQuantity(product.upper_bound)}`
                                        : 'Không có'}
                                </div>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    ±20% ước lượng
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                    Sai số WAPE
                                </span>
                                <div className="mt-1.5 font-display text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                    {formatWape(product.wape)}
                                </div>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    Càng thấp càng tốt
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5 text-emerald-500" />
                                    Số mốc đánh giá
                                </span>
                                <div className="mt-1.5 font-display text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                    {product.origins_count ?? 8}
                                </div>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    Rolling origins
                                </span>
                            </div>
                        </div>

                        {/* Model & Metadata Details */}
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-800/30 space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Thông số mô hình & Kiểm thử
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Mô hình đã chọn:</span>
                                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {modelName}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Ngày chốt dữ liệu (Cutoff):</span>
                                    <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 tabular-nums">
                                        {formatDate(product.data_cutoff) || '-'}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Chỉ số MAE:</span>
                                    <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 tabular-nums">
                                        {product.mae !== null && product.mae !== undefined
                                            ? formatQuantity(product.mae, 2)
                                            : '-'}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Chỉ số RMSE:</span>
                                    <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 tabular-nums">
                                        {product.rmse !== null && product.rmse !== undefined
                                            ? formatQuantity(product.rmse, 2)
                                            : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Link to Procurement - Explicit requirement */}
                        <div>
                            <Link
                                href="/planning/procurement"
                                className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
                            >
                                <span className="flex items-center gap-2">
                                    <PackageCheck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                    <span>Xem đề xuất nhập hàng nguyên liệu tương ứng</span>
                                </span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                            </Link>
                        </div>

                        {/* Daily Forecast Table */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4 text-purple-500" />
                                    Dự báo chi tiết từng ngày
                                </h3>
                                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                                    {product.daily_forecasts.length} mốc
                                </span>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-2xs">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                        <tr>
                                            <th className="px-4 py-2.5 font-semibold">Ngày dự báo</th>
                                            <th className="px-4 py-2.5 font-semibold text-right">Số lượng</th>
                                            <th className="px-4 py-2.5 font-semibold text-right">Cận dưới - trên</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {product.daily_forecasts.map((d, idx) => {
                                            const hasDayBounds = d.lower_bound != null && d.upper_bound != null;

                                            return (
                                                <tr
                                                    key={d.id ?? `${d.forecast_date}-${idx}`}
                                                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                                                >
                                                    <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                                                        {formatDate(d.forecast_date)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                                        {formatQuantity(d.forecast_quantity, 1)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                                                        {hasDayBounds
                                                            ? `${formatQuantity(d.lower_bound, 1)} - ${formatQuantity(d.upper_bound, 1)}`
                                                            : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="border-t border-slate-200 bg-slate-50/60 font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100">
                                        <tr>
                                            <td className="px-4 py-2.5">Tổng chu kỳ</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-purple-600 dark:text-purple-400">
                                                {formatQuantity(product.forecast_quantity)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                                {hasBounds
                                                    ? `${formatQuantity(product.lower_bound)} - ${formatQuantity(product.upper_bound)}`
                                                    : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-slate-200 px-6 py-4 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40 flex justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
