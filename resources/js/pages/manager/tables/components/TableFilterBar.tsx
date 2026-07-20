import React from 'react';

interface TableFilterBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    selectedArea: string;
    onAreaChange: (area: string) => void;
    selectedStatus: string;
    onStatusChange: (status: string) => void;
    areas: string[];
    onOpenAddDrawer: () => void;
}

export default function TableFilterBar({
    searchQuery,
    onSearchChange,
    selectedArea,
    onAreaChange,
    selectedStatus,
    onStatusChange,
    areas,
    onOpenAddDrawer,
}: TableFilterBarProps) {
    return (
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl shadow-xs">
            <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Tìm theo tên/số bàn..."
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <select
                    value={selectedArea}
                    onChange={(e) => onAreaChange(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">Tất cả khu vực</option>
                    {areas.map((area) => (
                        <option key={area} value={area}>
                            {area}
                        </option>
                    ))}
                </select>

                <select
                    value={selectedStatus}
                    onChange={(e) => onStatusChange(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="available">Bàn trống</option>
                    <option value="occupied">Đang dùng</option>
                    <option value="reserved">Đã đặt trước</option>
                    <option value="maintenance">Bảo trì</option>
                </select>
            </div>

            <button
                type="button"
                onClick={onOpenAddDrawer}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center space-x-1.5 shrink-0"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Thêm bàn mới</span>
            </button>
        </div>
    );
}
