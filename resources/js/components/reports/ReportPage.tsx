import { Head } from '@inertiajs/react';
import { ChevronDown, Columns3, FileDown, Printer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import DashboardLayout from '../../layouts/DashboardLayout';
import { exportCSV, exportXLSX } from './reportExport';
import ReportFilterBar from './ReportFilterBar';
import type { ReportTableColumn } from './ReportTable';
import { ReportColumnsContext } from './ReportTable';

export interface MetricCard {
    label: string;
    value: string | number;
    icon: LucideIcon;
    color: string;
}

export interface ReportPageProps {
    title: string;
    subtitle?: string;
    metrics: MetricCard[];
    columns: ReportTableColumn[];
    exportName: string;
    startDate: string;
    endDate: string;
    onRangeApply: (start: string, end: string) => void;
    onReset: () => void;
    searchValue: string;
    onSearchChange: (v: string) => void;
    searchPlaceholder?: string;
    extraFilters?: ReactNode;
    getExportRows: (visibleKeys: string[]) => (string | number)[][];
    children: ReactNode;
}

export default function ReportPage({
    title,
    subtitle,
    metrics,
    columns,
    exportName,
    startDate,
    endDate,
    onRangeApply,
    onReset,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    extraFilters,
    getExportRows,
    children,
}: ReportPageProps) {
    const [hiddenKeys, setHiddenKeys] = useState<string[]>(() =>
        columns.filter((c) => c.visible === false).map((c) => c.key),
    );
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [exportError, setExportError] = useState('');
    const colMenuRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    const formatRange = (start: string, end: string) =>
        `Từ ngày ${start.split('-').reverse().join('/')} đến ${end
            .split('-')
            .reverse()
            .join('/')}`;

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;

            if (
                colMenuOpen &&
                colMenuRef.current &&
                !colMenuRef.current.contains(target)
            ) {
                setColMenuOpen(false);
            }

            if (
                exportMenuOpen &&
                exportMenuRef.current &&
                !exportMenuRef.current.contains(target)
            ) {
                setExportMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handler);

        return () => document.removeEventListener('mousedown', handler);
    }, [colMenuOpen, exportMenuOpen]);

    const hidden = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
    const visibleColumns = columns.filter((c) => !hidden.has(c.key));

    const toggleColumn = (key: string) => {
        setHiddenKeys((prev) => {
            if (prev.includes(key)) {
                return prev.filter((k) => k !== key);
            }

            // Tối thiểu 1 cột hiện.
            if (columns.length - prev.length <= 1) {
                return prev;
            }

            return [...prev, key];
        });
    };

    const handleExportCSV = () => {
        exportCSV(
            title,
            formatRange(startDate, endDate),
            visibleColumns.map((c) => c.label),
            getExportRows(visibleColumns.map((c) => c.key)),
            exportName,
        );
    };

    const handleExportXLSX = async () => {
        setExportError('');

        try {
            await exportXLSX(
                title,
                formatRange(startDate, endDate),
                visibleColumns.map((c) => c.label),
                getExportRows(visibleColumns.map((c) => c.key)),
                exportName,
            );
        } catch {
            setExportError(
                'Không tải được thư viện xuất Excel — kiểm tra kết nối mạng rồi thử lại.',
            );
        }
    };

    const ctxValue = useMemo(() => ({ hiddenKeys }), [hiddenKeys]);

    const filterActions = (
        <div className="flex items-center space-x-2">
            {exportError && (
                <span className="text-[11px] text-rose-600 dark:text-rose-400">
                    {exportError}
                </span>
            )}
            <div ref={colMenuRef} className="relative">
                <button
                    type="button"
                    onClick={() => setColMenuOpen((v) => !v)}
                    className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                    <Columns3 className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Cột</span>
                </button>
                {colMenuOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-zinc-200/80 bg-white p-2 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                        {columns.map((c) => {
                            const isHidden = hidden.has(c.key);
                            const disabled =
                                !isHidden && visibleColumns.length <= 1;

                            return (
                                <label
                                    key={c.key}
                                    className={`flex items-center space-x-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!isHidden}
                                        disabled={disabled}
                                        onChange={() => toggleColumn(c.key)}
                                        className="rounded border-zinc-300 accent-sky-600"
                                    />
                                    <span>{c.label}</span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
            <div ref={exportMenuRef} className="relative">
                <button
                    type="button"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                    <FileDown className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Xuất</span>
                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                </button>
                {exportMenuOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-32 rounded-xl border border-zinc-200/80 bg-white p-1 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                        <button
                            type="button"
                            onClick={() => {
                                handleExportCSV();
                                setExportMenuOpen(false);
                            }}
                            className="flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            <span>Xuất CSV</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                handleExportXLSX();
                                setExportMenuOpen(false);
                            }}
                            className="flex w-full items-center space-x-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            <span>Xuất Excel</span>
                        </button>
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
                <Printer className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>In</span>
            </button>
        </div>
    );

    return (
        <DashboardLayout fullWidth={true}>
            <Head title={title} />
            <ReportColumnsContext.Provider value={ctxValue}>
                <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
                    {/* Header + metrics + filter */}
                    <div className="shrink-0 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <h1 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                                    {title}
                                </h1>
                                {subtitle && (
                                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Metrics hiển thị dạng inline text ngăn cách nhau bởi dấu chấm tròn */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-100 pt-2 text-sm text-zinc-500 dark:text-zinc-400">
                            {metrics.map((m, idx) => (
                                <div
                                    key={m.label}
                                    className="flex items-center space-x-2"
                                >
                                    {idx > 0 && (
                                        <span className="text-zinc-300 select-none dark:text-zinc-700">
                                            •
                                        </span>
                                    )}
                                    <div className="flex items-center space-x-1">
                                        <m.icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                        <span>{m.label}:</span>
                                    </div>
                                    <span
                                        className={`font-semibold tabular-nums ${m.color}`}
                                    >
                                        {m.value}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                            <ReportFilterBar
                                startDate={startDate}
                                endDate={endDate}
                                onRangeApply={onRangeApply}
                                onReset={onReset}
                                searchValue={searchValue}
                                onSearchChange={onSearchChange}
                                searchPlaceholder={searchPlaceholder}
                                extraFilters={extraFilters}
                                actions={filterActions}
                            />
                        </div>
                    </div>

                    {/* Table card */}
                    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        {children}
                    </div>
                </div>

                {/* Bảng in: đầy đủ rows đã lọc, theo cột đang hiện, không phân trang */}
                <div className="print-area hidden print:block">
                    <h2>{title}</h2>
                    <p>
                        {startDate} – {endDate}
                    </p>
                    <table>
                        <thead>
                            <tr>
                                {visibleColumns.map((c) => (
                                    <th key={c.key}>{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {getExportRows(
                                visibleColumns.map((c) => c.key),
                            ).map((row, i) => (
                                <tr key={i}>
                                    {row.map((cell, j) => (
                                        <td key={j}>{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </ReportColumnsContext.Provider>
        </DashboardLayout>
    );
}
