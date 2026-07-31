import { Head } from '@inertiajs/react';
import { Columns3, FileDown, Printer } from 'lucide-react';
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
    const [exportError, setExportError] = useState('');
    const colMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!colMenuOpen) {
            return;
        }

        const handler = (e: MouseEvent) => {
            if (
                colMenuRef.current &&
                !colMenuRef.current.contains(e.target as Node)
            ) {
                setColMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handler);

        return () => document.removeEventListener('mousedown', handler);
    }, [colMenuOpen]);

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
            visibleColumns.map((c) => c.label),
            getExportRows(visibleColumns.map((c) => c.key)),
            exportName,
        );
    };

    const handleExportXLSX = async () => {
        setExportError('');

        try {
            await exportXLSX(
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

    return (
        <DashboardLayout fullWidth={true}>
            <Head title={title} />
            <ReportColumnsContext.Provider value={ctxValue}>
                <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
                    {/* Header + metrics + filter */}
                    <div className="shrink-0 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <h1 className="font-display text-xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                                    {title}
                                </h1>
                                {subtitle && (
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {metrics.map((m) => (
                                <div
                                    key={m.label}
                                    className="rounded-xl border border-zinc-200/80 p-3 dark:border-zinc-800/80"
                                >
                                    <div
                                        className={`flex items-center space-x-1.5 ${m.color}`}
                                    >
                                        <m.icon className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                                            {m.label}
                                        </span>
                                    </div>
                                    <p
                                        className={`mt-1 text-lg font-semibold tabular-nums ${m.color}`}
                                    >
                                        {m.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                            <ReportFilterBar
                                startDate={startDate}
                                endDate={endDate}
                                onRangeApply={onRangeApply}
                                onReset={onReset}
                                searchValue={searchValue}
                                onSearchChange={onSearchChange}
                                searchPlaceholder={searchPlaceholder}
                                extraFilters={extraFilters}
                            />
                        </div>
                    </div>

                    {/* Table card */}
                    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex items-center justify-end space-x-2 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
                            {exportError && (
                                <span className="mr-auto text-[11px] text-rose-600 dark:text-rose-400">
                                    {exportError}
                                </span>
                            )}
                            <div ref={colMenuRef} className="relative">
                                <button
                                    type="button"
                                    onClick={() => setColMenuOpen((v) => !v)}
                                    className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                >
                                    <Columns3 className="h-3.5 w-3.5 stroke-[1.5]" />
                                    <span>Ẩn/hiện cột</span>
                                </button>
                                {colMenuOpen && (
                                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-zinc-200/80 bg-white p-2 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                                        {columns.map((c) => {
                                            const isHidden = hidden.has(c.key);
                                            const disabled =
                                                !isHidden &&
                                                visibleColumns.length <= 1;

                                            return (
                                                <label
                                                    key={c.key}
                                                    className={`flex items-center space-x-2 rounded-md px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={!isHidden}
                                                        disabled={disabled}
                                                        onChange={() =>
                                                            toggleColumn(c.key)
                                                        }
                                                        className="rounded border-zinc-300 accent-sky-600"
                                                    />
                                                    <span>{c.label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleExportCSV}
                                className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                <FileDown className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>CSV</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportXLSX}
                                className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                <FileDown className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>XLSX</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="flex items-center space-x-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                <Printer className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>In</span>
                            </button>
                        </div>

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
