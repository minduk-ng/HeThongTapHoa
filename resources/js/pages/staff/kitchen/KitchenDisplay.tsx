import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    ChefHat,
    ClipboardList,
    Coffee,
    Flame,
    Layers,
    ListOrdered,
    Maximize2,
    Minimize2,
    RefreshCw,
    Sparkles,
    UtensilsCrossed,
    Volume2,
    VolumeX,
} from 'lucide-react';
import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
} from 'react';
import AvatarDropdown from '../../../components/AvatarDropdown';
import KitchenPrintTicket from '../../../components/KitchenPrintTicket';
import { useCommandQueue } from '../../../hooks/useCommandQueue';
import DashboardLayout from '../../../layouts/DashboardLayout';
import type { PageProps } from '../../../types/auth';
import { useReverbStatus } from '../pos/hooks/useReverbStatus';
import type { KitchenOrderData } from './components/KitchenOrderCard';
import KitchenOrderCard from './components/KitchenOrderCard';
import type {
    DispatchMode,
    KitchenStationOption,
    QueueGroup,
} from './utils/dispatchQueue';
import { filterGroupsByStation, orderGroups } from './utils/dispatchQueue';
import { playKitchenChime } from './utils/kitchenAudio';

interface KitchenDisplayProps {
    orders: KitchenOrderData[];
    stats: {
        total_orders: number;
        waiting_items: number;
        completed_items: number;
        warning_orders: number;
    };
    workGroups?: QueueGroup[];
    serverNow?: string;
    stations?: KitchenStationOption[];
    dispatchSettings?: {
        target_minutes: number;
        long_wait_minutes: number;
        version: number;
    };
    categoryStations?: Array<{
        id: number;
        name: string;
        kitchen_station_id: number | null;
    }>;
    kitchenReadiness?: {
        ready: boolean;
        unlinkedCount: number;
    };
}

const RELOAD_ONLY = [
    'workGroups',
    'serverNow',
    'orders',
    'stats',
    'stations',
    'dispatchSettings',
    'categoryStations',
    'kitchenReadiness',
] as const;

