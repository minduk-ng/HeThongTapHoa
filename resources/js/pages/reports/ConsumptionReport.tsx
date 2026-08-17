import { PackageSearch, Timer, Scale, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface Row {
    id: number;
    name: string;
    unit: string;
    quantity: number;
    cost: number;
}

interface Props {
    rows: Row[];
    startDate?: string;
    endDate?: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'name', label: 'Nguyên liệu' },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'quantity', label: 'Lượng tiêu thụ', numeric: true },
    { key: 'cost', label: 'Giá trị tiêu thụ', numeric: true },
];

export default function ConsumptionReport({ rows, startDate, endDate }: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/consumption',
        startDate ?? today,
        endDate ?? today,
    );

    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter(
            (r) => !q || r.name.toLowerCase().includes(q),
        );
    }, [safeRows, search]);

    const totalQty = useMemo(
        () => safeRows.reduce((s, r) => s + r.quantity, 0),
        [safeRows],
    );
    const totalCost = useMemo(
        () => safeRows.reduce((s, r) => s + r.cost, 0),
        [safeRows],
    );

    const metricCards: MetricCard[] = [
        {
            label: 'Số nguyên liệu',
            value: safeRows.length,
            icon: Scale,
            color: 'text-sky-600 dark:text-sky-400',
        },
        {
            label: 'Lượng tiêu thụ',
            value: totalQty,
            icon: PackageSearch,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'Giá trị tiêu thụ',
            value: totalCost,
            icon: Wallet,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Báo cáo theo kỳ',
            value: '—',
            icon: Timer,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
    ];

    const renderCell = (row: Row, key: string) => {
        switch (key) {
            case 'name':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.name}
                    </span>
                );
            case 'unit':
                return row.unit;
            case 'quantity':
                return (
                    <span className="tabular-nums">
                        {row.quantity.toLocaleString('vi-VN')}
                    </span>
                );
            case 'cost':
                return (
                    <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                        {row.cost.toLocaleString('vi-VN')} đ
                    </span>
                );
            default:
                return '—';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        filtered.map((r) =>
            visibleKeys.map(
                (key) =>
                    (r as unknown as Record<string, string | number>)[key] ??
                    '',
            ),
        );

    return (
        <ReportPage
            title="Báo cáo tiêu thụ nguyên liệu"
            subtitle="Lượng nguyên liệu đã dùng qua các món đã bán trong kỳ, kèm giá trị"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_tieu_thu_nguyen_lieu"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo tên nguyên liệu..."
            getExportRows={getExportRows}
        >
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                defaultSortKey="quantity"
                defaultSortDir="desc"
                emptyTitle="Không có dữ liệu tiêu thụ trong kỳ"
                emptyHint="Chưa có món bán hoặc không có định lượng cho các món đã bán"
            />
        </ReportPage>
    );
}
