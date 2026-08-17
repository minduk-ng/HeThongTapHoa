import { ChevronDown, ChevronUp, Rows3 } from 'lucide-react';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

export interface ReportTableColumn {
    key: string;
    label: string;
    numeric?: boolean;
    sortable?: boolean;
    width?: number;
    visible?: boolean;
    align?: 'left' | 'center' | 'right';
}

export const ReportColumnsContext = createContext<{
    hiddenKeys: string[];
} | null>(null);

export interface ReportTableProps<T> {
    columns: ReportTableColumn[];
    rows: T[];
    rowKey: (row: T) => string | number;
    renderCell: (row: T, key: string) => ReactNode;
    defaultSortKey?: string;
    defaultSortDir?: 'asc' | 'desc';
    pagination?: boolean;
    groupStart?: (row: T) => boolean;
    emptyTitle?: string;
    emptyHint?: string;
}

function sortValueOf<T>(row: T, key: string, numeric?: boolean) {
    const v = (row as Record<string, unknown>)[key];

    return numeric ? Number(v) || 0 : String(v ?? '').toLowerCase();
}

export default function ReportTable<T>({
    columns,
    rows,
    rowKey,
    renderCell,
    defaultSortKey,
    defaultSortDir = 'desc',
    pagination = true,
    groupStart,
    emptyTitle = 'Không có dữ liệu',
    emptyHint = 'Thử đổi khoảng ngày hoặc bộ lọc',
}: ReportTableProps<T>) {
    const ctx = useContext(ReportColumnsContext);
    const hidden = new Set(ctx?.hiddenKeys ?? []);
    // Ẩn khi key nằm trong hiddenKeys (seed ban đầu từ visible === false).
    const visibleColumns = columns.filter((c) => !hidden.has(c.key));

    const [sortKey, setSortKey] = useState<string | null>(
        defaultSortKey ?? null,
    );
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState(20);
    const [currentPage, setCurrentPage] = useState(1);

    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        const w: Record<string, number> = {};

        for (const c of columns) {
            if (c.width) {
                w[c.key] = c.width;
            }
        }

        return w;
    });

    const resizeRef = useRef<{
        key: string;
        startX: number;
        startWidth: number;
    } | null>(null);

    const startResize = (e: ReactMouseEvent, key: string) => {
        e.preventDefault();
        e.stopPropagation();
        resizeRef.current = {
            key,
            startX: e.clientX,
            startWidth:
                (e.target as HTMLElement).closest('th')?.offsetWidth ?? 100,
        };

        const onMove = (ev: MouseEvent) => {
            const r = resizeRef.current;

            if (!r) {
                return;
            }

            setColWidths((prev) => ({
                ...prev,
                [r.key]: Math.max(48, r.startWidth + ev.clientX - r.startX),
            }));
        };

        const onUp = () => {
            resizeRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const sortedRows = useMemo(() => {
        if (!sortKey) {
            return rows;
        }

        const sorted = [...rows];
        const col = columns.find((c) => c.key === sortKey);
        const isNum = col?.numeric;

        sorted.sort((a, b) => {
            const vA = sortValueOf(a, sortKey, isNum);
            const vB = sortValueOf(b, sortKey, isNum);

            if (vA < vB) {
                return sortDir === 'asc' ? -1 : 1;
            }

            if (vA > vB) {
                return sortDir === 'asc' ? 1 : -1;
            }

            return 0;
        });

        return sorted;
    }, [rows, sortKey, sortDir, columns]);

    const groups = useMemo(() => {
        if (!groupStart) {
            return null;
        }

        const out: T[][] = [];
        let cur: T[] | null = null;

        for (const r of sortedRows) {
            if (groupStart(r) || cur === null) {
                cur = [r];
                out.push(cur);
            } else {
                cur.push(r);
            }
        }

        return out;
    }, [sortedRows, groupStart]);

    // Phân trang theo nhóm cha (groupStart): page size đếm số nhóm, cắt nguyên nhóm.
    const groupCount = groups?.length ?? 0;
    const totalPages = groupStart
        ? Math.max(1, Math.ceil(groupCount / pageSize))
        : Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const pageRows = pagination
        ? groupStart
            ? (groups
                  ?.slice((safePage - 1) * pageSize, safePage * pageSize)
                  .flat() ?? [])
            : sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize)
        : sortedRows;

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }

        setCurrentPage(1);
    };

    const renderSortIcon = (key: string) => {
        if (sortKey !== key) {
            return (
                <ChevronUp className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />
            );
        }

        return sortDir === 'asc' ? (
            <ChevronUp className="h-3 w-3 text-sky-500" />
        ) : (
            <ChevronDown className="h-3 w-3 text-sky-500" />
        );
    };

    const getCellAlignClass = (c: ReportTableColumn) => {
        if (c.align) {
            if (c.align === 'center') return 'text-center';
            if (c.align === 'right') return 'text-right';
            return 'text-left';
        }
        if (c.numeric) return 'text-center';
        return 'text-left';
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-left">
                    <colgroup>
                        {visibleColumns.map((c) => (
                            <col
                                key={c.key}
                                style={
                                    colWidths[c.key]
                                        ? { width: colWidths[c.key] }
                                        : undefined
                                }
                            />
                        ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-zinc-50 backdrop-blur-sm dark:bg-zinc-800/90">
                        <tr className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                            {visibleColumns.map((c, idx) => (
                                <th
                                    key={c.key}
                                    onClick={() =>
                                        c.sortable !== false &&
                                        handleSort(c.key)
                                    }
                                    className={`relative px-4 py-2.5 select-none text-center ${c.sortable !== false ? 'cursor-pointer' : ''}`}
                                >
                                    <span
                                        className="flex items-center justify-center space-x-1"
                                    >
                                        <span>{c.label}</span>
                                        {c.sortable !== false &&
                                            renderSortIcon(c.key)}
                                    </span>
                                    {idx < visibleColumns.length - 1 && (
                                        <span
                                            onMouseDown={(e) =>
                                                startResize(e, c.key)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-sky-300/60 dark:hover:bg-sky-700/60"
                                        />
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                        {pageRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={visibleColumns.length}
                                    className="px-4 py-12"
                                >
                                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                        {emptyTitle}
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                        {emptyHint}
                                    </p>
                                </td>
                            </tr>
                        ) : (
                            pageRows.map((row) => (
                                <tr
                                    key={rowKey(row)}
                                    className="transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-900/10"
                                >
                                    {visibleColumns.map((c) => (
                                        <td
                                            key={c.key}
                                            className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-sm tabular-nums ${getCellAlignClass(c)} text-zinc-700 dark:text-zinc-300`}
                                        >
                                            {renderCell(row, c.key)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-center space-x-3">
                    <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                        {groupStart
                            ? `${groupCount} hoá đơn / ${sortedRows.length} dòng`
                            : `${sortedRows.length} bản ghi`}
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsCompact((v) => !v)}
                        className={`rounded p-1 transition-colors ${isCompact ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30' : 'text-zinc-400 hover:text-zinc-600'}`}
                        title={isCompact ? 'Chế độ thường' : 'Chế độ compact'}
                    >
                        <Rows3 className="h-3.5 w-3.5" />
                    </button>
                </div>
                {pagination && (
                    <div className="flex items-center space-x-2">
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                            <option value={20}>20 / trang</option>
                            <option value={50}>50 / trang</option>
                            <option value={100}>100 / trang</option>
                        </select>
                        <div className="flex items-center space-x-1">
                            <button
                                type="button"
                                disabled={safePage <= 1}
                                onClick={() => setCurrentPage(safePage - 1)}
                                className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                Trước
                            </button>
                            <span className="px-2 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                                {safePage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={safePage >= totalPages}
                                onClick={() => setCurrentPage(safePage + 1)}
                                className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