export default function KitchenDisplay({
    orders,
    stats,
    workGroups,
    serverNow,
    stations,
    dispatchSettings,
    categoryStations,
    kitchenReadiness,
}: KitchenDisplayProps) {
    const [nowTime, setNowTime] = useState<number>(0);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    // Durable station-ID filter; never match by station/category/item names.
    const [activeStationId, setActiveStationId] = useState<number | 'all'>(
        'all',
    );
    const [mode, setMode] = useState<DispatchMode>('fifo');
    const [printOrder, setPrintOrder] = useState<KitchenOrderData | null>(null);
    const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
    const [settingsTarget, setSettingsTarget] = useState<string>('');
    const [settingsLongWait, setSettingsLongWait] = useState<string>('');
    const [adminError, setAdminError] = useState<string | null>(null);
    const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

    const csrfToken = (): string => {
        const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

        return match ? decodeURIComponent(match[1]) : '';
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!dispatchSettings) {
            return;
        }

        setIsSavingSettings(true);
        setAdminError(null);

        try {
            const response = await fetch('/staff/kitchen/settings', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': csrfToken(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    target_minutes: Number(
                        settingsTarget || dispatchSettings.target_minutes,
                    ),
                    long_wait_minutes: Number(
                        settingsLongWait || dispatchSettings.long_wait_minutes,
                    ),
                    expected_version: dispatchSettings.version,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setAdminError(
                    data.message ||
                        data.error ||
                        `Lỗi lưu cài đặt (${response.status})`,
                );
                setIsSavingSettings(false);

                return;
            }

            setIsSavingSettings(false);
            router.reload({ only: [...RELOAD_ONLY], onError: () => {} });
        } catch {
            setIsSavingSettings(false);
            setAdminError('Lỗi kết nối khi lưu cài đặt điều phối.');
        }
    };

    const handleCategoryStationChange = async (
        categoryId: number,
        stationId: number | null,
    ) => {
        setAdminError(null);

        try {
            const response = await fetch(
                `/staff/kitchen/categories/${categoryId}/station`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-XSRF-TOKEN': csrfToken(),
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({ kitchen_station_id: stationId }),
                },
            );

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setAdminError(
                    data.message ||
                        data.error ||
                        `Lỗi cập nhật trạm (${response.status})`,
                );

                return;
            }

            router.reload({ only: [...RELOAD_ONLY], onError: () => {} });
        } catch {
            setAdminError('Lỗi kết nối khi cập nhật trạm danh mục.');
        }
    };

    const [tickTime, setTickTime] = useState<number>(0);
    const receivedAtMsRef = useRef<number>(0);
    const baseServerNowMsRef = useRef<number>(0);

    useEffect(() => {
        if (printOrder) {
            const timer = setTimeout(() => {
                window.print();
                setPrintOrder(null);
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [printOrder]);

    const { status: reverbStatus } = useReverbStatus();
    const isDisconnected = reverbStatus !== 'connected';

    const { auth } = usePage<PageProps>().props;
    const user = auth.user;
    const canManageDeadline = Boolean(
        auth?.is_admin ||
        (user as { is_admin?: boolean })?.is_admin ||
        auth?.permissions?.includes('kitchen.dispatch.manage') ||
        (user as { permissions?: string[] })?.permissions?.includes(
            'kitchen.dispatch.manage',
        ),
    );

    const { queue, enqueue, retry, discard } = useCommandQueue({
        reconcile: () =>
            router.reload({
                only: [...RELOAD_ONLY],
                onError: () => {},
            }),
    });
    const hasQueued = queue.some(
        (c) => c.status === 'pending' || c.status === 'flushing',
    );
    const failedCommands = queue.filter((c) => c.status === 'failed');

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

    // Tick every 5 seconds to update real-time minute counters locally
    useEffect(() => {
        queueMicrotask(() => setNowTime(Date.now()));
        const timer = setInterval(() => {
            setNowTime(Date.now());
        }, 5000);

        return () => clearInterval(timer);
    }, []);

    // Track serverNow timestamps and local clock baseline
    useEffect(() => {
        receivedAtMsRef.current = Date.now();
        baseServerNowMsRef.current = serverNow
            ? Date.parse(serverNow)
            : Date.now();
        setTickTime(baseServerNowMsRef.current);
    }, [serverNow]);

    const computeNowMs = useCallback(() => {
        if (baseServerNowMsRef.current === 0) {
            return serverNow ? Date.parse(serverNow) : Date.now();
        }

        return (
            baseServerNowMsRef.current + (Date.now() - receivedAtMsRef.current)
        );
    }, [serverNow]);

    // Rebuild ordering on each 15s clock tick
    useEffect(() => {
        const timer = setInterval(() => {
            setTickTime(computeNowMs());
        }, 15000);

        return () => clearInterval(timer);
    }, [computeNowMs]);

    // Rebuild ordering on tab visibility restore
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                setTickTime(computeNowMs());
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () =>
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
    }, [computeNowMs]);

    const serverAdjustedNowMs =
        tickTime > 0 ? tickTime : serverNow ? Date.parse(serverNow) : 0;

    // Derived orderedGroups: rebuilds on data changes, mode, station, or clock tick
    const orderedGroups = useMemo(() => {
        if (!workGroups || workGroups.length === 0) {
            return [];
        }

        const currentNow =
            serverAdjustedNowMs > 0
                ? serverAdjustedNowMs
                : serverNow
                  ? Date.parse(serverNow)
                  : 0;
        const filtered = filterGroupsByStation(workGroups, activeStationId);

        return orderGroups(filtered, mode, currentNow);
    }, [workGroups, activeStationId, mode, serverAdjustedNowMs, serverNow]);

    // Refetch every 30s while visible
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                router.reload({
                    only: [...RELOAD_ONLY],
                    onError: () => {},
                });
            }
        }, 30000);

        return () => clearInterval(timer);
    }, []);

    // Refetch on reconnect (transition to connected)
    const prevReverbStatusRef = useRef(reverbStatus);
    useEffect(() => {
        if (
            prevReverbStatusRef.current !== 'connected' &&
            reverbStatus === 'connected'
        ) {
            router.reload({
                only: [...RELOAD_ONLY],
                onError: () => {},
            });
        }

        prevReverbStatusRef.current = reverbStatus;
    }, [reverbStatus]);

    // Refetch on window online event
    useEffect(() => {
        const handleOnline = () => {
            router.reload({
                only: [...RELOAD_ONLY],
                onError: () => {},
            });
        };

        window.addEventListener('online', handleOnline);

        return () => window.removeEventListener('online', handleOnline);
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

    // Realtime WebSocket Listener via Reverb for instant updates
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const channel = window.Echo.private('kitchen-channel');

            const handleOrderSent = (payload?: {
                order_id?: number;
                action_type?: string;
            }) => {
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
                    only: [...RELOAD_ONLY],
                    onError: () => {},
                });
            };

            const handleReload = () => {
                router.reload({
                    only: [...RELOAD_ONLY],
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

    // Fallback when workGroups is absent (e.g. pre-backfill legacy read):
    // show orders unfiltered — never guess station from category/item names.
    const filteredOrders = orders;

    const hasWorkGroupsProp = Array.isArray(workGroups);
    const displayCount = hasWorkGroupsProp
        ? orderedGroups.length
        : filteredOrders.length;

    const activeStationName =
        activeStationId === 'all'
            ? null
            : (stations?.find((s) => s.id === activeStationId)?.name ?? null);

    return (
        <DashboardLayout fullWidth={true} hideNavbar={true}>
            <Head title="Màn hình Bếp & Chế biến món" />

            <div className="flex h-full w-full flex-col overflow-hidden">
                {/* Top Toolbar */}
                <div className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                    {/* Left: Title + WS */}
                    <div className="flex shrink-0 items-center space-x-2">
                        <ChefHat className="h-6 w-6 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                        <h1 className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                            Bếp
                        </h1>
                        <div className="relative" ref={wsPopoverRef}>
                            <button
                                type="button"
                                onClick={() =>
                                    setIsWsPopoverOpen(!isWsPopoverOpen)
                                }
                                className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800"
                                title="Xem chi tiết kết nối mạng"
                            >
                                <span
                                    className={`h-2 w-2 rounded-full ${wsConfig.dotClass}`}
                                />
                                <span className="text-[11px] font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
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

                    {/* Center: Station Filter Pills (durable station IDs) + Dispatch Mode Toggle */}
                    <div className="flex items-center space-x-3">
                        <div className="flex items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                            <button
                                type="button"
                                onClick={() => setActiveStationId('all')}
                                className={`flex items-center space-x-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                                    activeStationId === 'all'
                                        ? 'bg-white text-sky-600 shadow-xs dark:bg-zinc-900 dark:text-sky-400'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                                }`}
                            >
                                <Layers className="h-4 w-4 stroke-[1.5]" />
                                <span>Tất cả</span>
                            </button>
                            {(stations ?? []).map((station) => {
                                const isActive = activeStationId === station.id;

                                return (
                                    <button
                                        key={station.id}
                                        type="button"
                                        onClick={() =>
                                            setActiveStationId(station.id)
                                        }
                                        disabled={!station.is_active}
                                        title={
                                            station.is_active
                                                ? `Lọc theo trạm #${station.id}`
                                                : 'Trạm đã tắt — chỉ giữ lịch sử'
                                        }
                                        className={`flex items-center space-x-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                                            isActive
                                                ? 'bg-white text-sky-600 shadow-xs dark:bg-zinc-900 dark:text-sky-400'
                                                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                                        }`}
                                    >
                                        {station.code === 'general' ? (
                                            <UtensilsCrossed className="h-4 w-4 stroke-[1.5]" />
                                        ) : (
                                            <Coffee className="h-4 w-4 stroke-[1.5]" />
                                        )}
                                        <span>{station.name}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Dispatch Mode Toggle: FIFO vs Priority */}
                        <div className="flex items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                            <button
                                type="button"
                                onClick={() => setMode('fifo')}
                                className={`flex items-center space-x-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                                    mode === 'fifo'
                                        ? 'bg-white text-sky-600 shadow-xs dark:bg-zinc-900 dark:text-sky-400'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                                }`}
                                title="Thứ tự gửi (FIFO)"
                            >
                                <ListOrdered className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>FIFO</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('priority')}
                                className={`flex items-center space-x-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                                    mode === 'priority'
                                        ? 'bg-white text-amber-600 shadow-xs dark:bg-zinc-900 dark:text-amber-400'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                                }`}
                                title="Điều phối ưu tiên (Min-Heap theo hạn & chờ lâu)"
                            >
                                <Flame className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>Ưu tiên</span>
                            </button>
                        </div>
                    </div>

                    {/* Right: Stats + Actions */}
                    <div className="ml-auto flex items-center space-x-2">
                        <div className="flex items-center space-x-1.5 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-1.5 dark:border-sky-900/60 dark:bg-sky-950/40">
                            <ClipboardList className="h-4 w-4 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                            <span className="text-xs font-bold text-sky-700 tabular-nums dark:text-sky-300">
                                {computedStats.total_orders}
                            </span>
                        </div>
                        <div className="flex items-center space-x-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 px-2.5 py-1.5 dark:border-rose-900/60 dark:bg-rose-950/40">
                            <AlertTriangle className="h-4 w-4 stroke-[1.5] text-rose-600 dark:text-rose-400" />
                            <span className="text-xs font-bold text-rose-700 tabular-nums dark:text-rose-300">
                                {computedStats.warning_orders}
                            </span>
                        </div>

                        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

                        <button
                            type="button"
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className={`rounded-lg border p-2.5 transition-colors ${
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
                                <Volume2 className="h-5 w-5 stroke-[1.5]" />
                            ) : (
                                <VolumeX className="h-5 w-5 stroke-[1.5]" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                router.reload({
                                    only: [...RELOAD_ONLY],
                                })
                            }
                            className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                            title="Làm mới dữ liệu bếp"
                        >
                            <RefreshCw className="h-5 w-5 stroke-[1.5]" />
                        </button>

                        <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                            title={
                                isFullscreen
                                    ? 'Thoát toàn màn hình'
                                    : 'Mở toàn màn hình'
                            }
                        >
                            {isFullscreen ? (
                                <Minimize2 className="h-5 w-5 stroke-[1.5]" />
                            ) : (
                                <Maximize2 className="h-5 w-5 stroke-[1.5]" />
                            )}
                        </button>

                        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />
                        <AvatarDropdown user={user} />
                    </div>
                </div>

                {/* Stale / Disconnected Banner */}
                {isDisconnected && (
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rose-300 bg-rose-50 px-5 py-2 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4 shrink-0 stroke-[2] text-rose-600 dark:text-rose-400" />
                            <span>
                                Mất kết nối mạng / Đang kết nối lại — Dữ liệu
                                hiển thị có thể chưa mới nhất. Chỉnh sửa hạn
                                điều phối tạm thời bị khóa.
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                router.reload({
                                    only: [...RELOAD_ONLY],
                                    onError: () => {},
                                })
                            }
                            className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-rose-700"
                        >
                            Tải lại
                        </button>
                    </div>
                )}

                {/* Migration-unavailable: queue read incomplete until legacy backfill links all pending work */}
                {kitchenReadiness && !kitchenReadiness.ready && (
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4 shrink-0 stroke-[2] text-amber-600 dark:text-amber-400" />
                            <span>
                                Hàng đợi bếp chưa đầy đủ — có{' '}
                                {kitchenReadiness.unlinkedCount} món chờ chưa
                                liên kết sau backfill. Chạy{' '}
                                <span className="font-mono">
                                    kitchen:backfill-dispatch
                                </span>{' '}
                                trước khi tin toàn bộ danh sách.
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                router.reload({
                                    only: [...RELOAD_ONLY],
                                    onError: () => {},
                                })
                            }
                            className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-amber-700"
                        >
                            Tải lại
                        </button>
                    </div>
                )}

                {/* Offline Command Queue status strip */}
                {failedCommands.length > 0 && (
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rose-200 bg-rose-50/90 px-5 py-2 dark:border-rose-900/60 dark:bg-rose-950/40">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 stroke-[1.5] text-rose-600 dark:text-rose-400" />
                            <span className="truncate text-xs font-medium text-rose-700 dark:text-rose-300">
                                {failedCommands.length} thao tác chưa được đồng
                                bộ do lỗi mạng
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                failedCommands.forEach((c) => retry(c.id))
                            }
                            className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-rose-700"
                        >
                            Thử lại tất cả
                        </button>
                    </div>
                )}
                {hasQueued && failedCommands.length === 0 && (
                    <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50/90 px-5 py-2 dark:border-amber-900/60 dark:bg-amber-950/40">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            Đang đồng bộ lệnh khi mạng chưa kết nối…
                        </span>
                    </div>
                )}

                {/* Dispatch admin (kitchen.dispatch.manage only): settings + station mapping, future batches only */}
                {canManageDeadline && (
                    <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-5 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <button
                            type="button"
                            onClick={() => {
                                if (!isAdminOpen && dispatchSettings) {
                                    setSettingsTarget(
                                        String(dispatchSettings.target_minutes),
                                    );
                                    setSettingsLongWait(
                                        String(
                                            dispatchSettings.long_wait_minutes,
                                        ),
                                    );
                                }

                                setIsAdminOpen(!isAdminOpen);
                            }}
                            className="flex items-center gap-2 text-xs font-bold text-zinc-600 hover:text-sky-600 dark:text-zinc-300"
                        >
                            <span>
                                {isAdminOpen
                                    ? '▾ Ẩn quản trị điều phối'
                                    : '▸ Quản trị điều phối (chỉ batch mới)'}
                            </span>
                            {dispatchSettings && (
                                <span className="font-mono font-medium text-zinc-400 tabular-nums">
                                    target {dispatchSettings.target_minutes}p /
                                    chờ lâu {dispatchSettings.long_wait_minutes}
                                    p / v{dispatchSettings.version}
                                </span>
                            )}
                        </button>

                        {isAdminOpen && (
                            <div className="mt-2 flex flex-col gap-3 pb-2">
                                {adminError && (
                                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                                        {adminError}
                                    </div>
                                )}

                                {dispatchSettings && (
                                    <form
                                        onSubmit={handleSaveSettings}
                                        className="flex flex-wrap items-end gap-2"
                                    >
                                        <label className="flex flex-col gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                                            Target (phút)
                                            <input
                                                type="number"
                                                min={1}
                                                value={settingsTarget}
                                                onChange={(e) =>
                                                    setSettingsTarget(
                                                        e.target.value,
                                                    )
                                                }
                                                disabled={isDisconnected}
                                                className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                                            Chờ lâu (phút)
                                            <input
                                                type="number"
                                                min={1}
                                                value={settingsLongWait}
                                                onChange={(e) =>
                                                    setSettingsLongWait(
                                                        e.target.value,
                                                    )
                                                }
                                                disabled={isDisconnected}
                                                className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
                                            />
                                        </label>
                                        <button
                                            type="submit"
                                            disabled={
                                                isSavingSettings ||
                                                isDisconnected
                                            }
                                            className="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                                        >
                                            {isSavingSettings
                                                ? 'Đang lưu…'
                                                : 'Lưu (batch mới)'}
                                        </button>
                                        <span className="text-[11px] text-zinc-400">
                                            Thay đổi chỉ áp dụng cho batch gửi
                                            mới, không tính lại hạn cũ.
                                        </span>
                                    </form>
                                )}

                                {categoryStations &&
                                    categoryStations.length > 0 && (
                                        <div className="flex flex-col gap-1.5">
                                            {categoryStations.map((cat) => (
                                                <div
                                                    key={cat.id}
                                                    className="flex items-center gap-2 text-xs"
                                                >
                                                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-200">
                                                        {cat.name}
                                                    </span>
                                                    <select
                                                        value={
                                                            cat.kitchen_station_id ??
                                                            ''
                                                        }
                                                        onChange={(e) =>
                                                            handleCategoryStationChange(
                                                                cat.id,
                                                                e.target
                                                                    .value ===
                                                                    ''
                                                                    ? null
                                                                    : Number(
                                                                          e
                                                                              .target
                                                                              .value,
                                                                      ),
                                                            )
                                                        }
                                                        disabled={
                                                            isDisconnected
                                                        }
                                                        className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                                                    >
                                                        <option value="">
                                                            General (mặc định)
                                                        </option>
                                                        {(stations ?? []).map(
                                                            (s) => (
                                                                <option
                                                                    key={s.id}
                                                                    value={s.id}
                                                                    disabled={
                                                                        !s.is_active
                                                                    }
                                                                >
                                                                    {s.name}
                                                                    {!s.is_active
                                                                        ? ' (tắt)'
                                                                        : ''}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </div>
                                            ))}
                                            <span className="text-[11px] text-zinc-400">
                                                Đổi trạm chỉ áp dụng cho món gửi
                                                mới; nhóm đang làm giữ trạm đã
                                                chốt lúc gửi.
                                            </span>
                                        </div>
                                    )}
                            </div>
                        )}
                    </div>
                )}

                {/* Cards Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {displayCount === 0 ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-white p-8 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                            <Sparkles className="mb-3 h-8 w-8 stroke-[1.5] text-sky-500" />
                            <h3 className="font-display text-base font-bold text-zinc-800 dark:text-zinc-200">
                                Hiện không có món nào chờ chế biến
                            </h3>
                            <p className="mt-1 max-w-sm text-xs text-zinc-400">
                                {activeStationId === 'all' || !activeStationName
                                    ? 'Tất cả các món order từ POS đã được hoàn thành xuất sắc!'
                                    : `Không có món nào thuộc trạm ${activeStationName} đang chờ.`}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {hasWorkGroupsProp
                                ? orderedGroups.map((group) => {
                                      const order = orders.find(
                                          (o) => o.id === group.orderId,
                                      ) || {
                                          id: group.orderId,
                                          order_code: `#${group.orderId}`,
                                          created_at: group.sentAt,
                                          status: 'pending',
                                          table: null,
                                          items: [],
                                      };

                                      return (
                                          <KitchenOrderCard
                                              key={group.id}
                                              order={order}
                                              group={group}
                                              nowMs={serverAdjustedNowMs}
                                              canManageDeadline={
                                                  canManageDeadline
                                              }
                                              isDisconnected={isDisconnected}
                                              queueCommands={queue}
                                              onEnqueue={enqueue}
                                              onRetry={retry}
                                              onDiscard={discard}
                                              onPrint={setPrintOrder}
                                          />
                                      );
                                  })
                                : filteredOrders.map((order) => (
                                      <KitchenOrderCard
                                          key={order.id}
                                          order={order}
                                          queueCommands={queue}
                                          onEnqueue={enqueue}
                                          onRetry={retry}
                                          onDiscard={discard}
                                          onPrint={setPrintOrder}
                                      />
                                  ))}
                        </div>
                    )}
                </div>
            </div>

            {printOrder && (
                <KitchenPrintTicket
                    orderNumber={printOrder.order_code}
                    tableNumber={printOrder.table?.table_number || 'Mang về'}
                    items={printOrder.items
                        .filter(
                            (item) =>
                                item.status === 'pending' ||
                                item.status === 'processing',
                        )
                        .map((item) => ({
                            name: item.menu_item?.name || 'Món ăn',
                            quantity: item.quantity,
                            note: item.note ?? null,
                        }))}
                    note={printOrder.note ?? null}
                    createdAtLabel={new Date(
                        printOrder.created_at,
                    ).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                />
            )}
        </DashboardLayout>
    );
}
