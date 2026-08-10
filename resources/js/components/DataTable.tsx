import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Rows3 } from 'lucide-react';

export interface DataTableColumn<T> {
    key: string;
    header: React.ReactNode;
    sortable?: boolean;
    render: (row: T) => React.ReactNode;
    className?: string;
    headerClassName?: string;
    compactClassName?: string;
    hideWhenCompact?: boolean;
    align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    onRowClick?: (row: T) => void;
    emptyMessage?: string;
    defaultSortKey?: string;
    defaultSortDirection?: 'asc' | 'desc';
    defaultPageSize?: number;
    getSortValue?: (row: T, key: string) => string | number;
    showCompactToggle?: boolean;
    showPageSize?: boolean;
    rowClassName?: (row: T) => string;
}

export default function DataTable<T>({
    columns,
    rows,
    rowKey,
    onRowClick,
    emptyMessage = 'Không có dữ liệu',
    defaultSortKey,
    defaultSortDirection = 'asc',
    defaultPageSize = 20,
    getSortValue,
    showCompactToggle = true,
    showPageSize = true,
    rowClassName,
}: DataTableProps<T>) {
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(defaultPageSize);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<string | undefined>(defaultSortKey);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

    const alignClass = (align?: 'left' | 'center' | 'right') => {
        if (align === 'center') return 'text-center';
        if (align === 'right') return 'text-right';
        return 'text-left';
    };

    const sortedRows = useMemo(() => {
        if (!sortField || !getSortValue) return rows;
        const sorted = [...rows];
        sorted.sort((a, b) => {
            const valA = getSortValue(a, sortField);
            const valB = getSortValue(b, sortField);
            if (typeof valA === 'string') {
                const cmp = (valA as string).toLowerCase().localeCompare((valB as string).toLowerCase());
                return sortDirection === 'asc' ? cmp : -cmp;
            }
            const numA = Number(valA);
            const numB = Number(valB);
            if (numA < numB) return sortDirection === 'asc' ? -1 : 1;
            if (numA > numB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [rows, sortField, sortDirection, getSortValue]);

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedRows = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, safeCurrentPage, pageSize]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const renderSortIcon = (field: string) => {
        if (sortField !== field) {
            return <ChevronUp className="w-3.5 h-3.5 ml-1 text-zinc-300 dark:text-zinc-600 opacity-50 inline" />;
        }
        return sortDirection === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        ) : (
            <ChevronDown className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl shadow-xs">
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-left text-sm relative">
                    <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800 select-none">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    className={`px-4 ${isCompact ? 'py-2 text-xs' : 'py-3.5'} ${alignClass(col.align)} ${col.headerClassName ?? ''} ${col.sortable ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800' : ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
                                >
                                    <div className={`flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                                        <span>{col.header}</span>
                                        {col.sortable && renderSortIcon(col.key)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedRows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="py-12 px-6">
                                    <div className="flex items-start space-x-4 max-w-md">
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{emptyMessage}</h4>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Không có dữ liệu phù hợp với điều kiện hiện tại.</p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedRows.map((row, index) => (
                                <tr
                                    key={rowKey(row)}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                                >
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`px-4 ${isCompact ? (col.compactClassName ?? 'py-1.5') : 'py-3'} ${alignClass(col.align)} ${col.className ?? ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
                                        >
                                            {col.render(row)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                    {showCompactToggle && (
                        <button
                            type="button"
                            onClick={() => setIsCompact(!isCompact)}
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                                isCompact
                                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                    : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                            }`}
                            title="Bật/Tắt chế độ hiển thị thu gọn"
                        >
                            <Rows3 className="w-4 h-4 stroke-[1.5]" />
                            <span>{isCompact ? 'Xem đầy đủ' : 'Thu gọn bảng'}</span>
                        </button>
                    )}
                    {showPageSize && (
                        <div className="flex items-center space-x-1 border-l border-zinc-200 dark:border-zinc-700 pl-3">
                            <span className="text-zinc-500 mr-1">Hiển thị:</span>
                            {[20, 50, 100].map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    onClick={() => { setPageSize(size); setCurrentPage(1); }}
                                    className={`px-2 py-1 rounded-md font-semibold transition-colors ${
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
                    )}
                </div>

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
                                if (!isNaN(val)) setCurrentPage(Math.min(Math.max(1, val), totalPages));
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
