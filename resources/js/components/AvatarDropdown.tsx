import React, { useState, useRef, useEffect } from 'react';
import { Link, router } from '@inertiajs/react';
import { Moon, Sun, Settings, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

interface AvatarDropdownProps {
    user: {
        name: string;
        email: string;
        avatar?: string | null;
    };
}

export default function AvatarDropdown({ user }: AvatarDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsOpen(false);
        router.post('/logout');
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-all duration-150 ${
                    isOpen
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

            {isOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 z-50 animate-fade-in">
                    <div className="px-3 py-2">
                        <p className="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">
                            {user.name}
                        </p>
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {user.email}
                        </p>
                    </div>

                    <div className="my-2 h-px bg-zinc-100 dark:bg-zinc-700" />

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

                    <div className="space-y-1">
                        <Link
                            href="/settings"
                            onClick={() => setIsOpen(false)}
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
    );
}
