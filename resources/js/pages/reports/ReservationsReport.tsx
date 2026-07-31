import { CalendarCheck, CheckCircle2, Coins, XCircle } from 'lucide-react';
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

interface ReservationRow {
    id: number;
    reservation_name: string;
    reservation_phone: string | null;
    reservation_time: string;
    table_name: string | null;
    result: 'arrived' | 'cancelled' | 'pending';
    deposit_total: number;
    reservation_note: string | null;
}

interface Metrics {
    total: number;
    arrived: number;
    cancelled: number;
    deposit_total: number;
}

interface Props {
    rows: ReservationRow[];
    metrics: Metrics;
    startDate: string;
    endDate: string;
}

const RESULT_LABELS: Record<string, string> = {
    arrived: 'Đã đến',
    cancelled: 'Đã huỷ',
    pending: 'Chưa chốt',
};

const RESULT_CLASSES: Record<string, string> = {
    arrived:
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    cancelled:
        'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    pending:
        'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const COLUMNS: ReportTableColumn[] = [
    { key: 'reservation_name', label: 'Tên khách' },
    { key: 'reservation_phone', label: 'SĐT' },
    { key: 'reservation_time', label: 'Thời gian đặt' },
    { key: 'table_name', label: 'Bàn' },
    { key: 'result', label: 'Kết quả' },
    { key: 'deposit_total', label: 'Cọc', numeric: true },
    { key: 'reservation_note', label: 'Ghi chú' },
];

export default function ReservationsReport({
    rows,
    metrics,
    startDate,
    endDate,
}: Props) {
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/reservations',
        startDate,
        endDate,
    );
    const [search, setSearch] = useState('');
    const [resultFilter, setResultFilter] = useState('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter(
            (r) =>
                (!q ||
                    r.reservation_name.toLowerCase().includes(q) ||
                    (r.reservation_phone ?? '').includes(q) ||
                    (r.table_name ?? '').toLowerCase().includes(q)) &&
                (resultFilter === 'all' || r.result === resultFilter),
        );
    }, [safeRows, search, resultFilter]);

    const metricCards: MetricCard[] = [
        {
            label: 'Lượt đặt',
            value: metrics.total,
            icon: CalendarCheck,
            color: 'text-purple-600 dark:text-purple-400',
        },
        {
            label: 'Đã đến',
            value: metrics.arrived,
            icon: CheckCircle2,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Đã huỷ',
            value: metrics.cancelled,
            icon: XCircle,
            color: 'text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Tổng cọc đang giữ',
            value: formatVND(metrics.deposit_total),
            icon: Coins,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
    ];

    const renderCell = (row: ReservationRow, key: string) => {
        switch (key) {
            case 'reservation_name':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.reservation_name}
                    </span>
                );
            case 'reservation_phone':
                return row.reservation_phone ?? '—';
            case 'reservation_time':
                return formatDateTime(row.reservation_time);
            case 'table_name':
                return row.table_name ?? '—';
            case 'result':
                return (
                    <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${RESULT_CLASSES[row.result]}`}
                    >
                        {RESULT_LABELS[row.result]}
                    </span>
                );
            case 'deposit_total':
                return row.deposit_total > 0
                    ? formatVND(row.deposit_total)
                    : '—';
            case 'reservation_note':
                return row.reservation_note ?? '—';
            default:
                return '—';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        filtered.map((r) =>
            visibleKeys.map((key) => {
                switch (key) {
                    case 'reservation_time':
                        return formatDateTime(r.reservation_time);
                    case 'result':
                        return RESULT_LABELS[r.result];
                    case 'deposit_total':
                        return r.deposit_total;
                    default:
                        return (
                            (r as unknown as Record<string, string | number>)[
                                key
                            ] ?? ''
                        );
                }
            }),
        );

    return (
        <ReportPage
            title="Báo cáo đặt bàn"
            subtitle="Lượt đặt bàn và kết quả trong khoảng thời gian đặt hẹn"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_dat_ban"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm tên, SĐT, bàn..."
            extraFilters={
                <select
                    value={resultFilter}
                    onChange={(e) => setResultFilter(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                    <option value="all">Mọi kết quả</option>
                    <option value="arrived">Đã đến</option>
                    <option value="cancelled">Đã huỷ</option>
                    <option value="pending">Chưa chốt</option>
                </select>
            }
            getExportRows={getExportRows}
        >
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                defaultSortKey="reservation_time"
                defaultSortDir="asc"
                emptyTitle="Không có lượt đặt bàn nào trong khoảng thời gian này"
                emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
            />
        </ReportPage>
    );
}
