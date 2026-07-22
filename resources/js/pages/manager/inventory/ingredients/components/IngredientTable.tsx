import React, { useState, useMemo } from 'react';

export interface IngredientData {
    id: number;
    code: string;
    name: string;
    unit: string;
    stock_quantity: number;
    min_stock_alert: number;
    cost_price: number;
    expiry_date?: string | null;
}

interface IngredientTableProps {
    ingredients: IngredientData[];
    onEdit: (ingredient: IngredientData) => void;
    onDelete: (ingredient: IngredientData) => void;
    onImportStock: (ingredient: IngredientData) => void;
}

type SortField = 'id' | 'code' | 'name' | 'unit' | 'stock_quantity' | 'cost_price';
type SortDirection = 'asc' | 'desc';

export default function IngredientTable({
    ingredients,
    onEdit,
    onDelete,
    onImportStock,
}: IngredientTableProps) {
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('id');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const sortedIngredients = useMemo(() => {
        const sorted = [...ingredients];
        sorted.sort((a, b) => {
            let valA: any = a[sortField as keyof IngredientData];
            let valB: any = b[sortField as keyof IngredientData];

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [ingredients, sortField, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(sortedIngredients.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedItems = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedIngredients.slice(start, start + pageSize);
    }, [sortedIngredients, safeCurrentPage, pageSize]);

    const formatCurrency = (val: number) => {
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
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-12 text-xs' : 'py-3.5 w-16'}`}>STT</th>
                            <th
                                onClick={() => handleSort('code')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2 w-28' : 'py-3.5 w-32'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Mã NVL</span>
                                    {renderSortIcon('code')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('name')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Tên nguyên liệu</span>
                                    {renderSortIcon('name')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('unit')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2 w-20' : 'py-3.5 w-24'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Đơn vị</span>
                                    {renderSortIcon('unit')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('stock_quantity')}
                                className={`px-4 text-right cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-end">
                                    <span>Tồn kho</span>
                                    {renderSortIcon('stock_quantity')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('cost_price')}
                                className={`px-4 text-right cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-end">
                                    <span>Giá vốn đơn vị</span>
                                    {renderSortIcon('cost_price')}
                                </div>
                            </th>
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-28' : 'py-3.5 w-32'}`}>Trạng thái</th>
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-36' : 'py-3.5 w-40'}`}>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedItems.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                                    Chưa có nguyên liệu nào phù hợp.
                                </td>
                            </tr>
                        ) : (
                            paginatedItems.map((item, index) => {
                                const realIndex = (safeCurrentPage - 1) * pageSize + index + 1;
                                const isLowStock = item.stock_quantity <= item.min_stock_alert;

                                return (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                                    >
                                        <td className={`px-4 text-center text-zinc-500 text-xs ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {realIndex}
                                        </td>
                                        <td className={`px-4 font-mono text-xs text-blue-600 dark:text-blue-400 font-medium ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {item.code || `NVL${String(item.id).padStart(5, '0')}`}
                                        </td>
                                        <td className={`px-4 font-medium text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {item.name}
                                        </td>
                                        <td className={`px-4 text-center font-medium text-zinc-600 dark:text-zinc-400 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
                                                {item.unit}
                                            </span>
                                        </td>
                                        <td className={`px-4 text-right font-bold ${isLowStock ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'} ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {item.stock_quantity.toLocaleString('vi-VN')} {item.unit}
                                        </td>
                                        <td className={`px-4 text-right font-medium text-emerald-600 dark:text-emerald-400 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {formatCurrency(item.cost_price)}/{item.unit}
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                isLowStock
                                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                            }`}>
                                                {isLowStock ? 'Sắp hết hàng' : 'An toàn'}
                                            </span>
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <div className="flex items-center justify-center space-x-1">
                                                <button
                                                    type="button"
                                                    onClick={() => onImportStock(item)}
                                                    className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900 flex items-center space-x-1"
                                                    title="Nhập kho bổ sung"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    <span>Nhập kho</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(item)}
                                                    className="p-1 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                    title="Chỉnh sửa nguyên liệu"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                    </svg>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDelete(item)}
                                                    className="p-1 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                                                    title="Xóa nguyên liệu"
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

            {/* Table Footer Controls */}
            <div className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                {/* Left Side: Compact Toggle & Page Size Selector */}
                <div className="flex flex-wrap items-center gap-3">
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
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage(1)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        |&#9664;
                    </button>

                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9664;
                    </button>

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

                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;
                    </button>

                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;|
                    </button>
                </div>
            </div>
        </div>
    );
}
