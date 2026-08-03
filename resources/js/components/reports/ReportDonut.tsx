import {
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';

const COLORS = [
    '#0284c7',
    '#10b981',
    '#f59e0b',
    '#a855f7',
    '#f43f5e',
    '#71717a',
];

interface ReportDonutProps {
    title?: string;
    data: { name: string; value: number }[];
    formatValue?: (v: number) => string;
}

export default function ReportDonut({
    title,
    data,
    formatValue = (v) => String(v),
}: ReportDonutProps) {
    const safeData = (Array.isArray(data) ? data : []).filter(
        (d) => d.value > 0,
    );

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
            <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={safeData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                        >
                            {safeData.map((_, idx) => (
                                <Cell
                                    key={idx}
                                    fill={COLORS[idx % COLORS.length]}
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value) => formatValue(Number(value))}
                        />
                        <Legend
                            verticalAlign="bottom"
                            formatter={(value: string) => (
                                <span className="text-xs text-zinc-600 dark:text-zinc-300">
                                    {value}
                                </span>
                            )}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
