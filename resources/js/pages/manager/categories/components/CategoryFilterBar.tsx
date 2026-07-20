import React from 'react';

interface CategoryFilterBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onOpenAddDrawer: () => void;
}

export default function CategoryFilterBar({
    searchQuery,
    onSearchChange,
    onOpenAddDrawer,
}: CategoryFilterBarProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
            {/* Left Aligned Search Input */}
            <div className="relative w-full sm:w-72">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Tìm theo tên danh mục..."
                    className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Right Aligned Add Category Button */}
            <button
                type="button"
                onClick={onOpenAddDrawer}
                className="flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors shrink-0"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Thêm danh mục</span>
            </button>
        </div>
    );
}
