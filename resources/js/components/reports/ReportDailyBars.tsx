import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface ReportDailyBarsProps {
    title?: string;
    data: { label: string; revenue: number; profit: number }[];
}

const compact = (v: number) =>
    Math.abs(v) >= 1_000_000
        ? `${(v / 1_000_000).toFixed(1)}tr`
        : `${Math.round(v / 1000)}k`;

export default function ReportDailyBars({ title, data }: ReportDailyBarsProps) {
    const safeData = Array.isArray(data) ? data : [];

    if (safeData.length === 0) {
        return null;
    }

    return (
        <div className="border-b border-zinc-100 px-4 pt-4 pb-2 dark:border-zinc-800">
            {title && (
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {title}
                </h3>
            )}
            <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={safeData}>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e4e4e7"
                            vertical={false}
                        />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis
                            tick={{ fontSize: 11 }}
                            tickFormatter={compact}
                            width={44}
                        />
                        <Tooltip
                            formatter={(value) =>
                                Number(value).toLocaleString('vi-VN')
                            }
                        />
                        <Legend
                            formatter={(value: string) => (
                                <span className="text-xs text-zinc-600 dark:text-zinc-300">
                                    {value}
                                </span>
                            )}
                        />
                        <Bar
                            dataKey="revenue"
                            name="Doanh thu"
                            fill="#0284c7"
                            radius={[3, 3, 0, 0]}
                        />
                        <Bar
                            dataKey="profit"
                            name="Lợi nhuận"
                            fill="#10b981"
                            radius={[3, 3, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
