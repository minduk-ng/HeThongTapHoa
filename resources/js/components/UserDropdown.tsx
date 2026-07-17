import { Link, router } from '@inertiajs/react';
import { useState, useRef, useEffect } from 'react';
import type { User } from '../types/auth';

interface UserDropdownProps {
    user: User;
}

export default function UserDropdown({ user }: UserDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
        <div className="relative w-full" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between rounded-xl p-3 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    {user.avatar ? (
                        <img src={user.avatar} alt="Avatar" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                        <div className="avatar-placeholder h-10 w-10 shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="flex flex-col items-start overflow-hidden text-left">
                        <span className="w-full truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {user.name}
                        </span>
                        <span className="w-full truncate text-xs text-gray-500 dark:text-gray-400">
                            {user.email}
                        </span>
                    </div>
                </div>
                <svg
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <Link
                        href="/settings"
                        className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-slate-700/50"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Cài đặt
                    </Link>

                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Đăng xuất
                    </button>
                </div>
            )}
        </div>
    );
}
