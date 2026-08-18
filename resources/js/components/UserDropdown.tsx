import { Link, router } from '@inertiajs/react';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Settings, LogOut } from 'lucide-react';
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
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
                <div className="flex items-center gap-3">
                    {user.avatar ? (
                        <img
                            src={user.avatar}
                            alt={user.name}
                            className="h-9 w-9 rounded-full object-cover ring-2 ring-indigo-500/20"
                        />
                    ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
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
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <Link
                        href="/settings"
                        className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-slate-700/50"
                    >
                        <Settings className="h-4 w-4 stroke-[1.5]" />
                        Thông tin cá nhân
                    </Link>

                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                        <LogOut className="h-4 w-4 stroke-[1.5]" />
                        Đăng xuất
                    </button>
                </div>
            )}
        </div>
    );
}
