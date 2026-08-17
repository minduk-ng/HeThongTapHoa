import React, { useMemo, useState } from 'react';
import {
    ChevronUp,
    ChevronDown,
    Rows3,
} from 'lucide-react';

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
    emptyHint?: string;
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
    emptyHint = 'Không tìm thấy dữ liệu phù hợp với điều kiện lọc',
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
    const [sortField, setSortField] = useState<string | undefined>(
        defaultSortKey,
    );
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
        defaultSortDirection,
    );

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
                const cmp = (valA as string)
                    .toLowerCase()
                    .localeCompare((valB as string).toLowerCase());
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
            return (
                <ChevronUp className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />
            );
        }
        return sortDirection === 'asc' ? (
            <ChevronUp className="h-3 w-3 text-sky-500" />
        ) : (
            <ChevronDown className="h-3 w-3 text-sky-500" />
        );
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-left">
                    <thead className="sticky top-0 z-10 border-b border-zinc-200/80 bg-zinc-50 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-800/90">
                        <tr className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400 text-center">
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    onClick={
                                        col.sortable
                                            ? () => handleSort(col.key)
                                            : undefined
                                    }
                                    className={`relative px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-center select-none ${col.headerClassName ?? ''} ${col.sortable ? 'cursor-pointer hover:bg-zinc-100/70 dark:hover:bg-zinc-700/50' : ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
                                >
                                    <div className="flex items-center justify-center space-x-1">
                                        <span>{col.header}</span>
                                        {col.sortable && renderSortIcon(col.key)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                        {paginatedRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-12 text-center"
                                >
                                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                        {emptyMessage}
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                        {emptyHint}
                                    </p>
                                </td>
                            </tr>
                        ) : (
                            paginatedRows.map((row) => (
                                <tr
                                    key={rowKey(row)}
                                    onClick={
                                        onRowClick
                                            ? () => onRowClick(row)
                                            : undefined
                                    }
                                    className={`transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-900/10 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                                >
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`px-4 ${isCompact ? (col.compactClassName ?? 'py-1.5') : 'py-2.5'} text-sm tabular-nums text-zinc-700 dark:text-zinc-300 ${alignClass(col.align)} ${col.className ?? ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
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

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className="flex items-center space-x-3">
                    <span className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                        {sortedRows.length} bản ghi
                    </span>
                    {showCompactToggle && (
                        <button
                            type="button"
                            onClick={() => setIsCompact(!isCompact)}
                            className={`rounded p-1 transition-colors ${
                                isCompact
                                    ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
                                    : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                            }`}
                            title={isCompact ? 'Chế độ thường' : 'Chế độ compact'}
                        >
                            <Rows3 className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex items-center space-x-2">
                    {showPageSize && totalPages > 0 && (
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                            <option value={20}>20 / trang</option>
                            <option value={50}>50 / trang</option>
                            <option value={100}>100 / trang</option>
                        </select>
                    )}
                    <div className="flex items-center space-x-1">
                        <button
                            type="button"
                            disabled={safeCurrentPage <= 1}
                            onClick={() => setCurrentPage(safeCurrentPage - 1)}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                            Trước
                        </button>
                        <span className="px-2 text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                            {safeCurrentPage} / {totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={safeCurrentPage >= totalPages}
                            onClick={() => setCurrentPage(safeCurrentPage + 1)}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                            Sau
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
