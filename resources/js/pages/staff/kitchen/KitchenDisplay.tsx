import React, { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import { Sparkles, Volume2, VolumeX, RefreshCw, Coffee, UtensilsCrossed, Layers } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import KitchenStatsHeader from './components/KitchenStatsHeader';
import KitchenOrderCard, { KitchenOrderData } from './components/KitchenOrderCard';
import VoidItemModal from './components/VoidItemModal';
import { playKitchenChime } from './utils/kitchenAudio';

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
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [activeStation, setActiveStation] = useState<'all' | 'bar' | 'kitchen'>('all');

    // Void Item/Order Modal state
    const [voidModalState, setVoidModalState] = useState<{
        isOpen: boolean;
        mode: 'item' | 'order';
        orderItemId: number | null;
        tableId: number | null;
        menuItemName: string;
    }>({
        isOpen: false,
        mode: 'item',
        orderItemId: null,
        tableId: null,
        menuItemName: '',
    });

    // Tick every 5 seconds to update real-time minute counters and warning counts locally
    useEffect(() => {
        const timer = setInterval(() => {
            setNowTime(Date.now());
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const soundEnabledRef = useRef<boolean>(soundEnabled);
    useEffect(() => {
        soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    // Realtime WebSocket Listener via Reverb for instant new order tickets & completions & chime audio
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const privateChannel = window.Echo.private('kitchen-channel');
            const publicChannel = window.Echo.channel('kitchen-channel');

            const handleOrderSent = () => {
                if (soundEnabledRef.current) {
                    playKitchenChime();
                }
                router.reload({
                    only: ['orders', 'stats'],
                    onError: () => {},
                });
            };

            const handleReload = () => {
                router.reload({
                    only: ['orders', 'stats'],
                    onError: () => {},
                });
            };

            privateChannel
                .listen('.OrderSentToKitchen', handleOrderSent)
                .listen('OrderSentToKitchen', handleOrderSent)
                .listen('.OrderCompleted', handleReload)
                .listen('OrderCompleted', handleReload)
                .listen('.TableTransferred', handleReload)
                .listen('TableTransferred', handleReload);

            publicChannel
                .listen('.OrderSentToKitchen', handleOrderSent)
                .listen('OrderSentToKitchen', handleOrderSent)
                .listen('.OrderCompleted', handleReload)
                .listen('OrderCompleted', handleReload)
                .listen('.TableTransferred', handleReload)
                .listen('TableTransferred', handleReload);

            return () => {
                window.Echo.leave('kitchen-channel');
            };
        }
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

    // Station filtering logic (Bar = drinks/cà phê/trà; Kitchen = food/bánh/đồ ăn)
    const filteredOrders = orders
        .map((order) => {
            if (activeStation === 'all') return order;

            const filteredItems = order.items.filter((item) => {
                const catName = (item.menu_item?.category?.name || '').toLowerCase();
                const itemName = (item.menu_item?.name || '').toLowerCase();
                const isDrink =
                    catName.includes('uống') ||
                    catName.includes('cà phê') ||
                    catName.includes('trà') ||
                    catName.includes('nước') ||
                    catName.includes('bar') ||
                    itemName.includes('cà phê') ||
                    itemName.includes('trà');

                return activeStation === 'bar' ? isDrink : !isDrink;
            });

            if (filteredItems.length === 0) return null;
            return {
                ...order,
                items: filteredItems,
            };
        })
        .filter(Boolean) as KitchenOrderData[];

    const handleOpenVoidModal = (itemId: number, itemName: string) => {
        setVoidModalState({
            isOpen: true,
            mode: 'item',
            orderItemId: itemId,
            tableId: null,
            menuItemName: itemName,
        });
    };

    const handleOpenCancelOrderModal = (tableId: number, orderCode: string) => {
        setVoidModalState({
            isOpen: true,
            mode: 'order',
            orderItemId: null,
            tableId: tableId,
            menuItemName: `Đơn ${orderCode}`,
        });
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Màn hình Bếp & Chế biến món" />

            <VoidItemModal
                isOpen={voidModalState.isOpen}
                onClose={() =>
                    setVoidModalState({
                        isOpen: false,
                        mode: 'item',
                        orderItemId: null,
                        tableId: null,
                        menuItemName: '',
                    })
                }
                mode={voidModalState.mode}
                orderItemId={voidModalState.orderItemId}
                tableId={voidModalState.tableId}
                menuItemName={voidModalState.menuItemName}
            />

            {/* Split Screen Container (Left Sidebar Stats ↔ Right Order Cards Grid) */}
            <div className="h-[calc(100vh-4rem)] w-full p-4 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0">
                    {/* Left Sidebar (3.5 cols): Control Panel & Stats Cards Stack */}
                    <div className="lg:col-span-4 xl:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between h-full overflow-y-auto shadow-xs space-y-5">
                        <div className="space-y-4">
                            {/* Title & Actions */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <h1 className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                                        Màn hình Bếp
                                    </h1>
                                    <p className="text-xs text-zinc-400 mt-0.5">Quản lý pha chế & chế biến</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => router.reload({ only: ['orders', 'stats'] })}
                                    className="p-2 text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                    title="Làm mới dữ liệu bếp"
                                >
                                    <RefreshCw className="w-4 h-4 stroke-[1.5]" />
                                </button>
                            </div>

                            {/* Sound Alert Chime Toggle Switch */}
                            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-between">
                                <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                    {soundEnabled ? (
                                        <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 stroke-[1.5]" />
                                    ) : (
                                        <VolumeX className="w-4 h-4 text-zinc-400 stroke-[1.5]" />
                                    )}
                                    <span>Âm thanh chuông báo</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSoundEnabled(!soundEnabled)}
                                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                                        soundEnabled
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                            : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                                    }`}
                                >
                                    {soundEnabled ? 'Đang bật' : 'Đã tắt'}
                                </button>
                            </div>

                            {/* Station Filter Tabs */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                    Khu vực chế biến:
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setActiveStation('all')}
                                        className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
                                            activeStation === 'all'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <Layers className="w-3.5 h-3.5" />
                                        <span>Tất cả</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveStation('bar')}
                                        className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
                                            activeStation === 'bar'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <Coffee className="w-3.5 h-3.5" />
                                        <span>Pha chế</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveStation('kitchen')}
                                        className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
                                            activeStation === 'kitchen'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <UtensilsCrossed className="w-3.5 h-3.5" />
                                        <span>Bếp nóng</span>
                                    </button>
                                </div>
                            </div>

                            {/* Vertical Stats Stack */}
                            <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80">
                                <KitchenStatsHeader stats={computedStats} />
                            </div>
                        </div>
                    </div>

                    {/* Right Main Panel (8.5 cols): Scrollable Order Cards Grid */}
                    <div className="lg:col-span-8 xl:col-span-9 h-full min-h-0 overflow-y-auto pr-1">
                        {filteredOrders.length === 0 ? (
                            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 p-8 shadow-xs">
                                <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 border border-sky-200/60 dark:border-sky-800/60 flex items-center justify-center mb-3">
                                    <Sparkles className="w-8 h-8 stroke-[1.5]" />
                                </div>
                                <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                                    Hiện không có món nào chờ chế biến
                                </h3>
                                <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                                    {activeStation === 'all'
                                        ? 'Tất cả các món order từ POS đã được hoàn thành xuất sắc!'
                                        : `Không có món nào thuộc khu vực ${activeStation === 'bar' ? 'Quầy Pha Chế' : 'Bếp Nóng'} đang chờ.`}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredOrders.map((order) => (
                                    <KitchenOrderCard
                                        key={order.id}
                                        order={order}
                                        onCancelItem={handleOpenVoidModal}
                                        onCancelOrder={handleOpenCancelOrderModal}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
