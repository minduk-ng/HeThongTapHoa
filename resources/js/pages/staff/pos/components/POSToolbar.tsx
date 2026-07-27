import React, { useState, useRef, useEffect } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import {
    Armchair,
    UtensilsCrossed,
    Activity,
    Maximize2,
    Minimize2,
    RefreshCw,
    Moon,
    Sun,
    Settings,
    LogOut,
} from 'lucide-react';
import type { PageProps } from '../../../../types/auth';
import type { POSTableData } from '../types/pos.types';
import ThemeToggle from '../../../../components/ThemeToggle';
import { useReverbStatus } from '../hooks/useReverbStatus';

interface POSToolbarProps {
    activeTab: 'tables' | 'menu' | 'log';
    onTabChange: (tab: 'tables' | 'menu' | 'log') => void;
    selectedTable: POSTableData | null;
    cartItemCount: number;
    unreadErrorCount: number;
    onClearUnread: () => void;
}

export default function POSToolbar({
    activeTab,
    onTabChange,
    selectedTable,
    cartItemCount,
    unreadErrorCount,
    onClearUnread,
}: POSToolbarProps) {
    const { auth } = usePage<PageProps>().props;
    const user = auth.user;
    const { status: reverbStatus, latencyMs } = useReverbStatus();

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isAvatarOpen, setIsAvatarOpen] = useState(false);
    const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });
    const avatarRef = useRef<HTMLDivElement>(null);

    // Close avatar dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (avatarRef.current && !avatarRef.current.contains(event.target as Node)) {
                setIsAvatarOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Track fullscreen state changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
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

    const handleReload = () => {
        router.reload({ onError: () => {} });
    };

    const handleLogout = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsAvatarOpen(false);
        router.post('/logout');
    };

    // WebSocket status indicator config
    const statusConfig = {
        connected: {
            dotClass: 'bg-emerald-500',
            label: latencyMs !== null ? `${latencyMs}ms` : 'Kết nối ổn',
            tooltip: latencyMs !== null ? `Kết nối ổn định — ${latencyMs}ms` : 'Kết nối ổn định',
        },
        connecting: {
            dotClass: 'bg-amber-500 animate-pulse',
            label: 'Đang nối…',
            tooltip: 'Đang kết nối lại WebSocket…',
        },
        disconnected: {
            dotClass: 'bg-rose-500',
            label: 'Mất kết nối',
            tooltip: 'Mất kết nối WebSocket — dữ liệu có thể không cập nhật tức thời',
        },
    };

    const wsConfig = statusConfig[reverbStatus];

    const tabButtonClass = (tab: string) =>
        `py-1.5 px-2.5 text-xs font-bold rounded-lg transition-colors duration-150 flex items-center space-x-1.5 ${
            activeTab === tab
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
        }`;

    const utilityButtonClass =
        'p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors';

    return (
        <div className="shrink-0 h-11 w-full flex items-center justify-between px-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            {/* Left Side — Tab Switchers */}
            <div className="flex items-center space-x-1.5">
                <button
                    type="button"
                    onClick={() => onTabChange('tables')}
                    className={tabButtonClass('tables')}
                >
                    <Armchair className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>Chọn bàn</span>
                    {selectedTable && (
                        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] tabular-nums">
                            {selectedTable.table_number}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => onTabChange('menu')}
                    className={tabButtonClass('menu')}
                >
                    <UtensilsCrossed className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>Chọn món</span>
                    {cartItemCount > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-bold text-[10px] tabular-nums">
                            {cartItemCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => {
                        onTabChange('log');
                        onClearUnread();
                    }}
                    className={`p-1.5 text-xs font-bold rounded-lg transition-colors duration-150 flex items-center justify-center relative ${
                        activeTab === 'log'
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                    title="Nhật ký hoạt động hệ thống"
                >
                    <Activity className="w-3.5 h-3.5 stroke-[1.5]" />
                    {unreadErrorCount > 0 && (
                        <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[9px] tabular-nums animate-pulse border border-white dark:border-zinc-900 shadow-xs">
                            {unreadErrorCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Right Side — Utility Controls */}
            <div className="flex items-center space-x-1">
                {/* WebSocket Status Indicator */}
                <button
                    type="button"
                    className="flex items-center space-x-1.5 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group relative"
                    title={wsConfig.tooltip}
                >
                    <span className={`w-2 h-2 rounded-full ${wsConfig.dotClass}`} />
                    <span className="text-[10px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                        {wsConfig.label}
                    </span>
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                {/* Fullscreen Toggle */}
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className={utilityButtonClass}
                    title={isFullscreen ? 'Thoát toàn màn hình' : 'Mở toàn màn hình'}
                >
                    {isFullscreen ? (
                        <Minimize2 className="w-4 h-4 stroke-[1.5]" />
                    ) : (
                        <Maximize2 className="w-4 h-4 stroke-[1.5]" />
                    )}
                </button>

                {/* Reload */}
                <button
                    type="button"
                    onClick={handleReload}
                    className={utilityButtonClass}
                    title="Tải lại dữ liệu"
                >
                    <RefreshCw className="w-4 h-4 stroke-[1.5]" />
                </button>

                {/* Divider */}
                <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                {/* Avatar Dropdown */}
                <div className="relative" ref={avatarRef}>
                    <button
                        type="button"
                        onClick={() => setIsAvatarOpen(!isAvatarOpen)}
                        className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-all duration-150 ${
                            isAvatarOpen
                                ? 'bg-sky-50 dark:bg-sky-950/50'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                        aria-label="Menu nhân viên"
                    >
                        {user.avatar ? (
                            <img
                                src={user.avatar}
                                alt={user.name}
                                className="h-6 w-6 rounded-full object-cover shadow-xs"
                            />
                        ) : (
                            <div className="avatar-placeholder h-6 w-6 text-[10px] font-semibold">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 max-w-[80px] truncate hidden sm:inline">
                            {user.name}
                        </span>
                    </button>

                    {/* Avatar Dropdown Popover */}
                    {isAvatarOpen && (
                        <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 z-50 animate-fade-in">
                            {/* User Profile Info */}
                            <div className="px-3 py-2">
                                <p className="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">
                                    {user.name}
                                </p>
                                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                    {user.email}
                                </p>
                            </div>

                            <div className="my-2 h-px bg-zinc-100 dark:bg-zinc-700" />

                            {/* Theme Toggle */}
                            <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                                <span className="flex items-center gap-2">
                                    {isDarkTheme ? (
                                        <Moon className="w-4 h-4 text-sky-400 stroke-[1.5]" />
                                    ) : (
                                        <Sun className="w-4 h-4 text-amber-500 stroke-[1.5]" />
                                    )}
                                    Giao diện
                                </span>
                                <ThemeToggle onThemeChange={(isDark) => setIsDarkTheme(isDark)} />
                            </div>

                            <div className="my-2 h-px bg-zinc-100 dark:bg-zinc-700" />

                            {/* Actions */}
                            <div className="space-y-1">
                                <Link
                                    href="/settings"
                                    onClick={() => setIsAvatarOpen(false)}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60 dark:hover:text-sky-300"
                                >
                                    <Settings className="w-4 h-4 text-zinc-500 dark:text-zinc-400 stroke-[1.5]" />
                                    Cài đặt
                                </Link>

                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                >
                                    <LogOut className="w-4 h-4 text-rose-500 dark:text-rose-400 stroke-[1.5]" />
                                    Đăng xuất
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
