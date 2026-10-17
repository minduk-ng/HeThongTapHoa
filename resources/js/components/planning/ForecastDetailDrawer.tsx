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
import DataQualityBadge from './DataQualityBadge';
import PlanningDialog from './PlanningDialog';
import {
    formatDate,
    formatQuantity,
    formatWape,
    MODEL_NAMES,
} from './planningFormatters';

export interface DailyForecastItem {
    id?: number;
    forecast_date: string;
    forecast_quantity: number | null;
    lower_bound?: number | null;
    upper_bound?: number | null;
    status?: string | null;
}

export interface ProductForecastItem {
    id: number;
    menu_item_id: number;
    name: string;
    category_id?: number | null;
    category_name?: string | null;
    price?: number;
    image?: string | null;
    forecast_quantity: number | null;
    lower_bound?: number | null;
    upper_bound?: number | null;
    model_key: string | null;
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
    procurementHref: string;
}

export default function ForecastDetailDrawer({
    isOpen,
    product,
    onClose,
    procurementHref,
}: ForecastDetailDrawerProps) {
    if (!isOpen || !product) {
        return null;
    }

    const modelName =
        (product.model_key ? MODEL_NAMES[product.model_key] : null) ||
        product.model_key ||
        'Chưa đủ dữ liệu';
    const hasBounds =
        product.lower_bound != null && product.upper_bound != null;

    return (
        <PlanningDialog
            open={isOpen}
            onClose={onClose}
            labelledBy="forecast-drawer-title"
            variant="drawer"
        >
            <div className="flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl sm:max-w-xl dark:border-slate-800 dark:bg-slate-900">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                    <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold tracking-wider text-purple-600 uppercase dark:text-purple-400">
                                Chi tiết dự báo
                            </span>
                            <DataQualityBadge quality={product.data_quality} />
                        </div>
                        <h2
                            id="forecast-drawer-title"
                            data-dialog-heading
                            tabIndex={-1}
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
                        data-dialog-close
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label="Đóng ngăn chi tiết"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                    {/* Summary Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                <Boxes className="h-3.5 w-3.5 text-purple-500" />
                                Tổng kỳ dự báo
                            </span>
                            <div className="mt-1.5 font-display text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                {product.forecast_quantity == null
                                    ? '—'
                                    : formatQuantity(product.forecast_quantity)}
                            </div>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                {product.daily_forecasts.length} ngày
                            </span>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                <Activity className="h-3.5 w-3.5 text-sky-500" />
                                Biên tham khảo
                            </span>
                            <div className="mt-1.5 font-display text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                                {hasBounds
                                    ? `${formatQuantity(product.lower_bound)} - ${formatQuantity(product.upper_bound)}`
                                    : '—'}
                            </div>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                ±20% tham khảo
                            </span>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                Sai số WAPE
                            </span>
                            <div className="mt-1.5 font-display text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                {product.wape == null
                                    ? '—'
                                    : formatWape(product.wape)}
                            </div>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                Càng thấp càng tốt
                            </span>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                <Layers className="h-3.5 w-3.5 text-emerald-500" />
                                Số mốc đánh giá
                            </span>
                            <div className="mt-1.5 font-display text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                {product.origins_count ?? '—'}
                            </div>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                Rolling origins
                            </span>
                        </div>
                    </div>

                    {/* Model & Metadata Details */}
                    <details className="text-xs text-slate-600 dark:text-slate-400">
                        <summary className="cursor-pointer font-semibold">
                            Giải thích WAPE, MAE, RMSE
                        </summary>
                        <p className="mt-2">
                            WAPE: tổng sai số tuyệt đối so với tổng nhu cầu thực
                            tế (%). MAE: sai số tuyệt đối trung bình. RMSE: căn
                            bậc hai sai số bình phương trung bình, nhạy hơn với
                            sai lệch lớn. Giá trị thiếu hiển thị —.
                        </p>
                    </details>
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                        <h3 className="font-display text-sm font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-300">
                            Thông số mô hình & Kiểm thử
                        </h3>
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <span className="text-slate-500 dark:text-slate-400">
                                    Mô hình đã chọn:
                                </span>
                                <div className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                                    {modelName}
                                </div>
                            </div>

                            <div>
                                <span className="text-slate-500 dark:text-slate-400">
                                    Ngày chốt dữ liệu (Cutoff):
                                </span>
                                <div className="mt-0.5 font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                    {product.data_cutoff
                                        ? formatDate(product.data_cutoff)
                                        : '—'}
                                </div>
                            </div>

                            <div>
                                <span className="text-slate-500 dark:text-slate-400">
                                    Chỉ số MAE:
                                </span>
                                <div className="mt-0.5 font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                    {product.mae !== null &&
                                    product.mae !== undefined
                                        ? formatQuantity(product.mae, 2)
                                        : '—'}
                                </div>
                            </div>

                            <div>
                                <span className="text-slate-500 dark:text-slate-400">
                                    Chỉ số RMSE:
                                </span>
                                <div className="mt-0.5 font-medium text-slate-800 tabular-nums dark:text-slate-200">
                                    {product.rmse !== null &&
                                    product.rmse !== undefined
                                        ? formatQuantity(product.rmse, 2)
                                        : '—'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Link to Procurement - Explicit requirement */}
                    <div>
                        <Link
                            href={procurementHref}
                            className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
                        >
                            <span className="flex items-center gap-2">
                                <PackageCheck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                <span>
                                    Xem đề xuất nhập hàng nguyên liệu tương ứng
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                        </Link>
                    </div>

                    {/* Daily Forecast Table */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                                <Calendar className="h-4 w-4 text-purple-500" />
                                Dự báo chi tiết từng ngày
                            </h3>
                            <span className="text-xs text-slate-400 tabular-nums dark:text-slate-500">
                                {product.daily_forecasts.length} mốc
                            </span>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                                    <tr>
                                        <th className="px-4 py-2.5 font-semibold">
                                            Ngày dự báo
                                        </th>
                                        <th className="px-4 py-2.5 text-right font-semibold">
                                            Số lượng
                                        </th>
                                        <th className="px-4 py-2.5 text-right font-semibold">
                                            Cận dưới - trên
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {product.daily_forecasts.map((d, idx) => {
                                        const hasDayBounds =
                                            d.lower_bound != null &&
                                            d.upper_bound != null;

                                        return (
                                            <tr
                                                key={
                                                    d.id ??
                                                    `${d.forecast_date}-${idx}`
                                                }
                                                className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                                            >
                                                <td className="px-4 py-2.5 font-medium text-slate-700 tabular-nums dark:text-slate-300">
                                                    {formatDate(
                                                        d.forecast_date,
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums dark:text-slate-100">
                                                    {d.forecast_quantity == null
                                                        ? '—'
                                                        : formatQuantity(
                                                              d.forecast_quantity,
                                                              1,
                                                          )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums dark:text-slate-400">
                                                    {hasDayBounds
                                                        ? `${formatQuantity(d.lower_bound, 1)} - ${formatQuantity(d.upper_bound, 1)}`
                                                        : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="border-t border-slate-200 bg-slate-50/60 font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100">
                                    <tr>
                                        <td className="px-4 py-2.5">
                                            Tổng kỳ dự báo
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-bold text-purple-600 tabular-nums dark:text-purple-400">
                                            {product.forecast_quantity == null
                                                ? '—'
                                                : formatQuantity(
                                                      product.forecast_quantity,
                                                  )}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums dark:text-slate-400">
                                            {hasBounds
                                                ? `${formatQuantity(product.lower_bound)} - ${formatQuantity(product.upper_bound)}`
                                                : '—'}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-slate-200 bg-slate-50/60 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/40">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Đóng ngăn chi tiết"
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </PlanningDialog>
    );
}
