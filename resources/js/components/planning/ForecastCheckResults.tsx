import { Award } from 'lucide-react';
import { useMemo } from 'react';
import {
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { ForecastCheckCandidate, ForecastCheckItem } from '../../types/forecast-check';
import { formatCheckMetric, formatSignedError } from './forecastCheckView';
import { formatDate, formatQuantity, formatWape, MODEL_NAMES } from './planningFormatters';

interface ForecastCheckResultsProps {
    check: ForecastCheckItem;
    selectedModelKey: string;
    onSelectModelKey: (key: string) => void;
}

export default function ForecastCheckResults({
    check,
    selectedModelKey,
    onSelectModelKey,
}: ForecastCheckResultsProps) {
    const result = check.result;
    const candidates = useMemo(() => result?.candidates || [], [result]);

    const activeCandidate: ForecastCheckCandidate | undefined = useMemo(() => {
        return candidates.find((c) => c.model_key === selectedModelKey) || candidates[0];
    }, [candidates, selectedModelKey]);

    const chartData = useMemo(() => {
        if (!result) {
            return [];
        }

        const historyPoints = (result.history || []).map((h) => ({
            date: h.date,
            actual: h.observed_sales !== null ? Number(h.observed_sales) : null,
            forecast: null,
            isTarget: false,
        }));

        const targetPoints = (activeCandidate?.points || []).map((p) => ({
            date: p.date,
            actual: p.actual !== null ? Number(p.actual) : null,
            forecast: p.predicted !== null ? Number(p.predicted) : null,
            signed_error: p.signed_error,
            isTarget: true,
        }));

        return [...historyPoints, ...targetPoints];
    }, [result, activeCandidate]);

    if (!result) {
        return null;
    }

    const activeModelName = activeCandidate
        ? (MODEL_NAMES[activeCandidate.model_key] || activeCandidate.model_key)
        : '';

    const bestModelKeys = result.best_model_keys || [];
    const isCurrentBest = activeCandidate && bestModelKeys.includes(activeCandidate.model_key);

    return (
        <div className="space-y-6">
            {/* Header info */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                                {check.item_label}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDate(check.start_date)} — {formatDate(check.end_date)}
                            </span>
                            {isCurrentBest && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <Award className="h-3 w-3" />
                                    Sai số thấp nhất khoảng này
                                </span>
                            )}
                        </div>
                        <h3 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-slate-100">
                            Đang xem: {activeModelName}
                        </h3>
                    </div>

                    <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                        <div>Ngày cắt dữ liệu: <strong className="text-slate-700 dark:text-slate-200">{formatDate(check.cutoff)}</strong></div>
                        <div className="mt-0.5">Đã đối chiếu: <strong className="text-slate-700 dark:text-slate-200">{activeCandidate?.scored_count ?? 0}/7 ngày</strong></div>
                    </div>
                </div>

                {/* 2-line Comparison Chart */}
                <div className="mt-6 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(d: string) => {
                                    const parts = d.split('-');

                                    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
                                }}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                            />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || !payload.length) {
                                        return null;
                                    }

                                    const pData = payload[0]?.payload;

                                    return (
                                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-md dark:border-slate-800 dark:bg-slate-900 text-xs space-y-1">
                                            <div className="font-semibold text-slate-900 dark:text-slate-100">{formatDate(label != null ? String(label) : '')}</div>
                                            {pData?.actual !== null && (
                                                <div className="text-purple-600 dark:text-purple-400 font-medium">
                                                    Quan sát: {formatQuantity(pData.actual)}
                                                </div>
                                            )}
                                            {pData?.forecast !== null && (
                                                <div className="text-amber-600 dark:text-amber-400 font-medium">
                                                    Dự báo: {formatQuantity(pData.forecast)}
                                                </div>
                                            )}
                                            {pData?.signed_error !== null && pData?.signed_error !== undefined && (
                                                <div className="text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                                                    Chênh lệch: {formatSignedError(pData.signed_error)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                iconType="circle"
                                wrapperStyle={{ paddingBottom: 10, fontSize: 12 }}
                            />
                            <ReferenceLine
                                x={check.start_date}
                                stroke="#94a3b8"
                                strokeDasharray="3 3"
                                label={{ value: 'Bắt đầu dự báo', position: 'top', fill: '#64748b', fontSize: 11 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="actual"
                                name="Quan sát mô phỏng"
                                stroke="#8b5cf6"
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: '#8b5cf6' }}
                                connectNulls={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="forecast"
                                name="Dự báo mô hình"
                                stroke="#f59e0b"
                                strokeWidth={2.5}
                                strokeDasharray="5 5"
                                dot={{ r: 3.5, fill: '#f59e0b' }}
                                connectNulls={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">MAE (Sai số TB)</span>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCheckMetric(activeCandidate?.mae)}
                    </div>
                    <span className="text-[11px] text-slate-400">món / ngày</span>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">RMSE</span>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCheckMetric(activeCandidate?.rmse)}
                    </div>
                    <span className="text-[11px] text-slate-400">nhạy với sai lệch lớn</span>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">WAPE</span>
                    <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {activeCandidate?.wape !== null && activeCandidate?.wape !== undefined ? formatWape(activeCandidate.wape) : 'Chưa tính được'}
                    </div>
                    <span className="text-[11px] text-slate-400">tổng lỗi / tổng thực tế</span>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tổng quan sát / Dự báo</span>
                    <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {activeCandidate?.observed_total !== null ? formatQuantity(activeCandidate.observed_total) : '-'} / {activeCandidate?.predicted_scored_total !== null ? formatQuantity(activeCandidate.predicted_scored_total) : '-'}
                    </div>
                    <span className="text-[11px] text-slate-400">trên {activeCandidate?.scored_count ?? 0} ngày có số liệu</span>
                </div>
            </div>

            {/* Model Comparison Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Bảng so sánh 7 mô hình ứng viên (bấm dòng để đổi biểu đồ)
                    </h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Mô hình</th>
                                <th className="px-4 py-3 font-semibold text-right">MAE</th>
                                <th className="px-4 py-3 font-semibold text-right">RMSE</th>
                                <th className="px-4 py-3 font-semibold text-right">WAPE</th>
                                <th className="px-4 py-3 font-semibold text-center">Số ngày chấm</th>
                                <th className="px-4 py-3 font-semibold">Đánh giá / Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {candidates.map((cand) => {
                                const isSelected = cand.model_key === selectedModelKey;
                                const isBest = bestModelKeys.includes(cand.model_key);
                                const name = MODEL_NAMES[cand.model_key] || cand.model_key;

                                return (
                                    <tr
                                        key={cand.model_key}
                                        onClick={() => onSelectModelKey(cand.model_key)}
                                        className={`cursor-pointer transition-colors ${
                                            isSelected
                                                ? 'bg-purple-50/70 font-medium text-purple-900 dark:bg-purple-950/40 dark:text-purple-200'
                                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                        }`}
                                    >
                                        <td className="px-4 py-3.5">
                                            <div className="font-semibold text-slate-900 dark:text-slate-100">{name}</div>
                                            <span className="text-[10px] text-slate-400 font-mono">{cand.model_key}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right tabular-nums">{formatCheckMetric(cand.mae)}</td>
                                        <td className="px-4 py-3.5 text-right tabular-nums">{formatCheckMetric(cand.rmse)}</td>
                                        <td className="px-4 py-3.5 text-right tabular-nums">
                                            {cand.wape !== null ? formatWape(cand.wape) : '-'}
                                        </td>
                                        <td className="px-4 py-3.5 text-center tabular-nums">{cand.scored_count}/7</td>
                                        <td className="px-4 py-3.5">
                                            {cand.status === 'evaluated' ? (
                                                isBest ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                                        <Award className="h-3 w-3" />
                                                        Sai số thấp nhất khoảng này
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500">Đã đối chiếu</span>
                                                )
                                            ) : (
                                                <span className="text-amber-600 dark:text-amber-400 text-[11px]">
                                                    {cand.status === 'skipped' ? 'Bỏ qua: ' : 'Lỗi: '}
                                                    {cand.reason || 'Không đủ điều kiện chuỗi'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Daily Errors Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 bg-slate-50/75 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Bảng sai lệch chi tiết từng ngày ({activeModelName})
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                        Quy ước: Chênh lệch = Dự báo − Quan sát thực tế. Số dương là dự báo thừa, số âm là dự báo thiếu.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Ngày</th>
                                <th className="px-4 py-3 font-semibold text-right">Quan sát mô phỏng</th>
                                <th className="px-4 py-3 font-semibold text-right">Dự báo</th>
                                <th className="px-4 py-3 font-semibold text-left">Chênh lệch</th>
                                <th className="px-4 py-3 font-semibold text-right">Sai lệch tuyệt đối</th>
                                <th className="px-4 py-3 font-semibold">Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {(activeCandidate?.points || []).map((p) => {
                                return (
                                    <tr key={p.date} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                                            {formatDate(p.date)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                                            {p.actual !== null ? formatQuantity(p.actual) : <span className="text-slate-400 font-normal">Thiếu dữ liệu</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                            {p.predicted !== null ? formatQuantity(p.predicted) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-left tabular-nums">
                                            <span className={`font-medium ${
                                                p.signed_error === null
                                                    ? 'text-slate-400'
                                                    : p.signed_error > 0
                                                        ? 'text-rose-600 dark:text-rose-400'
                                                        : p.signed_error < 0
                                                            ? 'text-sky-600 dark:text-sky-400'
                                                            : 'text-emerald-600 dark:text-emerald-400'
                                            }`}>
                                                {formatSignedError(p.signed_error)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                                            {p.absolute_error !== null ? formatQuantity(p.absolute_error) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">
                                            {p.is_stockout && <span className="text-amber-600 dark:text-amber-400">Hết hàng: lượng bán có thể thấp hơn nhu cầu</span>}
                                            {p.is_missing && <span className="text-slate-400">Dữ liệu bị thiếu (không tính lỗi)</span>}
                                            {!p.is_open && <span className="text-slate-400">Đóng cửa</span>}
                                            {!p.is_stockout && !p.is_missing && p.is_open && <span className="text-emerald-600 dark:text-emerald-400">Hợp lệ</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
