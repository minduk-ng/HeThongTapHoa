import { Head, router, usePage } from '@inertiajs/react';
import {
    ConciergeBell,
    CheckCircle,
    Clock,
    RefreshCw,
    Maximize2,
    Minimize2,
    ClipboardList,
    Layers,
    CheckSquare,
    Square,
    CheckCheck,
    XCircle,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import AvatarDropdown from '../../../components/AvatarDropdown';
import { useCommandQueue } from '../../../hooks/useCommandQueue';
import DashboardLayout from '../../../layouts/DashboardLayout';
import type { QueueCommand } from '../../../lib/commandQueue';
import type { PageProps } from '../../../types/auth';
import { useReverbStatus } from '../pos/hooks/useReverbStatus';

interface ServingItemData {
    id: string;
    order_id: number;
    order_code: string;
    table_number: string;
    table_area: string;
    items: Array<{
        id: number;
        name: string;
        quantity: number;
        note?: string | null;
    }>;
    completed_at: string;
}

interface ServingDisplayProps {
    servingQueue: ServingItemData[];
}

function ElapsedTimer({ completedAt }: { completedAt: string }) {
    const [elapsed, setElapsed] = useState('');

    useEffect(() => {
        const tick = () => {
            const diff = Date.now() - new Date(completedAt).getTime();
            if (diff < 0) { setElapsed('0:00'); return; }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setElapsed(`${mins}:${String(secs).padStart(2, '0')}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [completedAt]);

    return (
        <span className="tabular-nums text-xs text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3 stroke-[1.5]" />
            {elapsed}
        </span>
    );
}

function cardIdsInCommand(c: QueueCommand): string[] {
    const p = c.payload as { __card_id?: string; __card_ids?: string[] };
    return p.__card_ids ?? (p.__card_id ? [p.__card_id] : []);
}

export default function ServingDisplay({ servingQueue }: ServingDisplayProps) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user;
    const { status: reverbStatus } = useReverbStatus();
    const { queue: commands, enqueue, retry, discard } = useCommandQueue({
        reconcile: () => router.reload({ only: ['servingQueue'], onError: () => {} }),
    });

    const [queue, setQueue] = useState<ServingItemData[]>(
        () => (Array.isArray(servingQueue) ? servingQueue : Object.values(servingQueue || {})) as ServingItemData[]
    );
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isWsPopoverOpen, setIsWsPopoverOpen] = useState(false);
    const wsPopoverRef = useRef<HTMLDivElement>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [syncIds, setSyncIds] = useState<Set<string>>(new Set());
    const cmdCardIdsRef = useRef<Set<string>>(new Set());

    // Sync cards removed once their queued command syncs / is discarded
    useEffect(() => {
        const active = new Set<string>();
        const all = new Set<string>();
        commands.forEach((c) => {
            const ids = cardIdsInCommand(c);
            ids.forEach((id) => all.add(id));
            if (c.status !== 'failed') ids.forEach((id) => active.add(id));
        });

        setSyncIds(active);

        const gone = [...cmdCardIdsRef.current].filter((id) => !all.has(id));
        if (gone.length > 0) {
            const goneSet = new Set(gone);
            setQueue((prev) => prev.filter((card) => !goneSet.has(card.id)));
            setSelectedIds((prev) => new Set([...prev].filter((id) => !goneSet.has(id))));
        }
        cmdCardIdsRef.current = all;
    }, [commands]);

    // Sync when Inertia reloads props (keep cards with any live command — pending/flushing/failed — never clobber)
    useEffect(() => {
        const safe = (Array.isArray(servingQueue) ? servingQueue : Object.values(servingQueue || {})) as ServingItemData[];
        setQueue((prev) => {
            const retained = prev.filter((card) => cmdCardIdsRef.current.has(card.id));
            const safeIds = new Set(safe.map((card) => card.id));
            return [...safe, ...retained.filter((card) => !safeIds.has(card.id))];
        });
        const validIds = new Set(safe.map((card) => card.id));
        setSelectedIds((prev) => new Set([...prev].filter((id) => validIds.has(id) || cmdCardIdsRef.current.has(id))));
    }, [servingQueue]);

    // Fullscreen
    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    };

    // WS Popover close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wsPopoverRef.current && !wsPopoverRef.current.contains(event.target as Node)) {
                setIsWsPopoverOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Realtime WebSocket
    const lastEventRef = useRef<{ key: string; time: number }>({ key: '', time: 0 });
    const isDuplicateEvent = useCallback((eventKey: string) => {
        const now = Date.now();
        if (lastEventRef.current.key === eventKey && now - lastEventRef.current.time < 1000) return true;
        lastEventRef.current = { key: eventKey, time: now };
        return false;
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const channel = window.Echo.channel('pos-channel');

            const handleItemsReady = (payload: any) => {
                const eventKey = `ItemsReadyToServe_${payload?.order_id}`;
                if (isDuplicateEvent(eventKey)) return;

                const newCard: ServingItemData = {
                    id: `${payload.order_id}_${Date.now()}`,
                    order_id: payload.order_id,
                    order_code: payload.order_code,
                    table_number: payload.table_number,
                    table_area: payload.table_area,
                    items: (payload.completed_items || []).map((i: any) => ({
                        id: i.id,
                        name: i.name,
                        quantity: i.quantity,
                        note: i.note || null,
                    })),
                    completed_at: payload.completed_at,
                };
                setQueue(prev => [newCard, ...prev]);
            };

            const handleOrderCompleted = () => {
                router.reload({ only: ['servingQueue'], onError: () => {} });
            };

            const handleTableStatus = (payload: any) => {
                if (payload?.action === 'checkout') {
                    const tableNum = payload.table_number || '';
                    if (tableNum) {
                        setQueue(prev => prev.filter(c => c.table_number !== tableNum));
                    }
                }
            };

            channel
                .listen('.ItemsReadyToServe', handleItemsReady)
                .listen('.OrderCompleted', handleOrderCompleted)
                .listen('.TableStatusUpdated', handleTableStatus);

            return () => { window.Echo.leave('pos-channel'); };
        }
    }, [isDuplicateEvent]);

    const markSync = useCallback((id: string) => {
        setSyncIds((prev) => new Set(prev).add(id));
    }, []);

    // Mark served via offline command queue — card stays until command syncs
    const handleServed = useCallback((card: ServingItemData) => {
        if (commands.some((c) => cardIdsInCommand(c).includes(card.id))) return;
        markSync(card.id);
        enqueue('serving.mark-served', '/staff/serving/mark-served', {
            item_ids: card.items.map((i) => i.id),
            __card_id: card.id,
        });
    }, [commands, enqueue, markSync]);

    // Filter pills — extract unique tables from queue
    const tableFilters = React.useMemo(() => {
        const map = new Map<string, { area: string; count: number }>();
        queue.forEach(card => {
            const existing = map.get(card.table_number);
            if (existing) {
                existing.count++;
            } else {
                map.set(card.table_number, { area: card.table_area, count: 1 });
            }
        });
        return Array.from(map.entries()).map(([tableNumber, info]) => ({
            tableNumber,
            area: info.area,
            count: info.count,
        }));
    }, [queue]);

    const filteredQueue = activeFilter === 'all'
        ? queue
        : queue.filter(c => c.table_number === activeFilter);

    const totalItems = queue.reduce((sum, c) => sum + c.items.reduce((s, i) => s + i.quantity, 0), 0);

    // Toggle card selection
    const toggleSelect = useCallback((cardId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(cardId)) {
                next.delete(cardId);
            } else {
                next.add(cardId);
            }
            return next;
        });
    }, []);

    // Select all visible (filtered) cards
    const selectAll = useCallback(() => {
        setSelectedIds(new Set(filteredQueue.map(c => c.id)));
    }, [filteredQueue]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    // Batch mark served via queue — one command covering all selected cards
    const handleBatchServed = useCallback(() => {
        if (selectedIds.size === 0) return;
        if ([...selectedIds].some((id) => commands.some((c) => cardIdsInCommand(c).includes(id)))) return;

        const allItemIds = queue
            .filter((c) => selectedIds.has(c.id))
            .flatMap((c) => c.items.map((i) => i.id));
        [...selectedIds].forEach((id) => markSync(id));
        enqueue('serving.mark-served', '/staff/serving/mark-served', {
            item_ids: allItemIds,
            __card_ids: [...selectedIds],
        });
    }, [queue, selectedIds, commands, enqueue, markSync]);

    const batchDisabled =
        selectedIds.size === 0 ||
        [...selectedIds].some((id) => commands.some((c) => cardIdsInCommand(c).includes(id)));
    const batchSyncing = [...selectedIds].some((id) => syncIds.has(id));

    // WS status config
    const statusConfig = {
        connected: { dotClass: 'bg-emerald-500', label: 'Socket' },
        connecting: { dotClass: 'bg-amber-500 animate-pulse', label: 'Kết nối…' },
        disconnected: { dotClass: 'bg-rose-500', label: 'Mất kết nối' },
    };
    const wsConfig = statusConfig[reverbStatus];

    return (
        <DashboardLayout fullWidth={true} hideNavbar={true}>
            <Head title="Màn hình Phục vụ" />

            <div className="flex h-full w-full flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                    {/* Left: Title + WS */}
                    <div className="flex shrink-0 items-center space-x-2">
                        <ConciergeBell className="h-6 w-6 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                        <h1 className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                            Phục vụ
                        </h1>
                        <div className="relative" ref={wsPopoverRef}>
                            <button
                                type="button"
                                onClick={() => setIsWsPopoverOpen(!isWsPopoverOpen)}
                                className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800"
                                title="Xem chi tiết kết nối mạng"
                            >
                                <span className={`h-2 w-2 rounded-full ${wsConfig.dotClass}`} />
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
                                        <span className={`h-2 w-2 rounded-full ${wsConfig.dotClass}`} />
                                    </div>
                                    <div className="flex flex-col gap-1.5 text-[11px]">
                                        <div className="flex items-center justify-between">
                                            <span className="text-zinc-400">Kết nối:</span>
                                            <span className="font-medium text-zinc-800 dark:text-zinc-200">WebSocket (Reverb)</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-zinc-400">Trạng thái:</span>
                                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                                {reverbStatus === 'connected' ? 'Đã kết nối' : reverbStatus === 'connecting' ? 'Đang kết nối' : 'Mất kết nối'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center: Selection Action Bar OR Filter Pills */}
                    <div className="flex-1 min-w-0 overflow-x-auto">
                        {selectedIds.size > 0 ? (
                            <div className="flex items-center gap-2">
                                <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                                    <CheckSquare className="h-4 w-4 stroke-[1.5]" />
                                    <span className="tabular-nums">Đã chọn {selectedIds.size} đơn</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={selectAll}
                                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                >
                                    Chọn tất cả
                                </button>
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                >
                                    Bỏ chọn
                                </button>
                                <div className="h-5 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />
                                <button
                                    type="button"
                                    onClick={handleBatchServed}
                                    disabled={batchDisabled}
                                    className="flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <CheckCheck className="h-4 w-4 stroke-[1.5]" />
                                    <span>{batchSyncing ? 'Đang đồng bộ…' : `Phục vụ đã chọn (${selectedIds.size})`}</span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveFilter('all')}
                                    className={`flex shrink-0 items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                        activeFilter === 'all'
                                            ? 'bg-sky-600 text-white shadow-xs'
                                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    <Layers className="h-4 w-4 stroke-[1.5]" />
                                    <span>Tất cả</span>
                                </button>
                                {tableFilters.map(f => (
                                    <button
                                        key={f.tableNumber}
                                        type="button"
                                        onClick={() => setActiveFilter(f.tableNumber)}
                                        className={`flex shrink-0 items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                            activeFilter === f.tableNumber
                                                ? 'bg-sky-600 text-white shadow-xs'
                                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        <span>{f.tableNumber}</span>
                                        <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                                            activeFilter === f.tableNumber
                                                ? 'bg-white/20'
                                                : 'bg-zinc-200 dark:bg-zinc-700'
                                        }`}>
                                            {f.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Stats + Actions + Avatar */}
                    <div className="ml-auto flex items-center space-x-2 shrink-0">
                        <div className="flex items-center space-x-1.5 rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-1.5 dark:border-sky-900/60 dark:bg-sky-950/40">
                            <ClipboardList className="h-4 w-4 stroke-[1.5] text-sky-600 dark:text-sky-400" />
                            <span className="text-xs font-bold text-sky-700 tabular-nums dark:text-sky-300">
                                {queue.length}
                            </span>
                        </div>
                        <div className="flex items-center space-x-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1.5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
                            <ConciergeBell className="h-4 w-4 stroke-[1.5] text-emerald-600 dark:text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                                {totalItems}
                            </span>
                        </div>

                        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

                        <button
                            type="button"
                            onClick={() => router.reload({ only: ['servingQueue'], onError: () => {} })}
                            className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                            title="Làm mới dữ liệu"
                        >
                            <RefreshCw className="h-5 w-5 stroke-[1.5]" />
                        </button>

                        <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                            title={isFullscreen ? 'Thoát toàn màn hình' : 'Mở toàn màn hình'}
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

                {/* Serving Cards Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {filteredQueue.length === 0 ? (
                        <div className="flex items-start justify-start pt-12 pl-8">
                            <div className="flex flex-col items-start space-y-3">
                                <ConciergeBell className="w-10 h-10 stroke-[1.5] text-zinc-300 dark:text-zinc-700" />
                                <div>
                                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        Chưa có món nào cần phục vụ
                                    </p>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        Các món hoàn thành từ bếp sẽ xuất hiện tại đây
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {filteredQueue.map((card) => {
                                const isSelected = selectedIds.has(card.id);
                                const isSyncing = syncIds.has(card.id);
                                const failedCmd = commands.find(
                                    (c) => c.status === 'failed' && cardIdsInCommand(c).includes(card.id),
                                );
                                const handleServeClick = (e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (failedCmd) {
                                        retry(failedCmd.id);
                                        return;
                                    }
                                    handleServed(card);
                                };
                                return (
                                    <div
                                        key={card.id}
                                        className={`bg-white dark:bg-zinc-900 border rounded-2xl shadow-xs flex flex-col overflow-hidden cursor-pointer transition-all duration-150 ${
                                            isSelected
                                                ? 'border-sky-300 ring-2 ring-sky-500 dark:border-sky-700'
                                                : 'border-zinc-200/80 dark:border-zinc-800/80'
                                        } ${isSyncing ? 'opacity-60' : ''}`}
                                        onClick={() => toggleSelect(card.id)}
                                    >
                                        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 stroke-[1.5] text-sky-600 dark:text-sky-400 shrink-0" />
                                                ) : (
                                                    <Square className="w-4 h-4 stroke-[1.5] text-zinc-300 dark:text-zinc-600 shrink-0" />
                                                )}
                                                <span className="font-display font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                                    {card.table_number}
                                                </span>
                                                {card.table_area && (
                                                    <span className="text-[10px] font-medium text-zinc-400 truncate">
                                                        {card.table_area}
                                                    </span>
                                                )}
                                            </div>
                                            <ElapsedTimer completedAt={card.completed_at} />
                                        </div>

                                        <div className="flex-1 px-4 py-2.5 space-y-1.5 min-h-0">
                                            {card.items.map((item) => (
                                                <div key={item.id} className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="tabular-nums text-xs font-bold text-zinc-900 dark:text-zinc-100 shrink-0">
                                                            {item.quantity}x
                                                        </span>
                                                        <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                                            {item.name}
                                                        </span>
                                                    </div>
                                                    {item.note && (
                                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 italic max-w-[120px] truncate">
                                                            {item.note}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-2">
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={handleServeClick}
                                                    disabled={isSyncing}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                                                >
                                                    <CheckCircle className="w-3.5 h-3.5 stroke-[1.5]" />
                                                    {isSyncing ? 'Đang đồng bộ…' : 'Đã phục vụ'}
                                                </button>
                                            </div>
                                            {failedCmd && (
                                                <div className="flex items-center justify-between gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                                        <XCircle className="h-3.5 w-3.5 shrink-0 stroke-[1.5]" />
                                                        <span className="truncate">
                                                            {failedCmd.error || 'Không thể đồng bộ. Kiểm tra mạng và thử lại.'}
                                                        </span>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); retry(failedCmd.id); }}
                                                            className="rounded-md bg-rose-600 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-rose-700"
                                                        >
                                                            Thử lại
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); discard(failedCmd.id); }}
                                                            className="rounded-md border border-rose-300 px-2 py-1 text-[10px] font-bold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40"
                                                        >
                                                            Bỏ qua
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
