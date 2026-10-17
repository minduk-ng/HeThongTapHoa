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
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
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
    embedded?: boolean;
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
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm tabular-nums shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <p className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                {point?.label || label || point?.date}
            </p>
            <div className="mt-2 space-y-1">
                {point?.actual !== undefined && point.actual !== null && (
                    <div className="flex items-center justify-between gap-4 text-sky-700 dark:text-sky-300">
                        <span className="flex items-center gap-1.5 font-medium">
                            <span className="inline-block h-2 w-2 rounded-full bg-sky-700 dark:bg-sky-400" />
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
                            <span className="inline-block h-2 w-2 rounded-full bg-purple-700 dark:bg-purple-400" />
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
                        <div className="mt-1 border-t border-slate-100 pt-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                            <span>Biên tham khảo: </span>
                            <span className="font-medium text-slate-700 tabular-nums dark:text-slate-300">
                                {formatQuantity(point.lowerBound)} -{' '}
                                {formatQuantity(point.upperBound)}
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
    embedded = false,
}: ActualForecastChartProps) {
    const reduced = usePrefersReducedMotion();
    const safeData = Array.isArray(data) ? data : [];
    const surface = embedded
        ? ''
        : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-800/90';

    if (safeData.length === 0) {
        return (
            <div
                className={`planning-ui flex flex-col items-start justify-center text-left ${surface} ${className}`}
                style={{ height }}
            >
                <div className="rounded-xl bg-slate-100 p-3 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                    <LineChartIcon className="h-6 w-6" />
                </div>
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Chưa có chuỗi dữ liệu dự báo
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    Hãy kích hoạt chạy dự báo để xem biểu đồ so sánh thực tế và
                    dự đoán.
                </p>
            </div>
        );
    }

    // Process data to calculate confidenceRange if lowerBound & upperBound exist
    const hasBounds = safeData.some(
        (d) =>
            d.lowerBound !== undefined &&
            d.lowerBound !== null &&
            d.upperBound !== undefined &&
            d.upperBound !== null,
    );

    const chartData = safeData.map((d) => {
        const item: ActualForecastPoint = {
            ...d,
            label: d.label || d.date,
        };

        if (
            d.lowerBound !== undefined &&
            d.lowerBound !== null &&
            d.upperBound !== undefined &&
            d.upperBound !== null
        ) {
            item.confidenceRange = [d.lowerBound, d.upperBound];
        }

        return item;
    });

    // Find the cutoff label if cutoffDate is supplied
    const cutoffPoint = cutoffDate
        ? chartData.find(
              (d) => d.date === cutoffDate || d.date.startsWith(cutoffDate),
          )
        : null;
    const cutoffX = cutoffPoint ? cutoffPoint.label || cutoffPoint.date : null;

    return (
        <div className={`planning-ui tabular-nums ${surface} ${className}`}>
            {(title || subtitle) && (
                <div className="mb-4">
                    {title && (
                        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                            {title}
                        </h3>
                    )}
                    {subtitle && (
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
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
                            stroke="var(--planning-grid)"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="label"
                            tick={{
                                fontSize: 12,
                                fill: 'var(--planning-axis)',
                            }}
                            tickLine={false}
                            axisLine={{ stroke: 'var(--planning-grid)' }}
                        />
                        <YAxis
                            tick={{
                                fontSize: 12,
                                fill: 'var(--planning-axis)',
                            }}
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
                                fill="var(--planning-predicted)"
                                fillOpacity={0.22}
                                isAnimationActive={false}
                            />
                        )}

                        {/* Reference Line at Cutoff */}
                        {cutoffX && (
                            <ReferenceLine
                                x={cutoffX}
                                stroke="var(--planning-axis)"
                                strokeDasharray="3 3"
                                strokeWidth={1.5}
                                label={{
                                    value: 'Điểm cắt (Cutoff)',
                                    position: 'top',
                                    fill: 'var(--planning-axis)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                }}
                            />
                        )}

                        {/* Actual Demand Line: Solid Sky Line */}
                        <Line
                            type="monotone"
                            dataKey="actual"
                            name="Nhu cầu thực tế"
                            stroke="var(--planning-observed)"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: 'var(--planning-observed)' }}
                            activeDot={{
                                r: 5,
                                fill: 'var(--planning-observed)',
                            }}
                            isAnimationActive={!reduced}
                            connectNulls={false}
                        />

                        {/* Forecast Line: Dashed Purple Line */}
                        <Line
                            type="monotone"
                            dataKey="forecast"
                            name="Dự báo tương lai"
                            stroke="var(--planning-predicted)"
                            strokeWidth={2.5}
                            strokeDasharray="5 5"
                            dot={{ r: 3, fill: 'var(--planning-predicted)' }}
                            activeDot={{
                                r: 5,
                                fill: 'var(--planning-predicted)',
                            }}
                            isAnimationActive={!reduced}
                            connectNulls={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
