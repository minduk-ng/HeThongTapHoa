import { Link, usePage } from '@inertiajs/react';
import { useState } from 'react';
import type { PageProps } from '../types/auth';
import ThemeToggle from './ThemeToggle';
import UserDropdown from './UserDropdown';

export default function Sidebar() {
    const { auth, navigation } = usePage<PageProps>().props;
    const currentUrl = usePage().url;

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        Object.entries(navigation).forEach(([groupName, items]) => {
            const hasActive = items.some(item => currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path)));
            initial[groupName] = hasActive;
        });
        return initial;
    });

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };

    return (
        <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-800">
            {/* Header / User Info */}
            <div className="flex flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                        AdminPanel
                    </h2>
                    <ThemeToggle />
                </div>
                
                <UserDropdown user={auth.user} />
            </div>

            <hr className="mx-4 border-gray-100 dark:border-slate-700" />

            {/* Navigation */}
            <nav className="flex-1 space-y-4 p-4">
                {Object.entries(navigation).map(([groupName, items]) => {
                    const isExpanded = expandedGroups[groupName];
                    return (
                        <div key={groupName} className="space-y-1">
                            <button
                                onClick={() => toggleGroup(groupName)}
                                className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                            >
                                <span>{groupName}</span>
                                <svg
                                    className={`h-3 w-3 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                            
                            <ul className={`space-y-1 pl-4 border-l border-indigo-100/60 dark:border-slate-700/50 ml-3 transition-all overflow-hidden duration-200 ${isExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                                {items.map((item) => {
                                    const isActive = currentUrl === item.route_path || (item.route_path !== '/' && currentUrl.startsWith(item.route_path));
                                    return (
                                        <li key={item.route_path}>
                                            <Link
                                                href={item.route_path}
                                                className={`group flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                                                    isActive
                                                        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-slate-700/50 dark:hover:text-white'
                                                }`}
                                            >
                                                {item.name}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
}
