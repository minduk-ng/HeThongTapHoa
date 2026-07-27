import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Head, router } from '@inertiajs/react';
import { Sparkles, Volume2, VolumeX, RefreshCw, Coffee, UtensilsCrossed, Layers } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import KitchenOrderCard, { KitchenOrderData } from './components/KitchenOrderCard';
import VoidItemModal from './components/VoidItemModal';
import KitchenLogPanel from './components/KitchenLogPanel';
import { SystemLogEntry } from '../pos/components/POSLogTab';
import { playKitchenChime } from './utils/kitchenAudio';
import { useReverbStatus } from '../pos/hooks/useReverbStatus';

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
    const [kitchenLogs, setKitchenLogs] = useState<SystemLogEntry[]>([]);
    
    const { status: reverbStatus, latencyMs } = useReverbStatus();

    const statusConfig = {
        connected: {
            dotClass: 'bg-emerald-500',
            label: 'Socket',
            tooltip: latencyMs !== null ? `${latencyMs}ms` : 'Kết nối ổn',
        },
        connecting: {
            dotClass: 'bg-amber-500 animate-pulse',
            label: 'Kết nối…',
            tooltip: 'Đang kết nối lại WebSocket…',
        },
        disconnected: {
            dotClass: 'bg-rose-500',
            label: 'Mất kết nối',
            tooltip: 'Mất kết nối WebSocket — dữ liệu có thể không cập nhật tức thời',
        },
    };

    const wsConfig = statusConfig[reverbStatus];

    const addKitchenLog = useCallback((type: 'sent' | 'received' | 'error', message: string, details?: string) => {
        const d = new Date();
        const timestamp = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const newEntry: SystemLogEntry = {
            id: `${Date.now()}_${Math.random()}`,
            timestamp,
            type,
            source: 'Kitchen',
            message,
            details,
        };
        setKitchenLogs((prev) => [newEntry, ...prev.slice(0, 99)]);
    }, []);

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

    const lastEventRef = useRef<{ key: string; time: number }>({ key: '', time: 0 });

    const isDuplicateEvent = useCallback((eventKey: string) => {
        const now = Date.now();
        if (lastEventRef.current.key === eventKey && now - lastEventRef.current.time < 1000) {
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
                if (isDuplicateEvent(eventKey)) return;

                const tableStr = payload?.table_number ? `Bàn #${payload.table_number}` : 'vé order';

                if (payload?.action_type === 'cancel_order') {
                    addKitchenLog('received', `Hủy toàn bộ đơn hàng tại ${tableStr}`, payload?.log_message || 'Xóa khỏi danh sách vé');
                } else if (payload?.action_type === 'cancel_item') {
                    addKitchenLog('received', `Đã hủy 1 món khỏi ${tableStr}`, payload?.log_message || 'Cập nhật danh sách vé');
                } else {
                    addKitchenLog('received', `Nhận vé order mới từ ${tableStr}`, 'Bắt đầu chế biến');
                    if (soundEnabledRef.current) {
                        playKitchenChime();
                    }
                }

                router.reload({
                    only: ['orders', 'stats'],
                    onError: () => {},
                });
            };

            const handleReload = (eventName: string, payload?: any) => {
                const eventKey = `${eventName}_${payload?.order_id || payload?.table_id || ''}`;
                if (isDuplicateEvent(eventKey)) return;

                if (eventName === 'OrderCompleted') {
                    addKitchenLog('sent', 'Đã xác nhận hoàn thành chế biến đơn hàng');
                } else if (eventName === 'TableTransferred') {
                    addKitchenLog('received', 'Cập nhật lại tên bàn chuyển / gộp từ POS');
                } else {
                    addKitchenLog('received', 'Cập nhật lại danh sách vé order chế biến');
                }

                router.reload({
                    only: ['orders', 'stats'],
                    onError: () => {},
                });
            };

            channel
                .listen('.OrderSentToKitchen', handleOrderSent)
                .listen('.OrderCompleted', (data: any) => handleReload('OrderCompleted', data))
                .listen('.TableTransferred', (data: any) => handleReload('TableTransferred', data));

            return () => {
                window.Echo.leave('kitchen-channel');
            };
        }
    }, [addKitchenLog, isDuplicateEvent]);

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
        <DashboardLayout fullWidth={true} hideNavbar={true}>
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
                onLogEvent={addKitchenLog}
            />

            {/* Split Screen Container (Left Sidebar Stats ↔ Right Order Cards Grid) */}
            <div className="h-full w-full p-4 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0">
                    {/* Left Sidebar (3.5 cols): Control Panel & Stats Cards Stack */}
                    <div className="lg:col-span-4 xl:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between h-full min-h-0 shadow-xs space-y-3 overflow-hidden">
                        <div className="shrink-0 space-y-3">
                            {/* Title & Bell Icon Toggle */}
                            <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-2">
                                    <h1 className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                                        Màn hình Bếp
                                    </h1>
                                    <button
                                        type="button"
                                        onClick={() => setSoundEnabled(!soundEnabled)}
                                        className={`p-1.5 rounded-xl border transition-colors ${
                                            soundEnabled
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                                : 'bg-zinc-100 text-zinc-400 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700'
                                        }`}
                                        title={soundEnabled ? 'Chuông thông báo: Đang bật' : 'Chuông thông báo: Đã tắt'}
                                    >
                                        {soundEnabled ? <Volume2 className="w-4 h-4 stroke-[1.5]" /> : <VolumeX className="w-4 h-4 stroke-[1.5]" />}
                                    </button>

                                    {/* WebSocket Status Indicator */}
                                    <button
                                        type="button"
                                        className="flex items-center space-x-1.5 px-2 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group relative"
                                        title={wsConfig.tooltip}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${wsConfig.dotClass}`} />
                                        <span className="text-[10px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                                            {wsConfig.label}
                                        </span>
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        addKitchenLog('sent', 'Làm mới dữ liệu bếp');
                                        router.reload({ only: ['orders', 'stats'] });
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                    title="Làm mới dữ liệu bếp"
                                >
                                    <RefreshCw className="w-4 h-4 stroke-[1.5]" />
                                </button>
                            </div>

                            {/* Station Filter Tabs */}
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                    Khu vực chế biến:
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setActiveStation('all')}
                                        className={`py-1 px-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
                                            activeStation === 'all'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <Layers className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>Tất cả</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveStation('bar')}
                                        className={`py-1 px-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
                                            activeStation === 'bar'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <Coffee className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>Pha chế</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveStation('kitchen')}
                                        className={`py-1 px-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
                                            activeStation === 'kitchen'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-xs'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <UtensilsCrossed className="w-3.5 h-3.5 stroke-[1.5]" />
                                        <span>Bếp nóng</span>
                                    </button>
                                </div>
                            </div>

                            {/* 2-Stat Row: Total Active Orders & Warnings */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2.5 rounded-xl bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-900/60 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-sky-800 dark:text-sky-200">Tổng đơn:</span>
                                    <span className="text-sm font-bold tabular-nums text-sky-700 dark:text-sky-300">
                                        {computedStats.total_orders}
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-rose-800 dark:text-rose-200">Cảnh báo:</span>
                                    <span className="text-sm font-bold tabular-nums text-rose-700 dark:text-rose-300">
                                        {computedStats.warning_orders}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Kitchen Event Log Box */}
                        <KitchenLogPanel
                            logs={kitchenLogs}
                            onClearLogs={() => setKitchenLogs([])}
                        />
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
