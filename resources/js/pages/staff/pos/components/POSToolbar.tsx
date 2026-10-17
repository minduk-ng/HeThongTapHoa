import { router, usePage } from '@inertiajs/react';
import {
    Armchair,
    UtensilsCrossed,
    Activity,
    Maximize2,
    Minimize2,
    RefreshCw,
    Search,
    SlidersHorizontal,
    X,
} from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import AvatarDropdown from '../../../../components/AvatarDropdown';
import type { PageProps } from '../../../../types/auth';
import { useReverbStatus } from '../hooks/useReverbStatus';
import type { POSTableData } from '../types/pos.types';

type POSToolbarTab = 'tables' | 'menu' | 'log';

interface POSToolbarProps {
    activeTab: POSToolbarTab;
    onTabChange: (tab: POSToolbarTab) => void;
    selectedTable: POSTableData | null;
    cartItemCount: number;
    unreadErrorCount: number;
    searchQuery: string;
    onSearchChange: (value: string) => void;
    onOpenLog: () => void;
    onOpenSettings?: () => void;
}

export default function POSToolbar({
    activeTab,
    onTabChange,
    selectedTable,
    cartItemCount,
    unreadErrorCount,
    searchQuery,
    onSearchChange,
    onOpenLog,
    onOpenSettings,
}: POSToolbarProps) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user;
    const { status: reverbStatus } = useReverbStatus();

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isWsPopoverOpen, setIsWsPopoverOpen] = useState(false);
    const wsPopoverRef = useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
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

    // Track fullscreen state changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
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

    const handleReload = () => {
        router.reload({ only: ['tables', 'categories', 'products'] });
    };

    // WebSocket status indicator config
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

    const tabButtonClass = (tab: string) =>
        `py-2 px-3.5 text-sm font-bold rounded-lg transition-colors duration-150 flex items-center space-x-1.5 ${
            activeTab === tab
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
        }`;

    const utilityButtonClass =
        'p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors';

    return (
        <div className="flex h-14 w-full shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 dark:border-zinc-800 dark:bg-zinc-900">
            {/* Left Side — Tab Switchers */}
            <div className="flex shrink-0 items-center space-x-1.5">
                <button
                    type="button"
                    onClick={() => onTabChange('tables')}
                    className={tabButtonClass('tables')}
                >
                    <Armchair className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Chọn bàn</span>
                    {selectedTable && (
                        <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] tabular-nums">
                            {selectedTable.table_number}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => onTabChange('menu')}
                    className={tabButtonClass('menu')}
                >
                    <UtensilsCrossed className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Chọn món</span>
                    {cartItemCount > 0 && (
                        <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-amber-950 tabular-nums">
                            {cartItemCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Middle — Flexible Search Input (stretches to fill all available space) */}
            {activeTab !== 'log' ? (
                <div className="mx-4 min-w-0 flex-1">
                    <div className="relative w-full">
                        <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder={
                                activeTab === 'tables'
                                    ? 'Tìm theo số bàn, khu vực...'
                                    : 'Tìm tên món ăn / đồ uống...'
                            }
                            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pr-8 pl-9 text-xs text-zinc-900 placeholder-zinc-400 transition-colors duration-150 focus:border-sky-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => onSearchChange('')}
                                aria-label="Xóa tìm kiếm"
                                className="hover:text-zinc-650 dark:text-zinc-550 dark:hover:text-zinc-350 absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5 text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1" />
            )}

            {/* Right Side — Utility Controls */}
            <div className="flex shrink-0 items-center space-x-1">
                {/* WebSocket Status Indicator */}
                <div className="relative" ref={wsPopoverRef}>
                    <button
                        type="button"
                        onClick={() => setIsWsPopoverOpen(!isWsPopoverOpen)}
                        className="group flex items-center space-x-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Xem chi tiết kết nối mạng"
                    >
                        <span
                            className={`h-2 w-2 rounded-full ${wsConfig.dotClass}`}
                        />
                        <span className="text-[11px] font-semibold text-zinc-500 tabular-nums group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-200">
                            {wsConfig.label}
                        </span>
                    </button>

                    {isWsPopoverOpen && (
                        <div className="border-zinc-250/80 animate-in fade-in slide-in-from-top-1 absolute top-full right-0 z-50 mt-2 flex w-56 flex-col gap-2.5 rounded-xl border bg-white p-3.5 text-zinc-700 shadow-lg duration-150 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
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
                                    <span className="text-zinc-400 dark:text-zinc-500">
                                        Kết nối:
                                    </span>
                                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                        WebSocket (Reverb)
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-zinc-400 dark:text-zinc-500">
                                        Trạng thái:
                                    </span>
                                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                        {reverbStatus === 'connected'
                                            ? 'Đã kết nối'
                                            : reverbStatus === 'connecting'
                                              ? 'Đang kết nối'
                                              : 'Mất kết nối'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Log Button (moved from left tab to right utility area) */}
                <button
                    type="button"
                    onClick={() => {
                        onTabChange('log');
                        onOpenLog();
                    }}
                    className={`${utilityButtonClass} relative`}
                    title="Nhật ký hoạt động hệ thống"
                >
                    <Activity className="h-5 w-5 stroke-[1.5]" />
                    {unreadErrorCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 animate-pulse rounded-full border border-white bg-rose-600 px-1 py-0.5 text-[11px] font-bold text-white tabular-nums shadow-xs dark:border-zinc-900">
                            {unreadErrorCount}
                        </span>
                    )}
                </button>

                {/* Display Settings Toggle */}
                {onOpenSettings && (
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className={utilityButtonClass}
                        title="Cài đặt hiển thị POS"
                    >
                        <SlidersHorizontal className="h-5 w-5 stroke-[1.5]" />
                    </button>
                )}

                {/* Divider */}
                <div className="mx-0.5 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

                {/* Fullscreen Toggle */}
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className={utilityButtonClass}
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

                {/* Reload */}
                <button
                    type="button"
                    onClick={handleReload}
                    className={utilityButtonClass}
                    title="Tải lại dữ liệu"
                >
                    <RefreshCw className="h-5 w-5 stroke-[1.5]" />
                </button>

                {/* Divider */}
                <div className="mx-0.5 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />

                <AvatarDropdown user={user} />
            </div>
        </div>
    );
}
