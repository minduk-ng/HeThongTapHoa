import { Head, router, usePage } from '@inertiajs/react';
import {
    Sparkles,
    Volume2,
    VolumeX,
    RefreshCw,
    Coffee,
    UtensilsCrossed,
    Layers,
    Maximize2,
    Minimize2,
    ChefHat,
    ClipboardList,
    AlertTriangle,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import { useReverbStatus } from '../pos/hooks/useReverbStatus';
import AvatarDropdown from '../../../components/AvatarDropdown';
import type { PageProps } from '../../../types/auth';
import type { KitchenOrderData } from './components/KitchenOrderCard';
import KitchenOrderCard from './components/KitchenOrderCard';
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
    const [activeStation, setActiveStation] = useState<
        'all' | 'bar' | 'kitchen'
    >('all');

    const { status: reverbStatus } = useReverbStatus();
    const { auth } = usePage<PageProps>().props;
    const user = auth.user;

    // Fullscreen toggle
    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const handleFullscreenChange = () =>
            setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () =>
            document.removeEventListener(
                'fullscreenchange',
                handleFullscreenChange,
            );
    }, []);
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    };

    const [isWsPopoverOpen, setIsWsPopoverOpen] = useState(false);
    const wsPopoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                wsPopoverRef.current &&
                !wsPopoverRef.current.contains(event.target as Node)
            ) {
                setIsWsPopoverOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);

        return () =>
            document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const statusConfig = {
        connected: {
            dotClass: 'bg-emerald-500',
            label: 'Socket',
            tooltip: 'Kết nối ổn',
        },
        connecting: {
            dotClass: 'bg-amber-500 animate-pulse',
            label: 'Kết nối…',
            tooltip: 'Đang kết nối lại WebSocket…',
        },
        disconnected: {
            dotClass: 'bg-rose-500',
            label: 'Mất kết nối',
            tooltip:
                'Mất kết nối WebSocket — dữ liệu có thể không cập nhật tức thời',
        },
    };

    const wsConfig = statusConfig[reverbStatus];

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

    const lastEventRef = useRef<{ key: string; time: number }>({
        key: '',
        time: 0,
    });

    const isDuplicateEvent = useCallback((eventKey: string) => {
        const now = Date.now();

        if (
            lastEventRef.current.key === eventKey &&
            now - lastEventRef.current.time < 1000
        ) {
            return true;
        }

        lastEventRef.current = { key: eventKey, time: now };

        return false;
    }, []);

    // Realtime WebSocket Listener via Reverb for instant new order tickets & completions & chime audio
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const channel = window.Echo.channel('kitchen-channel');

            const handleOrderSent = (payload?: any) => {
                const eventKey = `OrderSentToKitchen_${payload?.order_id || ''}_${payload?.action_type || ''}`;

                if (isDuplicateEvent(eventKey)) {
                    return;
                }

                if (
                    payload?.action_type !== 'cancel_order' &&
                    payload?.action_type !== 'cancel_item'
                ) {
                    if (soundEnabledRef.current) {
                        playKitchenChime();
                    }
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

            channel
                .listen('.OrderSentToKitchen', handleOrderSent)
                .listen('.OrderCompleted', () => handleReload())
                .listen('.TableTransferred', () => handleReload());

            return () => {
                window.Echo.leave('kitchen-channel');
            };
        }
    }, [isDuplicateEvent]);

    // Real-time calculation of warning orders on Frontend without server requests
    const liveWarningCount = orders.filter((o) => {
        const createdAtTime = new Date(o.created_at).getTime();
        const elapsedMinutes = Math.max(
            0,
            Math.floor((nowTime - createdAtTime) / 60000),
        );

        return elapsedMinutes >= 10 || !!o.has_additional_items;
    }).length;

    const computedStats = {
        ...stats,
        total_orders: orders.length,
        waiting_items: orders.reduce(
            (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
            0,
        ),
        warning_orders: liveWarningCount,
    };

    // Station filtering logic (Bar = drinks/cà phê/trà; Kitchen = food/bánh/đồ ăn)
    const filteredOrders = orders
        .map((order) => {
            if (activeStation === 'all') {
                return order;
            }

            const filteredItems = order.items.filter((item) => {
                const catName = (
                    item.menu_item?.category?.name || ''
                ).toLowerCase();
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

            if (filteredItems.length === 0) {
                return null;
            }

            return {
                ...order,
                items: filteredItems,
            };
        })
        .filter(Boolean) as KitchenOrderData[];

    return (
        <DashboardLayout fullWidth={true} hideNavbar={true}>
            <Head title="Màn hình Bếp & Chế biến món" />

            <div className="flex h-full w-full flex-col overflow-hidden">
                {/* Top Toolbar — single row, 3 zones */}
                <div className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    {/* Left: Title + WS */}
                    <div className="flex shrink-0 items-center space-x-2">
                        <ChefHat className="h-5 w-5 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                        <h1 className="font-display text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                            Bếp
                        </h1>
                        <div className="relative" ref={wsPopoverRef}>
                            <button
                                type="button"
                                onClick={() =>
                                    setIsWsPopoverOpen(!isWsPopoverOpen)
                                }
                                className="flex items-center space-x-1 rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800"
                                title="Xem chi tiết kết nối mạng"
                            >
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${wsConfig.dotClass}`}
                                />
                                <span className="text-[10px] font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
                                    {wsConfig.label}
                                </span>
                            </button>

                            {isWsPopoverOpen && (
                                <div className="animate-in fade-in slide-in-from-top-1 absolute top-full left-0 z-50 mt-1.5 flex w-56 flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-3.5 text-zinc-700 shadow-lg duration-150 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                                    <div className="flex items-center justify-between border-b border-zinc-100 pb-2 dark:border-zinc-900">
                                        <span className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                            Thông tin mạng
                                        </span>
                                        <span
                                            className={`h-2 w-2 rounded-full ${wsConfig.dotClass}`}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5 text-[11px]">
                                        <div className="flex items-center justify-between">
                                            <span className="dark:text-zinc-550 text-zinc-400">
                                                Kết nối:
                                            </span>
                                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                                WebSocket (Reverb)
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="dark:text-zinc-550 text-zinc-400">
                                                Trạng thái:
                                            </span>
                                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                                {reverbStatus === 'connected'
                                                    ? 'Đã kết nối'
                                                    : reverbStatus ===
                                                        'connecting'
                                                      ? 'Đang kết nối'
                                                      : 'Mất kết nối'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center: Station Filter Pills */}
                    <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
                        <button
                            type="button"
                            onClick={() => setActiveStation('all')}
                            className={`flex items-center space-x-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                activeStation === 'all'
                                    ? 'bg-white text-sky-600 shadow-xs dark:bg-zinc-900 dark:text-sky-400'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                        >
                            <Layers className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>Tất cả</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveStation('bar')}
                            className={`flex items-center space-x-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                activeStation === 'bar'
                                    ? 'bg-white text-sky-600 shadow-xs dark:bg-zinc-900 dark:text-sky-400'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                        >
                            <Coffee className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>Pha chế</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveStation('kitchen')}
                            className={`flex items-center space-x-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                activeStation === 'kitchen'
                                    ? 'bg-white text-sky-600 shadow-xs dark:bg-zinc-900 dark:text-sky-400'
                                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                        >
                            <UtensilsCrossed className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>Bếp nóng</span>
                        </button>
                    </div>

                    {/* Right: Stats + Actions */}
                    <div className="ml-auto flex items-center space-x-2">
                        <div className="flex items-center space-x-1.5 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2 py-1 dark:border-sky-900/60 dark:bg-sky-950/40">
                            <ClipboardList className="h-3.5 w-3.5 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                            <span className="text-[11px] font-bold text-sky-700 tabular-nums dark:text-sky-300">
                                {computedStats.total_orders}
                            </span>
                        </div>
                        <div className="flex items-center space-x-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 px-2 py-1 dark:border-rose-900/60 dark:bg-rose-950/40">
                            <AlertTriangle className="h-3.5 w-3.5 stroke-[1.5] text-rose-600 dark:text-rose-400" />
                            <span className="text-[11px] font-bold text-rose-700 tabular-nums dark:text-rose-300">
                                {computedStats.warning_orders}
                            </span>
                        </div>

                        <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

                        <button
                            type="button"
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className={`rounded-lg border p-1.5 transition-colors ${
                                soundEnabled
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
                            }`}
                            title={
                                soundEnabled
                                    ? 'Chuông thông báo: Đang bật'
                                    : 'Chuông thông báo: Đã tắt'
                            }
                        >
                            {soundEnabled ? (
                                <Volume2 className="h-4 w-4 stroke-[1.5]" />
                            ) : (
                                <VolumeX className="h-4 w-4 stroke-[1.5]" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                router.reload({ only: ['orders', 'stats'] })
                            }
                            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                            title="Làm mới dữ liệu bếp"
                        >
                            <RefreshCw className="h-4 w-4 stroke-[1.5]" />
                        </button>

                        <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                            title={
                                isFullscreen
                                    ? 'Thoát toàn màn hình'
                                    : 'Mở toàn màn hình'
                            }
                        >
                            {isFullscreen ? (
                                <Minimize2 className="h-4 w-4 stroke-[1.5]" />
                            ) : (
                                <Maximize2 className="h-4 w-4 stroke-[1.5]" />
                            )}
                        </button>

                        <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
                        <AvatarDropdown user={user} />
                    </div>
                </div>

                {/* Full-width Order Cards Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {filteredOrders.length === 0 ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-white p-8 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-200/60 bg-sky-50 text-sky-600 dark:border-sky-800/60 dark:bg-sky-950/60">
                                <Sparkles className="h-8 w-8 stroke-[1.5]" />
                            </div>
                            <h3 className="font-display text-base font-bold text-zinc-800 dark:text-zinc-200">
                                Hiện không có món nào chờ chế biến
                            </h3>
                            <p className="mt-1 max-w-sm text-xs text-zinc-400">
                                {activeStation === 'all'
                                    ? 'Tất cả các món order từ POS đã được hoàn thành xuất sắc!'
                                    : `Không có món nào thuộc khu vực ${activeStation === 'bar' ? 'Quầy Pha Chế' : 'Bếp Nóng'} đang chờ.`}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {filteredOrders.map((order) => (
                                <KitchenOrderCard
                                    key={order.id}
                                    order={order}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
