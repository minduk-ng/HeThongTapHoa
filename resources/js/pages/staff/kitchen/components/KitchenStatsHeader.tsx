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
            <div className="bg-blue-600 dark:bg-blue-900 text-white border border-blue-500/40 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-black tracking-wider text-blue-200 uppercase">
                    TỔNG ORDER
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-white">
                        {stats.total_orders}
                    </span>
                    <span className="text-xs text-blue-100 font-bold px-2.5 py-0.5 rounded-full bg-blue-700/80 dark:bg-blue-950 border border-blue-400/30">
                        đang mở
                    </span>
                </div>
            </div>

            {/* Card 2: ĐANG CHỜ */}
            <div className="bg-slate-900 dark:bg-slate-950 text-white border border-slate-700 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-black tracking-wider text-slate-400 uppercase">
                    ĐANG CHỜ
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-slate-100">
                        {stats.waiting_items}
                    </span>
                    <span className="text-xs text-slate-300 font-bold px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                        món cần làm
                    </span>
                </div>
            </div>

            {/* Card 3: HOÀN THÀNH */}
            <div className="bg-teal-700 dark:bg-teal-900 text-white border border-teal-600/40 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-black tracking-wider text-teal-200 uppercase">
                    HOÀN THÀNH
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-white">
                        {stats.completed_items}
                    </span>
                    <span className="text-xs text-teal-100 font-bold px-2.5 py-0.5 rounded-full bg-teal-800/80 border border-teal-500/40">
                        đơn xong hôm nay
                    </span>
                </div>
            </div>

            {/* Card 4: CẢNH BÁO */}
            <div className="bg-amber-600 dark:bg-amber-800 text-white border border-amber-500/40 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-black tracking-wider text-amber-200 uppercase">
                    CẢNH BÁO
                </span>
                <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-4xl font-black text-amber-100">
                        {stats.warning_orders}
                    </span>
                    <span className="text-xs text-amber-100 font-bold px-2.5 py-0.5 rounded-full bg-amber-700/80 dark:bg-amber-950 border border-amber-500/30">
                        trễ &gt;10' hoặc gọi thêm
                    </span>
                </div>
            </div>
        </div>
    );
}
