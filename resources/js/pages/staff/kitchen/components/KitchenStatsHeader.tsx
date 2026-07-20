import React from 'react';

interface KitchenStatsHeaderProps {
    stats: {
        total_orders: number;
        waiting_items: number;
        completed_items: number;
        warning_orders: number;
    };
}

export default function KitchenStatsHeader({ stats }: KitchenStatsHeaderProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: TỔNG ORDER */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <span className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                    TỔNG ORDER
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100">
                        {stats.total_orders}
                    </span>
                    <span className="text-xs text-zinc-400 font-medium">đang mở</span>
                </div>
            </div>

            {/* Card 2: ĐANG CHỜ */}
            <div className="bg-amber-950 text-white border border-amber-900 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <span className="text-xs font-bold tracking-wider text-amber-300/80 uppercase">
                    ĐANG CHỜ
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-amber-100">
                        {stats.waiting_items}
                    </span>
                    <span className="text-xs text-amber-300/70 font-medium">món cần làm</span>
                </div>
            </div>

            {/* Card 3: HOÀN THÀNH */}
            <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <span className="text-xs font-bold tracking-wider text-emerald-700 dark:text-emerald-300 uppercase">
                    HOÀN THÀNH
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-emerald-900 dark:text-emerald-100">
                        {stats.completed_items}
                    </span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">đơn xong</span>
                </div>
            </div>

            {/* Card 4: CẢNH BÁO */}
            <div className="bg-amber-100/80 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <span className="text-xs font-bold tracking-wider text-amber-800 dark:text-amber-300 uppercase">
                    CẢNH BÁO
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-amber-900 dark:text-amber-100">
                        {stats.warning_orders}
                    </span>
                    <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                         order trễ hoặc gọi thêm
                    </span>
                </div>
            </div>
        </div>
    );
}
