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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1">
            {/* Card 1: TỔNG ORDER */}
            <div className="flex flex-col justify-between rounded-2xl border border-blue-500/30 bg-blue-600/90 p-5 text-white shadow-xs dark:bg-blue-900/80">
                <span className="text-xs font-black tracking-wider text-blue-200 uppercase">
                    TỔNG ORDER
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-white">
                        {stats.total_orders}
                    </span>
                    <span className="rounded-full border border-blue-400/30 bg-blue-700/80 px-2.5 py-0.5 text-xs font-bold text-blue-100 dark:bg-blue-950">
                        đang mở
                    </span>
                </div>
            </div>

            {/* Card 2: ĐANG CHỜ */}
            <div className="flex flex-col justify-between rounded-2xl border border-slate-700/80 bg-slate-800 p-5 text-white shadow-xs dark:bg-slate-900">
                <span className="text-xs font-black tracking-wider text-slate-300 uppercase">
                    ĐANG CHỜ
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-slate-100">
                        {stats.waiting_items}
                    </span>
                    <span className="rounded-full border border-slate-600 bg-slate-700/80 px-2.5 py-0.5 text-xs font-bold text-slate-300 dark:bg-slate-800">
                        món cần làm
                    </span>
                </div>
            </div>

            {/* Card 4: CẢNH BÁO */}
            <div className="flex flex-col justify-between rounded-2xl border border-amber-500/30 bg-amber-600/90 p-5 text-white shadow-xs dark:bg-amber-800/80">
                <span className="text-xs font-black tracking-wider text-amber-200 uppercase">
                    CẢNH BÁO
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-amber-100">
                        {stats.warning_orders}
                    </span>
                    <span className="rounded-full border border-amber-500/30 bg-amber-700/80 px-2.5 py-0.5 text-xs font-bold text-amber-100 dark:bg-amber-950">
                        trễ &gt;10' hoặc gọi thêm
                    </span>
                </div>
            </div>
        </div>
    );
}
