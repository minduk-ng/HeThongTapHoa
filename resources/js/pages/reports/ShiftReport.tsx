import {
    CalendarClock,
    CircleCheck,
    CircleDollarSign,
    LogIn,
    LogOut,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
    formatDateTime,
    formatVND,
} from '../../components/reports/reportFormat';
import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface ShiftRow {
    id: number;
    status: 'open' | 'closed';
    opened_at: string;
    closed_at: string | null;
    opener_name: string | null;
    closer_name: string | null;
    opening_cash: number;
    closing_cash: number | null;
    actual_cash: number | null;
    difference: number | null;
    note: string | null;
}

interface Metrics {
    total_shift_count: number;
    open_count: number;
    closed_count: number;
    total_opening_cash: number;
    total_difference: number;
}

interface Props {
    rows: ShiftRow[];
    metrics: Metrics;
    startDate: string;
    endDate: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'status', label: 'Trạng thái' },
    { key: 'opened_at', label: 'Mở lúc' },
    { key: 'closed_at', label: 'Đóng lúc' },
    { key: 'opener_name', label: 'Người mở' },
    { key: 'closer_name', label: 'Người đóng' },
    { key: 'opening_cash', label: 'Tiền đầu ca', numeric: true },
    { key: 'closing_cash', label: 'Kỳ vọng', numeric: true },
    { key: 'actual_cash', label: 'Thực tế', numeric: true },
    { key: 'difference', label: 'Chênh lệch', numeric: true },
    { key: 'note', label: 'Ghi chú' },
];

export default function ShiftReport({
    rows,
    metrics,
    startDate,
    endDate,
}: Props) {
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/shifts',
        startDate,
        endDate,
    );
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter(
            (sh) =>
                (!q ||
                    (sh.opener_name ?? '').toLowerCase().includes(q) ||
                    (sh.note ?? '').toLowerCase().includes(q)) &&
                (statusFilter === 'all' || sh.status === statusFilter),
        );
    }, [safeRows, search, statusFilter]);

    const metricCards: MetricCard[] = [
        {
            label: 'Tổng ca',
            value: metrics.total_shift_count,
            icon: CalendarClock,
            color: 'text-sky-600 dark:text-sky-400',
        },
        {
            label: 'Đang mở',
            value: metrics.open_count,
            icon: LogIn,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Đã đóng',
            value: metrics.closed_count,
            icon: LogOut,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
        {
            label: 'Tổng đầu ca',
            value: formatVND(metrics.total_opening_cash),
            icon: CircleDollarSign,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'Tổng chênh lệch',
            value: formatVND(metrics.total_difference),
            icon: metrics.total_difference < 0 ? TrendingDown : TrendingUp,
            color:
                metrics.total_difference < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400',
        },
    ];

    const renderCell = (row: ShiftRow, key: string) => {
        switch (key) {
            case 'status':
                return row.status === 'open' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CircleCheck className="h-3.5 w-3.5" />
                        Đang mở
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        Đã đóng
                    </span>
                );
            case 'opened_at':
                return formatDateTime(row.opened_at);
            case 'closed_at':
                return row.closed_at ? formatDateTime(row.closed_at) : '—';
            case 'opener_name':
                return row.opener_name ?? '—';
            case 'closer_name':
                return row.closer_name ?? '—';
            case 'opening_cash':
                return (
                    <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(row.opening_cash)}
                    </span>
                );
            case 'closing_cash':
                return row.closing_cash !== null
                    ? formatVND(row.closing_cash)
                    : '—';
            case 'actual_cash':
                return row.actual_cash !== null
                    ? formatVND(row.actual_cash)
                    : '—';
            case 'difference':
                return row.difference !== null ? (
                    <span
                        className={`font-medium tabular-nums ${
                            row.difference < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                    >
                        {formatVND(row.difference)}
                    </span>
                ) : (
                    '—'
                );
            case 'note':
                return row.note ?? '—';
            default:
                return '—';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        filtered.map((sh) =>
            visibleKeys.map((key) => {
                switch (key) {
                    case 'opened_at':
                        return formatDateTime(sh.opened_at);
                    case 'closed_at':
                        return sh.closed_at ? formatDateTime(sh.closed_at) : '';
                    case 'status':
                        return sh.status === 'open' ? 'Đang mở' : 'Đã đóng';
                    case 'opener_name':
                        return sh.opener_name ?? '';
                    case 'closer_name':
                        return sh.closer_name ?? '';
                    case 'note':
                        return sh.note ?? '';
                    default:
                        return (
                            (sh as unknown as Record<string, string | number>)[
                                key
                            ] ?? ''
                        );
                }
            }),
        );

    return (
        <ReportPage
            title="Báo cáo ca làm việc"
            subtitle="Tổng hợp các ca mở/đóng và đối soát tiền mặt trong khoảng thời gian"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_ca_lam_viec"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo người mở hoặc ghi chú..."
            extraFilters={
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                    <option value="all">Mọi trạng thái</option>
                    <option value="open">Đang mở</option>
                    <option value="closed">Đã đóng</option>
                </select>
            }
            getExportRows={getExportRows}
        >
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                emptyTitle="Không có ca làm việc nào trong khoảng thời gian này"
                emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
            />
        </ReportPage>
    );
}