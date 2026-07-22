import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import { Sparkles } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import KitchenStatsHeader from './components/KitchenStatsHeader';
import KitchenOrderCard, { KitchenOrderData } from './components/KitchenOrderCard';

interface KitchenDisplayProps {
    orders: KitchenOrderData[];
    stats: {
        total_orders: number;
        waiting_items: number;
        completed_items: number;
        warning_orders: number;
    };
}

export default function KitchenDisplay({ orders, stats }: KitchenDisplayProps) {
    const [nowTime, setNowTime] = useState<number>(Date.now());

    // Tick every 5 seconds to update real-time minute counters and warning counts locally
    useEffect(() => {
        const timer = setInterval(() => {
            setNowTime(Date.now());
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    // Non-blocking 5s partial reload for new kitchen orders
    useEffect(() => {
        const timer = setInterval(() => {
            router.reload({
                only: ['orders', 'stats'],
                onError: () => { /* silently skip if server/DB is unreachable */ },
            });
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    // Real-time calculation of warning orders on Frontend without server requests
    const liveWarningCount = orders.filter((o) => {
        const createdAtTime = new Date(o.created_at).getTime();
        const elapsedMinutes = Math.max(0, Math.floor((nowTime - createdAtTime) / 60000));
        return elapsedMinutes >= 10 || !!o.has_additional_items;
    }).length;

    const computedStats = {
        ...stats,
        total_orders: orders.length,
        waiting_items: orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0),
        warning_orders: liveWarningCount,
    };

    return (
        <DashboardLayout>
            <Head title="Màn hình Bếp & Chế biến món" />

            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                {/* Header Title */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                            Danh sách món chế biến
                        </h1>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            Hiển thị món cần pha chế theo thời gian thực (Bếp & Quầy Bar)
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => router.reload({ only: ['orders', 'stats'] })}
                        className="px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 flex items-center space-x-1.5 shadow-xs"
                    >
                        <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Làm mới dữ liệu</span>
                    </button>
                </div>

                {/* Top KPI Statistics Header Cards */}
                <KitchenStatsHeader stats={computedStats} />

                {/* Order Cards Grid */}
                {orders.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-xs">
                        <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 border border-sky-200/60 dark:border-sky-800/60 flex items-center justify-center mx-auto mb-3">
                            <Sparkles className="w-8 h-8 stroke-[1.5]" />
                        </div>
                        <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                            Hiện không có đơn order nào chờ chế biến
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                            Tất cả món đã được nhân viên pha chế hoàn thành xuất sắc!
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {orders.map((order) => (
                            <KitchenOrderCard key={order.id} order={order} />
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
