import React, { useMemo, useState } from 'react';
import {
    ChevronUp,
    ChevronDown,
    Rows3,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
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
                <ChevronUp className="ml-1 inline h-3.5 w-3.5 text-zinc-300 opacity-50 dark:text-zinc-600" />
            );
        }
        return sortDirection === 'asc' ? (
            <ChevronUp className="ml-1 inline h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
        ) : (
            <ChevronDown className="ml-1 inline h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
        );
    };

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-xs dark:bg-zinc-900">
            <div className="min-h-0 flex-1 overflow-auto">
                <table className="relative w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 font-medium text-zinc-600 backdrop-blur-xs select-none dark:border-zinc-800 dark:bg-zinc-800/90 dark:text-zinc-400">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    onClick={
                                        col.sortable
                                            ? () => handleSort(col.key)
                                            : undefined
                                    }
                                    className={`relative px-4 ${isCompact ? 'py-2 text-xs' : 'py-3.5'} text-center ${col.headerClassName ?? ''} ${col.sortable ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800' : ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        <span>{col.header}</span>
                                        {col.sortable && (
                                            <span className="shrink-0">
                                                {renderSortIcon(col.key)}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-zinc-800 dark:divide-zinc-800 dark:text-zinc-200">
                        {paginatedRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-6 py-12"
                                >
                                    <div className="flex max-w-md items-start space-x-4">
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                {emptyMessage}
                                            </h4>
                                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                Không có dữ liệu phù hợp với
                                                điều kiện hiện tại.
                                            </p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedRows.map((row, index) => (
                                <tr
                                    key={rowKey(row)}
                                    onClick={
                                        onRowClick
                                            ? () => onRowClick(row)
                                            : undefined
                                    }
                                    className={`transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
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

            <div className="flex flex-col items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs sm:flex-row dark:border-zinc-800 dark:bg-zinc-800/60">
                <div className="flex flex-wrap items-center gap-3">
                    {showCompactToggle && (
                        <button
                            type="button"
                            onClick={() => setIsCompact(!isCompact)}
                            className={`flex items-center space-x-1.5 rounded-lg border px-3 py-1.5 font-medium transition-colors ${
                                isCompact
                                    ? 'border-sky-600 bg-sky-600 text-white shadow-xs'
                                    : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                            }`}
                            title="Bật/Tắt chế độ hiển thị thu gọn"
                        >
                            <Rows3 className="h-4 w-4 stroke-[1.5]" />
                            <span>
                                {isCompact ? 'Xem đầy đủ' : 'Thu gọn bảng'}
                            </span>
                        </button>
                    )}
                    {showPageSize && (
                        <div className="flex items-center space-x-1 border-l border-zinc-200 pl-3 dark:border-zinc-700">
                            <span className="mr-1 text-zinc-500">
                                Hiển thị:
                            </span>
                            {[20, 50, 100].map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    onClick={() => {
                                        setPageSize(size);
                                        setCurrentPage(1);
                                    }}
                                    className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                                        pageSize === size
                                            ? 'bg-sky-600 text-white'
                                            : 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    {size}
                                </button>
                            ))}
                            <span className="ml-1 text-zinc-400">
                                dòng/trang
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center space-x-1">
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage(1)}
                        className="rounded-lg border border-zinc-300 bg-white p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        <ChevronsLeft className="h-4 w-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() =>
                            setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        className="rounded-lg border border-zinc-300 bg-white p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        <ChevronLeft className="h-4 w-4 stroke-[1.5]" />
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
                                if (!isNaN(val))
                                    setCurrentPage(
                                        Math.min(Math.max(1, val), totalPages),
                                    );
                            }}
                            className="w-12 rounded-md border border-zinc-300 bg-white py-1 text-center font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        <span>/ {totalPages}</span>
                    </div>
                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() =>
                            setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        className="rounded-lg border border-zinc-300 bg-white p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        <ChevronRight className="h-4 w-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="rounded-lg border border-zinc-300 bg-white p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        <ChevronsRight className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>
            </div>
        </div>
    );
}
