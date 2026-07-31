import { RotateCcw, Search } from 'lucide-react';
import type { ReactNode } from 'react';

import DatePicker from '../DatePicker';

export interface ReportFilterBarProps {
    startDate: string;
    endDate: string;
    onRangeApply: (start: string, end: string) => void;
    onReset: () => void;
    searchValue: string;
    onSearchChange: (v: string) => void;
    searchPlaceholder?: string;
    extraFilters?: ReactNode;
    actions?: ReactNode;
}

export default function ReportFilterBar({
    startDate,
    endDate,
    onRangeApply,
    onReset,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    extraFilters,
    actions,
}: ReportFilterBarProps) {
    const handleRange = (start: string | null, end: string | null) => {
        if (!start || !end) {
            return;
        }

        onRangeApply(start, end);
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <DatePicker
                    mode="range"
                    startDate={startDate}
                    endDate={endDate}
                    onChange={handleRange}
                />
                <div className="relative">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                        type="text"
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={searchPlaceholder ?? 'Tìm kiếm...'}
                        className="w-56 rounded-lg border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm text-zinc-900 transition-colors outline-none placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </div>
                {extraFilters}
                <button
                    type="button"
                    onClick={onReset}
                    className="flex items-center space-x-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                >
                    <RotateCcw className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Đặt lại</span>
                </button>
            </div>
            {actions && (
                <div className="flex items-center space-x-2">{actions}</div>
            )}
        </div>
    );
}
