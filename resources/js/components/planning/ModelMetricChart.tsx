import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { formatQuantity, formatWape } from './planningFormatters';

export type MetricType = 'wape' | 'mae' | 'rmse';

export interface ModelMetricPoint {
    model_key: string;
    name: string;
    avg_mae: number | null;
    avg_rmse: number | null;
    avg_wape: number | null;
    is_selected?: boolean;
    selected_count?: number;
    origins_count?: number;
}

interface ModelMetricChartProps {
    data: ModelMetricPoint[];
    metric: MetricType;
    height?: number;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
        name: string;
        value: unknown;
        payload: ModelMetricPoint;
    }>;
}

function MetricCustomTooltip({
    active,
    payload,
    metric,
}: CustomTooltipProps & { metric: MetricType }) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const item = payload[0]?.payload;

    if (!item) {
        return null;
    }

    const metricLabels: Record<MetricType, string> = {
        wape: 'Độ lệch WAPE',
        mae: 'Sai số tuyệt đối trung bình (MAE)',
        rmse: 'Căn bậc hai sai số trung bình (RMSE)',
    };

    const getFormattedValue = () => {
        switch (metric) {
            case 'wape':
                return formatWape(item.avg_wape);
            case 'mae':
                return formatQuantity(item.avg_mae, 3);
            case 'rmse':
                return formatQuantity(item.avg_rmse, 3);
            default:
                return '-';
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800 text-xs">
            <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">{item.name}</span>
                {item.is_selected && (
                    <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                        Đang áp dụng
                    </span>
                )}
            </div>
            <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
                    <span>{metricLabels[metric]}:</span>
                    <span className="font-bold tabular-nums text-purple-600 dark:text-purple-400">
                        {getFormattedValue()}
                    </span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-700">
                    * Giá trị càng thấp biểu thị độ chính xác càng cao
                </p>
            </div>
        </div>
    );
}

export default function ModelMetricChart({
    data,
    metric,
    height = 300,
}: ModelMetricChartProps) {
    if (!data || data.length === 0) {
        return (
            <div
                className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 dark:border-slate-800"
                style={{ height }}
            >
                Chưa có dữ liệu đánh giá mô hình
            </div>
        );
    }

    const dataKeyMap: Record<MetricType, keyof ModelMetricPoint> = {
        wape: 'avg_wape',
        mae: 'avg_mae',
        rmse: 'avg_rmse',
    };

    const activeKey = dataKeyMap[metric];

    // Format YAxis ticks
    const formatYTick = (val: number) => {
        if (metric === 'wape') {
            return `${Number(val).toFixed(0)}%`;
        }

        return Number(val).toLocaleString('vi-VN');
    };

    return (
        <div className="w-full" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                    <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        dy={8}
                    />
                    <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatYTick}
                    />
                    <Tooltip content={<MetricCustomTooltip metric={metric} />} />
                    <Bar dataKey={activeKey as string} radius={[6, 6, 0, 0]} maxBarSize={56}>
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={
                                    entry.is_selected
                                        ? '#9333ea' // Purple for currently selected model
                                        : '#38bdf8' // Sky for candidate models
                                }
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
