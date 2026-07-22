import React, { useState, useMemo } from 'react';

export interface ChildItem {
    id: number;
    name: string;
    price: number | string;
    is_available: boolean;
    image?: string | null;
}

export interface CategoryData {
    id: number;
    name: string;
    description: string | null;
    sort_order: number;
    items_count?: number;
    items_sum_price?: number | string | null;
    items?: ChildItem[];
}

interface CategoryTableProps {
    categories: CategoryData[];
    onEdit: (category: CategoryData) => void;
    onDelete: (category: CategoryData) => void;
}

type SortField = 'sort_order' | 'name' | 'items_count' | 'items_sum_price';
type SortDirection = 'asc' | 'desc';

export default function CategoryTable({ categories, onEdit, onDelete }: CategoryTableProps) {
    const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('sort_order');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const toggleExpand = (id: number) => {
        setExpandedIds((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    // Sort categories
    const sortedCategories = useMemo(() => {
        const sorted = [...categories];
        sorted.sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            if (sortField === 'items_count') {
                valA = a.items_count ?? a.items?.length ?? 0;
                valB = b.items_count ?? b.items?.length ?? 0;
            } else if (sortField === 'items_sum_price') {
                valA = Number(a.items_sum_price || 0);
                valB = Number(b.items_sum_price || 0);
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [categories, sortField, sortDirection]);

    // Paginate sorted categories
    const totalPages = Math.max(1, Math.ceil(sortedCategories.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedCategories = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedCategories.slice(start, start + pageSize);
    }, [sortedCategories, safeCurrentPage, pageSize]);

    const formatCurrency = (val?: number | string | null) => {
        if (val === null || val === undefined) return '0 đ';
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <span className="text-zinc-300 dark:text-zinc-600 ml-1 text-xs opacity-50">▲</span>;
        }
        return (
            <span className="text-blue-600 dark:text-blue-400 ml-1 text-xs font-bold">
                {sortDirection === 'asc' ? '▲' : '▼'}
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl shadow-xs">
            {/* Scrollable Data Area */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-left text-sm relative">
                    <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800 select-none">
                        <tr>
                            <th
                                onClick={() => handleSort('sort_order')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5 w-16' : 'py-4 w-20'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>STT</span>
                                    {renderSortIcon('sort_order')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('name')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5' : 'py-4'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Tên danh mục</span>
                                    {renderSortIcon('name')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('items_count')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5' : 'py-4'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Tổng sản phẩm</span>
                                    {renderSortIcon('items_count')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('items_sum_price')}
                                className={`px-4 text-right cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2.5' : 'py-4'
                                }`}
                            >
                                <div className="flex items-center justify-end">
                                    <span>Tổng đơn giá</span>
                                    {renderSortIcon('items_sum_price')}
                                </div>
                            </th>
                            <th className={`px-4 text-center ${isCompact ? 'py-2.5 w-24' : 'py-4 w-28'}`}>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedCategories.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                                    Chưa có danh mục nào phù hợp.
                                </td>
                            </tr>
                        ) : (
                            paginatedCategories.map((category, index) => {
                                const realIndex = (safeCurrentPage - 1) * pageSize + index + 1;
                                const isExpanded = !!expandedIds[category.id];
                                const hasChildren = category.items && category.items.length > 0;

                                return (
                                    <React.Fragment key={category.id}>
                                        {/* Category Parent Row */}
                                        <tr
                                            className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                                                isExpanded ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''
                                            }`}
                                            onClick={() => toggleExpand(category.id)}
                                        >
                                            <td className={`px-4 text-center ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                <div className="flex items-center justify-center space-x-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleExpand(category.id);
                                                        }}
                                                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                                    >
                                                        <svg
                                                            className={`w-4 h-4 transform transition-transform duration-200 ${
                                                                isExpanded ? 'rotate-90 text-blue-600 dark:text-blue-400' : ''
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </button>
                                                    <span className="text-xs text-zinc-500">{realIndex}</span>
                                                </div>
                                            </td>

                                            <td className={`px-4 font-semibold text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                <div className="flex items-center space-x-2">
                                                    <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                    </svg>
                                                    <span>{category.name}</span>
                                                    {category.description && (
                                                        <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-2">
                                                            ({category.description})
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className={`px-4 text-center ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                                    {category.items_count ?? category.items?.length ?? 0} sản phẩm
                                                </span>
                                            </td>

                                            <td className={`px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 ${isCompact ? 'py-2.5' : 'py-5'}`}>
                                                {formatCurrency(category.items_sum_price)}
                                            </td>

                                            <td className={`px-4 text-center ${isCompact ? 'py-2.5' : 'py-5'}`} onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center space-x-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => onEdit(category)}
                                                        className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                        title="Sửa danh mục"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDelete(category)}
                                                        className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                        title="Xóa danh mục"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Child Products Table (Expandable Accordion Row) */}
                                        {isExpanded && (
                                            <tr className="bg-zinc-50/90 dark:bg-zinc-950/80 border-t border-b border-zinc-200 dark:border-zinc-800">
                                                <td colSpan={5} className="py-3 px-6 pl-12">
                                                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-xs">
                                                        <div className="bg-zinc-100/90 dark:bg-zinc-800/90 px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                                                            <span>Danh sách sản phẩm thuộc: {category.name}</span>
                                                            <span>Tổng: {category.items?.length ?? 0} món</span>
                                                        </div>

                                                        {!hasChildren ? (
                                                            <div className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
                                                                Danh mục này chưa có sản phẩm nào.
                                                            </div>
                                                        ) : (
                                                            <table className="w-full text-left text-xs">
                                                                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-medium">
                                                                    <tr>
                                                                        <th className="py-2 px-4 w-28">Mã SP</th>
                                                                        <th className="py-2 px-4">Tên sản phẩm</th>
                                                                        <th className="py-2 px-4 text-right">Giá bán</th>
                                                                        <th className="py-2 px-4 text-center">Trạng thái</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-zinc-700 dark:text-zinc-300">
                                                                    {category.items!.map((child) => (
                                                                        <tr
                                                                            key={child.id}
                                                                            className="hover:bg-zinc-100/80 dark:hover:bg-zinc-800/90 transition-colors"
                                                                        >
                                                                            <td className="py-2 px-4 font-mono text-blue-600 dark:text-blue-400 font-medium">
                                                                                SP{String(child.id).padStart(5, '0')}
                                                                            </td>
                                                                            <td className="py-2 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                                                                                {child.name}
                                                                            </td>
                                                                            <td className="py-2 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                                                {formatCurrency(child.price)}
                                                                            </td>
                                                                            <td className="py-2 px-4 text-center">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                                                                    child.is_available
                                                                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                                                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                                                                                }`}>
                                                                                    {child.is_available ? 'Hoạt động' : 'Ngừng bán'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table Footer Controls */}
            <div className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                {/* Left Side: Compact Toggle & Page Size Selector */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Compact Mode Toggle */}
                    <button
                        type="button"
                        onClick={() => setIsCompact(!isCompact)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                            isCompact
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                        }`}
                        title="Bật/Tắt chế độ hiển thị thu gọn"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        <span>{isCompact ? 'Xem đầy đủ' : 'Thu gọn bảng'}</span>
                    </button>

                    {/* Page Size Options: 20 - 50 - 100 */}
                    <div className="flex items-center space-x-1 border-l border-zinc-200 dark:border-zinc-700 pl-3">
                        <span className="text-zinc-500 mr-1">Hiển thị:</span>
                        {[20, 50, 100].map((size) => (
                            <button
                                key={size}
                                type="button"
                                onClick={() => {
                                    setPageSize(size);
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                                    pageSize === size
                                        ? 'bg-blue-600 text-white'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                            >
                                {size}
                            </button>
                        ))}
                        <span className="text-zinc-400 ml-1">dòng/trang</span>
                    </div>
                </div>

                {/* Right Side: Pagination Bar */}
                <div className="flex items-center space-x-2">
                    {/* First Page */}
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage(1)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Trang đầu"
                    >
                        |&#9664;
                    </button>

                    {/* Previous Page */}
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Trang trước"
                    >
                        &#9664;
                    </button>

                    {/* Page Direct Input */}
                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-400">
                        <span>Trang</span>
                        <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={safeCurrentPage}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                    setCurrentPage(Math.min(Math.max(1, val), totalPages));
                                }
                            }}
                            className="w-12 text-center py-1 border rounded-md bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 font-semibold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                        <span>/ {totalPages}</span>
                    </div>

                    {/* Next Page */}
                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Trang sau"
                    >
                        &#9654;
                    </button>

                    {/* Last Page */}
                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Trang cuối"
                    >
                        &#9654;|
                    </button>
                </div>
            </div>
        </div>
    );
}
