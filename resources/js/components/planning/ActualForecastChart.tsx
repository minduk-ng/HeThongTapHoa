import { LineChart as LineChartIcon } from 'lucide-react';
import {
    Area,
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
import { formatQuantity } from './planningFormatters';

export interface ActualForecastPoint {
    date: string;
    label?: string;
    actual?: number | null;
    forecast?: number | null;
    lowerBound?: number | null;
    upperBound?: number | null;
    confidenceRange?: [number, number] | null;
}

interface ActualForecastChartProps {
    data: ActualForecastPoint[];
    cutoffDate?: string | null;
    height?: number;
    className?: string;
    title?: string;
    subtitle?: string;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
        name: string;
        value: unknown;
        color: string;
        dataKey: string;
        payload: ActualForecastPoint;
    }>;
    label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const point = payload[0]?.payload;

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800 text-xs">
            <p className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                {point?.label || label || point?.date}
            </p>
            <div className="mt-2 space-y-1">
                {point?.actual !== undefined && point.actual !== null && (
                    <div className="flex items-center justify-between gap-4 text-sky-700 dark:text-sky-300">
                        <span className="flex items-center gap-1.5 font-medium">
                            <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                            Thực tế:
                        </span>
                        <span className="font-semibold tabular-nums">
                            {formatQuantity(point.actual)}
                        </span>
                    </div>
                )}
                {point?.forecast !== undefined && point.forecast !== null && (
                    <div className="flex items-center justify-between gap-4 text-purple-700 dark:text-purple-300">
                        <span className="flex items-center gap-1.5 font-medium">
                            <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                            Dự báo:
                        </span>
                        <span className="font-semibold tabular-nums">
                            {formatQuantity(point.forecast)}
                        </span>
                    </div>
                )}
                {point?.lowerBound !== undefined &&
                    point.lowerBound !== null &&
                    point?.upperBound !== undefined &&
                    point.upperBound !== null && (
                        <div className="mt-1 border-t border-slate-100 pt-1 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            <span>Khoảng ước tính: </span>
                            <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                                {formatQuantity(point.lowerBound)} - {formatQuantity(point.upperBound)}
                            </span>
                        </div>
                    )}
            </div>
        </div>
    );
}

export default function ActualForecastChart({
    data,
    cutoffDate,
    height = 320,
    className = '',
    title,
    subtitle,
}: ActualForecastChartProps) {
    const safeData = Array.isArray(data) ? data : [];

    if (safeData.length === 0) {
        return (
            <div
                className={`flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800/80 ${className}`}
                style={{ height }}
            >
                <div className="rounded-xl bg-slate-100 p-3 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500">
                    <LineChartIcon className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Chưa có chuỗi dữ liệu dự báo
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Hãy kích hoạt chạy dự báo để xem biểu đồ so sánh thực tế và dự đoán.
                </p>
            </div>
        );
    }

    // Process data to calculate confidenceRange if lowerBound & upperBound exist
    const hasBounds = safeData.some(
        (d) => d.lowerBound !== undefined && d.lowerBound !== null && d.upperBound !== undefined && d.upperBound !== null
    );

    const chartData = safeData.map((d) => {
        const item: ActualForecastPoint = {
            ...d,
            label: d.label || d.date,
        };

        if (d.lowerBound !== undefined && d.lowerBound !== null && d.upperBound !== undefined && d.upperBound !== null) {
            item.confidenceRange = [d.lowerBound, d.upperBound];
        }

        return item;
    });

    // Find the cutoff label if cutoffDate is supplied
    const cutoffPoint = cutoffDate
        ? chartData.find((d) => d.date === cutoffDate || d.date.startsWith(cutoffDate))
        : null;
    const cutoffX = cutoffPoint ? (cutoffPoint.label || cutoffPoint.date) : null;

    return (
        <div
            className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800/90 ${className}`}
        >
            {(title || subtitle) && (
                <div className="mb-4">
                    {title && (
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                            {title}
                        </h3>
                    )}
                    {subtitle && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {subtitle}
                        </p>
                    )}
                </div>
            )}

            <div style={{ height, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={chartData}
                        margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            className="stroke-slate-200 dark:stroke-slate-700/60"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11 }}
                            className="text-slate-500 dark:text-slate-400"
                            tickLine={false}
                            axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                            tick={{ fontSize: 11 }}
                            className="text-slate-500 dark:text-slate-400"
                            tickFormatter={(v: number) => formatQuantity(v)}
                            tickLine={false}
                            axisLine={false}
                            width={46}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{ paddingTop: 8 }}
                            formatter={(value: string) => (
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                    {value}
                                </span>
                            )}
                        />

                        {/* Optional Confidence Interval Band */}
                        {hasBounds && (
                            <Area
                                type="monotone"
                                dataKey="confidenceRange"
                                name="Biên tham khảo (±20%)"
                                stroke="transparent"
                                fill="#c084fc"
                                fillOpacity={0.22}
                                isAnimationActive={false}
                            />
                        )}

                        {/* Reference Line at Cutoff */}
                        {cutoffX && (
                            <ReferenceLine
                                x={cutoffX}
                                stroke="#64748b"
                                strokeDasharray="3 3"
                                strokeWidth={1.5}
                                label={{
                                    value: 'Điểm cắt (Cutoff)',
                                    position: 'top',
                                    fill: '#64748b',
                                    fontSize: 10,
                                    fontWeight: 600,
                                }}
                            />
                        )}

                        {/* Actual Demand Line: Solid Sky Line */}
                        <Line
                            type="monotone"
                            dataKey="actual"
                            name="Nhu cầu thực tế"
                            stroke="#0284c7"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: '#0284c7' }}
                            activeDot={{ r: 5, fill: '#0284c7' }}
                            connectNulls={false}
                        />

                        {/* Forecast Line: Dashed Purple Line */}
                        <Line
                            type="monotone"
                            dataKey="forecast"
                            name="Dự báo tương lai"
                            stroke="#9333ea"
                            strokeWidth={2.5}
                            strokeDasharray="5 5"
                            dot={{ r: 3, fill: '#9333ea' }}
                            activeDot={{ r: 5, fill: '#9333ea' }}
                            connectNulls={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
