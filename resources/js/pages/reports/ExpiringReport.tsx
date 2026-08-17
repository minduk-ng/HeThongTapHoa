import { CheckCircle2, Flame, Hourglass, Package } from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

type ExpiringStatus = 'expired' | 'soon' | 'ok';

interface Row {
    id: number;
    ingredient_name: string;
    unit: string;
    expiry_date: string;
    days_left: number;
    quantity_remaining: number;
    status: ExpiringStatus;
}

interface Props {
    rows: Row[];
    startDate?: string;
    endDate?: string;
}

const statusConfig: Record<
    ExpiringStatus,
    { label: string; className: string }
> = {
    expired: {
        label: 'Hết hạn',
        className:
            'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    },
    soon: {
        label: 'Sắp hết hạn',
        className:
            'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    },
    ok: {
        label: 'Còn hạn',
        className:
            'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    },
};

const COLUMNS: ReportTableColumn[] = [
    { key: 'ingredient_name', label: 'Tên nguyên liệu' },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'expiry_date', label: 'Hạn sử dụng' },
    { key: 'days_left', label: 'Còn lại (ngày)', numeric: true },
    { key: 'quantity_remaining', label: 'Tồn lô', numeric: true },
    { key: 'status', label: 'Trạng thái' },
];

export default function ExpiringReport({
    rows,
    startDate,
    endDate,
}: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/expiring',
        startDate ?? today,
        endDate ?? today,
    );

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter((r) => {
            const matchesSearch =
                !q || (r.ingredient_name ?? '').toLowerCase().includes(q);
            const matchesStatus =
                statusFilter === 'all' || r.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [safeRows, search, statusFilter]);

    const expiredCount = useMemo(
        () => safeRows.filter((r) => r.status === 'expired').length,
        [safeRows],
    );

    const soonCount = useMemo(
        () => safeRows.filter((r) => r.status === 'soon').length,
        [safeRows],
    );

    const okCount = useMemo(
        () => safeRows.filter((r) => r.status === 'ok').length,
        [safeRows],
    );

    const metricCards: MetricCard[] = [
        {
            label: 'Tổng số lô',
            value: safeRows.length,
            icon: Package,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
        {
            label: 'Đã hết hạn',
            value: expiredCount,
            icon: Flame,
            color: 'text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Sắp hết hạn (≤ 7 ngày)',
            value: soonCount,
            icon: Hourglass,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'Còn hạn an toàn',
            value: okCount,
            icon: CheckCircle2,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
    ];

    const renderCell = (row: Row, key: string) => {
        switch (key) {
            case 'ingredient_name':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.ingredient_name}
                    </span>
                );
            case 'unit':
                return row.unit;
            case 'expiry_date':
                return <span className="tabular-nums">{row.expiry_date}</span>;
            case 'days_left':
                return (
                    <span
                        className={`tabular-nums font-semibold ${
                            row.days_left < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : row.days_left <= 7
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                    >
                        {row.days_left}
                    </span>
                );
            case 'quantity_remaining':
                return (
                    <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                        {row.quantity_remaining.toLocaleString('vi-VN')}
                    </span>
                );
            case 'status':
                return (
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig[row.status].className}`}
                    >
                        {statusConfig[row.status].label}
                    </span>
                );
            default:
                return '—';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        filtered.map((r) =>
            visibleKeys.map((key) => {
                if (key === 'status') {
                    return statusConfig[r.status].label;
                }

                return (
                    (r as unknown as Record<string, string | number>)[key] ?? ''
                );
            }),
        );

    return (
        <ReportPage
            title="Báo cáo nguyên liệu sắp hết hạn"
            subtitle="Theo dõi hạn sử dụng theo từng lô nhập để kịp thời xử lý hoặc xuất kho trước"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_nguyen_lieu_het_han"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo tên nguyên liệu..."
            extraFilters={
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                    <option value="all">Mọi trạng thái</option>
                    <option value="expired">Đã hết hạn</option>
                    <option value="soon">Sắp hết hạn (≤ 7 ngày)</option>
                    <option value="ok">Còn hạn</option>
                </select>
            }
            getExportRows={getExportRows}
        >
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                defaultSortKey="days_left"
                defaultSortDir="asc"
                emptyTitle="Không có lô nguyên liệu nào"
                emptyHint="Thử đổi bộ lọc tìm kiếm"
            />
        </ReportPage>
    );
}
