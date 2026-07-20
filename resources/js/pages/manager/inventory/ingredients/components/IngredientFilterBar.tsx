import React from 'react';

interface IngredientFilterBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    selectedUnit: string;
    onUnitChange: (unit: string) => void;
    alertFilter: string;
    onAlertChange: (alert: string) => void;
    units: string[];
    onOpenAddDrawer: () => void;
}

export default function IngredientFilterBar({
    searchQuery,
    onSearchChange,
    selectedUnit,
    onUnitChange,
    alertFilter,
    onAlertChange,
    units,
    onOpenAddDrawer,
}: IngredientFilterBarProps) {
    return (
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-xs">
            {/* Search and Unit Filters */}
            <div className="flex flex-1 flex-wrap items-center gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[200px]">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Tìm theo mã NVL hoặc tên nguyên liệu..."
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Unit Filter */}
                <select
                    value={selectedUnit}
                    onChange={(e) => onUnitChange(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">Tất cả đơn vị</option>
                    {units.map((unit) => (
                        <option key={unit} value={unit}>
                            Đơn vị: {unit}
                        </option>
                    ))}
                </select>

                {/* Alert Filter Toggle */}
                <button
                    type="button"
                    onClick={() => onAlertChange(alertFilter === 'low' ? 'all' : 'low')}
                    className={`flex items-center space-x-1.5 px-3 py-2 text-sm border rounded-lg font-medium transition-colors ${
                        alertFilter === 'low'
                            ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50'
                    }`}
                >
                    <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Sắp hết hàng</span>
                </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
                <button
                    type="button"
                    onClick={onOpenAddDrawer}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center space-x-1.5 shrink-0"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Thêm nguyên liệu</span>
                </button>
            </div>
        </div>
    );
}
