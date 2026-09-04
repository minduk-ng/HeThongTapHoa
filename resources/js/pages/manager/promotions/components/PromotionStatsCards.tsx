import { TrendingUp, Activity, BadgePercent, TrendingDown } from 'lucide-react';
import React from 'react';

interface Stats {
    total_campaigns?: number;
    total_orders: number;
    total_revenue: number;
    total_discount: number;
    avg_discount: number;
    roi: number;
}

const fmt = (v: number) => Number(v || 0).toLocaleString('vi-VN') + ' đ';

export default function PromotionStatsCards({ stats }: { stats: Stats }) {
    const cards = [
        { label: 'Tổng doanh thu từ KM', value: fmt(stats.total_revenue), icon: TrendingUp, color: 'text-sky-600' },
        { label: 'Tổng lượt đã dùng', value: `${stats.total_orders} lượt`, icon: Activity, color: 'text-emerald-600' },
        { label: 'Giá trị giảm trung bình', value: fmt(stats.avg_discount), icon: BadgePercent, color: 'text-amber-600' },
        { label: 'Chi phí khuyến mãi', value: fmt(stats.total_discount), icon: TrendingDown, color: 'text-rose-600' },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
                <div key={c.label} className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm text-zinc-500 dark:text-zinc-400">{c.label}</h3>
                        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                            <c.icon className={`w-4 h-4 ${c.color}`} />
                        </div>
                    </div>
                    <div className="font-display text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{c.value}</div>
                </div>
            ))}
        </div>
    );
}
