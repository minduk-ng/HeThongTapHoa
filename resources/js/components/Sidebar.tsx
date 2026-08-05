import { Link, router, usePage } from '@inertiajs/react';
import React, { useState, useRef, useEffect } from 'react';
import type { PageProps } from '../types/auth';
import ThemeToggle from './ThemeToggle';
import { cdnAsset } from '../utils/cdn';

export default function Sidebar() {
    const { auth, navigation } = usePage<PageProps>().props;
    const currentUrl = usePage().url;
    const user = auth.user;

    // Avatar Dropdown state
    const [isAvatarOpen, setIsAvatarOpen] = useState(false);
    const avatarRef = useRef<HTMLDivElement>(null);

    // Track dark theme for dynamic icon in avatar menu
    const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });

    // GitHub-style Nav Dropdown states
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const [pinnedGroup, setPinnedGroup] = useState<string | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const navRef = useRef<HTMLElement>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (avatarRef.current && !avatarRef.current.contains(event.target as Node)) {
                setIsAvatarOpen(false);
            }
            if (navRef.current && !navRef.current.contains(event.target as Node)) {
                setOpenGroup(null);
                setPinnedGroup(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMouseEnter = (groupName: string) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        setOpenGroup(groupName);
    };

    const handleMouseLeave = () => {
        if (pinnedGroup) return; // Stay open if pinned
        hoverTimeoutRef.current = setTimeout(() => {
            setOpenGroup(null);
        }, 200);
    };

    const handleGroupClick = (groupName: string, e: React.MouseEvent) => {
        e.preventDefault();
        if (pinnedGroup === groupName) {
            setPinnedGroup(null);
            setOpenGroup(null);
        } else {
            setPinnedGroup(groupName);
            setOpenGroup(groupName);
        }
    };

    const handleLogout = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsAvatarOpen(false);
        router.post('/logout');
    };

    return (
        <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 shadow-xs transition-colors duration-150">
            <div className="flex h-16 w-full items-center justify-between px-4 sm:px-6 md:px-8">
                
                {/* ========== LEFT SECTION: BANNER & NAVIGATION ========== */}
                <div className="flex items-center gap-4 sm:gap-6">
                    {/* Far Left Banner (Light & Dark Mode) */}
                    <Link href="/" className="flex items-center shrink-0">
                        <img 
                            src={cdnAsset('/banner/banner_v2.jpg')} 
                            alt="Coffee Shop Banner" 
                            className="h-9 w-auto rounded-lg object-contain shadow-xs transition-opacity hover:opacity-90 dark:hidden"
                        />
                        <img 
                            src={cdnAsset('/banner/banner_v2.jpg')} //setting banner dark
                            alt="Coffee Shop Banner Dark" 
                            className="hidden h-9 w-auto rounded-lg object-contain shadow-xs transition-opacity hover:opacity-90 dark:block"
                        />
                    </Link>

                    {/* Middle: Navigation Links (GitHub-style hover/pin dropdowns) */}
                    <nav className="flex items-center gap-1" ref={navRef}>
                        {Object.entries(navigation).map(([groupName, items]) => {
                            const isOpen = openGroup === groupName;
                            const isPinned = pinnedGroup === groupName;
                            const hasActiveChild = items.some(item => 
                                currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path))
                            );

                            return (
                                <div 
                                    key={groupName} 
                                    className="relative"
                                    onMouseEnter={() => handleMouseEnter(groupName)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <button
                                        onClick={(e) => handleGroupClick(groupName, e)}
                                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                                            hasActiveChild || isOpen || isPinned
                                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                                        }`}
                                    >
                                        <span>{groupName}</span>
                                        <svg
                                            className={`h-3.5 w-3.5 transform transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {/* GitHub Style Dropdown Menu */}
                                    {isOpen && (
                                        <div 
                                            className="absolute left-0 mt-1.5 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in"
                                            onMouseEnter={() => handleMouseEnter(groupName)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <div className="space-y-1">
                                                {items.map((item) => {
                                                    const isActive = currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path));
                                                    return (
                                                        <Link
                                                            key={item.route_path}
                                                            href={item.route_path}
                                                            onClick={() => {
                                                                setOpenGroup(null);
                                                                setPinnedGroup(null);
                                                            }}
                                                            className={`flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                                                isActive
                                                                    ? 'bg-sky-600 text-white font-semibold shadow-xs'
                                                                    : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                                            }`}
                                                        >
                                                            {item.name}
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                </div>

                {/* ========== FAR RIGHT: USER AVATAR & DROPDOWN (INCLUDES THEME TOGGLE) ========== */}
                <div className="relative" ref={avatarRef}>
                    <button
                        onClick={() => setIsAvatarOpen(!isAvatarOpen)}
                        className={`flex items-center gap-2 rounded-full p-0.5 transition-all duration-200 focus:outline-none ${
                            isAvatarOpen 
                                ? 'ring-2 ring-sky-500 shadow-xs' 
                                : 'ring-2 ring-transparent hover:ring-sky-400'
                        }`}
                        aria-label="User Menu"
                    >
                        {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-full object-cover shadow-xs" />
                        ) : (
                            <div className="avatar-placeholder h-9 w-9 text-sm font-semibold">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </button>

                    {/* Avatar Dropdown Popover */}
                    {isAvatarOpen && (
                        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in">
                            {/* User Profile Info */}
                            <div className="px-3 py-2">
                                <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                                    {user.name}
                                </p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                    {user.email}
                                </p>
                            </div>

                            <div className="my-2 h-px bg-slate-100 dark:bg-slate-700" />

                            {/* Theme Toggle option inside Avatar Dropdown */}
                            <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <span className="flex items-center gap-2">
                                    {isDarkTheme ? (
                                        <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                        </svg>
                                    ) : (
                                        <svg className="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                    Giao diện
                                </span>
                                <ThemeToggle onThemeChange={(isDark) => setIsDarkTheme(isDark)} />
                            </div>

                            <div className="my-2 h-px bg-slate-100 dark:bg-slate-700" />

                            {/* Actions */}
                            <div className="space-y-1">
                                <Link
                                    href="/settings"
                                    onClick={() => setIsAvatarOpen(false)}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300"
                                >
                                    <svg className="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Cài đặt
                                </Link>

                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                >
                                    <svg className="h-4 w-4 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Đăng xuất
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </header>
    );
}
