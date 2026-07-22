import React, { useState, useMemo } from 'react';

interface Category {
    id: number;
    name: string;
}

export interface MenuItemData {
    id: number;
    category_id: number | null;
    name: string;
    price: number | string;
    vat_rate: number | string;
    image: string | null;
    description: string | null;
    is_available: boolean;
    category?: Category | null;
}

interface ProductTableProps {
    items: MenuItemData[];
    onEdit: (item: MenuItemData) => void;
    onDelete: (item: MenuItemData) => void;
}

type SortField = 'id' | 'name' | 'category' | 'price' | 'vat_rate' | 'is_available';
type SortDirection = 'asc' | 'desc';

export default function ProductTable({ items, onEdit, onDelete }: ProductTableProps) {
    // Footer & Table States
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('id');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Handle column sorting
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    // Sort items
    const sortedItems = useMemo(() => {
        const sorted = [...items];
        sorted.sort((a, b) => {
            let valA: any = a[sortField as keyof MenuItemData];
            let valB: any = b[sortField as keyof MenuItemData];

            if (sortField === 'category') {
                valA = a.category?.name || '';
                valB = b.category?.name || '';
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [items, sortField, sortDirection]);

    // Paginate sorted items
    const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedItems = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedItems.slice(start, start + pageSize);
    }, [sortedItems, safeCurrentPage, pageSize]);

    const formatCurrency = (val: number | string) => {
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    const formatProductCode = (id: number) => {
        return `SP${String(id).padStart(5, '0')}`;
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
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-12 text-xs' : 'py-3.5 w-16'}`}>STT</th>
                            {!isCompact && <th className="py-3.5 px-4 w-20">Ảnh</th>}
                            <th
                                onClick={() => handleSort('id')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2 w-24' : 'py-3.5 w-28'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Mã SP</span>
                                    {renderSortIcon('id')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('name')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Tên sản phẩm</span>
                                    {renderSortIcon('name')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('category')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Danh mục</span>
                                    {renderSortIcon('category')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('price')}
                                className={`px-4 text-right cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-end">
                                    <span>Giá bán</span>
                                    {renderSortIcon('price')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('vat_rate')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Thuế VAT</span>
                                    {renderSortIcon('vat_rate')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('is_available')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Trạng thái</span>
                                    {renderSortIcon('is_available')}
                                </div>
                            </th>
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-20' : 'py-3.5 w-24'}`}>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedItems.length === 0 ? (
                            <tr>
                                <td colSpan={isCompact ? 8 : 9} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                                    Không có sản phẩm nào phù hợp.
                                </td>
                            </tr>
                        ) : (
                            paginatedItems.map((item, index) => {
                                const realIndex = (safeCurrentPage - 1) * pageSize + index + 1;
                                return (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                                    >
                                        <td className={`px-4 text-center text-zinc-500 text-xs ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {realIndex}
                                        </td>
                                        {!isCompact && (
                                            <td className="py-3 px-4">
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                                    {item.image ? (
                                                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        <td className={`px-4 font-mono text-xs text-blue-600 dark:text-blue-400 font-medium ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {formatProductCode(item.id)}
                                        </td>
                                        <td className={`px-4 font-medium text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {item.name}
                                        </td>
                                        <td className={`px-4 text-zinc-600 dark:text-zinc-400 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {item.category?.name ?? '—'}
                                        </td>
                                        <td className={`px-4 text-right font-medium text-emerald-600 dark:text-emerald-400 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {formatCurrency(item.price)}
                                        </td>
                                        <td className={`px-4 text-center text-xs text-zinc-500 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {Number(item.vat_rate)}%
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                item.is_available
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                            }`}>
                                                {item.is_available ? 'Hoạt động' : 'Ngừng bán'}
                                            </span>
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <div className="flex items-center justify-center space-x-1">
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(item)}
                                                    className="p-1 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                    title="Chỉnh sửa sản phẩm"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDelete(item)}
                                                    className="p-1 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                    title="Xóa sản phẩm"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table Footer Controls (Compact Toggle + Page Size + Pagination) */}
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
                        title="Bật/Tắt chế độ hiển thị thu gọn (ẩn cột ảnh, thu hẹp khoảng cách dòng)"
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
