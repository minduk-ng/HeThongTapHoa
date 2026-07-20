import React, { useState, useRef, useEffect } from 'react';
import PriceRangePopover from './PriceRangePopover';

interface Category {
    id: number;
    name: string;
}

interface ProductFilterBarProps {
    statusFilter: string;
    onStatusChange: (status: string) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    selectedCategory: string;
    onCategoryChange: (catId: string) => void;
    minPrice: string;
    maxPrice: string;
    onPriceChange: (min: string, max: string) => void;
    priceLimits?: { min: number; max: number };
    categories: Category[];
    onOpenAddDrawer: () => void;
    onExportExcel: () => void;
    onImportExcelClick: () => void;
}

export default function ProductFilterBar({
    statusFilter,
    onStatusChange,
    searchQuery,
    onSearchChange,
    selectedCategory,
    onCategoryChange,
    minPrice,
    maxPrice,
    onPriceChange,
    priceLimits,
    categories,
    onOpenAddDrawer,
    onExportExcel,
    onImportExcelClick,
}: ProductFilterBarProps) {
    const [excelDropdownOpen, setExcelDropdownOpen] = useState(false);
    const excelDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (excelDropdownRef.current && !excelDropdownRef.current.contains(e.target as Node)) {
                setExcelDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="space-y-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
            {/* Top Status Tabs */}
            <div className="flex space-x-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <button
                    type="button"
                    onClick={() => onStatusChange('all')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        statusFilter === 'all'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                >
                    Tất cả sản phẩm
                </button>
                <button
                    type="button"
                    onClick={() => onStatusChange('active')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        statusFilter === 'active'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                >
                    Đang hoạt động
                </button>
                <button
                    type="button"
                    onClick={() => onStatusChange('inactive')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        statusFilter === 'inactive'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                >
                    Ngừng hoạt động
                </button>
            </div>

            {/* Bottom Filter Controls Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Left Aligned Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search Input */}
                    <div className="relative w-full sm:w-64">
                        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Tìm theo mã SP, tên..."
                            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Category Dropdown */}
                    <select
                        value={selectedCategory}
                        onChange={(e) => onCategoryChange(e.target.value)}
                        className="px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">Tất cả danh mục</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                                {cat.name}
                            </option>
                        ))}
                    </select>

                    {/* Price Popover */}
                    <PriceRangePopover
                        minPrice={minPrice}
                        maxPrice={maxPrice}
                        globalMin={priceLimits?.min ?? 0}
                        globalMax={priceLimits?.max ?? 500000}
                        onChange={onPriceChange}
                    />
                </div>

                {/* Right Aligned Action Buttons */}
                <div className="flex items-center space-x-2">
                    {/* Excel Dropdown Button */}
                    <div className="relative" ref={excelDropdownRef}>
                        <button
                            type="button"
                            onClick={() => setExcelDropdownOpen(!excelDropdownOpen)}
                            className="flex items-center space-x-2 px-3.5 py-2 text-sm font-medium border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-750 rounded-lg shadow-xs transition-colors"
                        >
                            <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Nhập / Xuất Excel</span>
                            <svg className="w-4 h-4 text-zinc-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {excelDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-20 overflow-hidden py-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExcelDropdownOpen(false);
                                        onExportExcel();
                                    }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2"
                                >
                                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    <span>Xuất dữ liệu Excel</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExcelDropdownOpen(false);
                                        onImportExcelClick();
                                    }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center space-x-2"
                                >
                                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    <span>Nhập từ file Excel</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Add Product Button */}
                    <button
                        type="button"
                        onClick={onOpenAddDrawer}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Thêm sản phẩm</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
