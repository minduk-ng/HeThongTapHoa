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
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-extrabold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase">
                    TỔNG ORDER
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-zinc-900 dark:text-zinc-100">
                        {stats.total_orders}
                    </span>
                    <span className="text-xs text-zinc-400 font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        đang mở
                    </span>
                </div>
            </div>

            {/* Card 2: ĐANG CHỜ */}
            <div className="bg-amber-950 text-white border border-amber-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-extrabold tracking-wider text-amber-300 uppercase">
                    ĐANG CHỜ
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-amber-100">
                        {stats.waiting_items}
                    </span>
                    <span className="text-xs text-amber-200 font-semibold px-2 py-0.5 rounded-full bg-amber-900/80 border border-amber-700">
                        món cần làm
                    </span>
                </div>
            </div>

            {/* Card 3: HOÀN THÀNH */}
            <div className="bg-emerald-950 text-white border border-emerald-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-extrabold tracking-wider text-emerald-300 uppercase">
                    HOÀN THÀNH
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-emerald-100">
                        {stats.completed_items}
                    </span>
                    <span className="text-xs text-emerald-200 font-semibold px-2 py-0.5 rounded-full bg-emerald-900/80 border border-emerald-700">
                        đơn xong hôm nay
                    </span>
                </div>
            </div>

            {/* Card 4: CẢNH BÁO */}
            <div className="bg-amber-900 text-white border border-amber-700 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-extrabold tracking-wider text-yellow-300 uppercase">
                    CẢNH BÁO
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-yellow-100">
                        {stats.warning_orders}
                    </span>
                    <span className="text-xs text-yellow-200 font-semibold px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600">
                        trễ &gt;10' hoặc gọi thêm
                    </span>
                </div>
            </div>
        </div>
    );
}
