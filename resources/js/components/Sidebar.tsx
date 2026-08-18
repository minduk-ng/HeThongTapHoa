import { Link, router, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronRight, Moon, Sun, Settings, LogOut } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import type { NavigationItem, PageProps } from '../types/auth';
import { cdnAsset, useCdnBaseUrl } from '../utils/cdn';
import ThemeToggle from './ThemeToggle';

export default function Sidebar() {
    const { auth, navigation } = usePage<PageProps>().props;
    const currentUrl = usePage().url;
    const user = auth.user;
    const cdnUrl = useCdnBaseUrl();

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
    const [activeSubGroup, setActiveSubGroup] = useState<string | null>(null);
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

        // Reset activeSubGroup only on a genuinely fresh open (not on re-entry across the gap),
        // so moving from a parent row into the level-2 panel doesn't wipe the hovered sub.
        if (openGroup !== groupName) {
            const group = navigation[groupName];

            if (group && !Array.isArray(group) && group.__subs) {
                const keys = Object.keys(group.__subs);
                const active = keys.find((key) => group.__subs[key].some((item) =>
                    currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path))));
                setActiveSubGroup(active ?? null);
            }
        }
    };

    const handleMouseLeave = () => {
        if (pinnedGroup) {
            return; // Stay open if pinned
        }

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
                            src={cdnAsset('/banner/banner_v2.jpg', { h: 72, q: 80, format: 'webp' }, cdnUrl)} 
                            alt="Coffee Shop Banner" 
                            className="h-9 w-auto rounded-lg object-contain shadow-xs transition-opacity hover:opacity-90 dark:hidden"
                        />
                        <img 
                            src={cdnAsset('/banner/banner_v2.jpg', { h: 72, q: 80, format: 'webp' }, cdnUrl)} //setting banner dark
                            alt="Coffee Shop Banner Dark" 
                            className="hidden h-9 w-auto rounded-lg object-contain shadow-xs transition-opacity hover:opacity-90 dark:block"
                        />
                    </Link>

                    {/* Middle: Navigation Links (GitHub-style hover/pin dropdowns) */}
                    <nav className="flex items-center gap-1" ref={navRef}>
                        {Object.entries(navigation).map(([groupName, groupValue]) => {
                            const isOpen = openGroup === groupName;
                            const isPinned = pinnedGroup === groupName;
                            const hasSubs = !Array.isArray(groupValue) && groupValue.__subs !== undefined;
                            const subs = hasSubs ? (groupValue as { __subs: Record<string, NavigationItem[]> }).__subs : null;
                            const subKeys = subs ? Object.keys(subs) : [];
                            // Flat items of a group (the array part; a mixed group carries them alongside __subs)
                            const flatItems: NavigationItem[] = Array.isArray(groupValue)
                                ? groupValue
                                : Object.keys(groupValue).filter((key) => key !== '__subs').map((key) => (groupValue as unknown as Record<string, NavigationItem>)[key]);
                            const activeSubName = subs
                                ? subKeys.find((key) => subs[key].some((item) =>
                                    currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path))))
                                : null;
                            const activeSub = subs && activeSubGroup && subs[activeSubGroup] ? activeSubGroup : (activeSubName ?? null);
                            const hasActiveChild = [...flatItems, ...(subs ? Object.values(subs).flat() : [])].some((item) =>
                                currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path)));

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
                                        <ChevronDown
                                            className={`h-3.5 w-3.5 transform transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                                        />
                                    </button>

                                    {/* GitHub Style Dropdown Menu */}
                                    {isOpen && !hasSubs && (
                                        <div 
                                            className="absolute left-0 mt-1.5 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in"
                                            onMouseEnter={() => handleMouseEnter(groupName)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <div className="space-y-1">
                                                {flatItems.map((item) => {
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

                                    {/* Flyout 2 cấp cho group có sub_group (file-tree style) */}
                                    {isOpen && subs && (
                                        <div
                                            className="absolute left-0 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 z-50 animate-fade-in"
                                            onMouseEnter={() => handleMouseEnter(groupName)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <div className="space-y-0.5">
                                                {/* Cấp 1: danh sách sub_group */}
                                                {subKeys.map((key) => {
                                                    const isActiveSub = activeSub === key;

                                                    return (
                                                        <div key={key} className="relative">
                                                            <button type="button"
                                                                onMouseEnter={() => setActiveSubGroup(key)}
                                                                onClick={() => setActiveSubGroup(key)}
                                                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                                                                    isActiveSub
                                                                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                                                                }`}>
                                                                <span>{key}</span>
                                                                <ChevronRight className="h-3.5 w-3.5" />
                                                            </button>

                                                            {/* Cấp 2: items của sub_group — đẩy sang phải, ngang hàng dòng cha, cách 8px */}
                                                            {activeSub === key && subs[key].length > 0 && (
                                                                <div className="absolute left-full top-0 ml-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800 animate-fade-in">
                                                                    <div className="space-y-0.5">
                                                                        {subs[key].map((item) => {
                                                                            const isActive = currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path));

                                                                            return (
                                                                                <Link key={item.route_path} href={item.route_path}
                                                                                    onClick={() => {
                                                                                        setOpenGroup(null);
                                                                                        setPinnedGroup(null);
                                                                                    }}
                                                                                    className={`block rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                                                                        isActive
                                                                                            ? 'bg-sky-600 text-white font-semibold shadow-xs'
                                                                                            : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                                                                    }`}>
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
                                                {/* Flat items của mixed group */}
                                                {flatItems.length > 0 && (
                                                    <>
                                                        <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                                                        {flatItems.map((item) => {
                                                            const isActive = currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path));

                                                            return (
                                                                <Link key={item.route_path} href={item.route_path}
                                                                    onClick={() => {
                                                                        setOpenGroup(null);
                                                                        setPinnedGroup(null);
                                                                    }}
                                                                    className={`flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                                                        isActive
                                                                            ? 'bg-sky-600 text-white font-semibold shadow-xs'
                                                                            : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-200 dark:hover:bg-slate-700/60 dark:hover:text-sky-300'
                                                                    }`}>
                                                                    {item.name}
                                                                </Link>
                                                            );
                                                        })}
                                                    </>
                                                )}
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
                                        <Moon className="h-4 w-4 text-sky-400 stroke-[1.5]" />
                                    ) : (
                                        <Sun className="h-4 w-4 text-amber-500 stroke-[1.5]" />
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
                                    <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400 stroke-[1.5]" />
                                    Cài đặt
                                </Link>

                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                >
                                    <LogOut className="h-4 w-4 text-red-500 dark:text-red-400 stroke-[1.5]" />
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
