import { ArrowDownCircle, ArrowUpCircle, MoveHorizontal, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface Row {
    ingredient_id: number;
    name: string;
    unit: string;
    begin_qty: number;
    import_qty: number;
    export_qty: number;
    adjust_qty: number;
    end_qty: number;
}

interface Props {
    rows: Row[];
    startDate?: string;
    endDate?: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'name', label: 'Nguyên liệu' },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'begin_qty', label: 'Tồn đầu kỳ', numeric: true },
    { key: 'import_qty', label: 'Nhập', numeric: true },
    { key: 'export_qty', label: 'Xuất', numeric: true },
    { key: 'adjust_qty', label: 'Điều chỉnh', numeric: true },
    { key: 'end_qty', label: 'Tồn cuối kỳ', numeric: true },
];

export default function StockMovementReport({
    rows,
    startDate,
    endDate,
}: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/stock-movement',
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

    const totalEnd = useMemo(
        () => safeRows.reduce((s, r) => s + r.end_qty, 0),
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
            label: 'Tổng nhập',
            value: safeRows.reduce((s, r) => s + r.import_qty, 0),
            icon: ArrowDownCircle,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Tổng xuất',
            value: safeRows.reduce((s, r) => s + r.export_qty, 0),
            icon: ArrowUpCircle,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'Tồn cuối kỳ',
            value: totalEnd,
            icon: MoveHorizontal,
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
            case 'begin_qty':
            case 'import_qty':
            case 'export_qty':
            case 'adjust_qty':
            case 'end_qty':
                return (
                    <span className="tabular-nums">
                        {row[key].toLocaleString('vi-VN')}
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
            title="Báo cáo nhập xuất tồn"
            subtitle="Tổng hợp dòng chảy nguyên liệu theo kỳ (tồn đầu kỳ, nhập, xuất, điều chỉnh, tồn cuối kỳ)"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_nhap_xuat_ton"
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
                rowKey={(r) => r.ingredient_id}
                renderCell={renderCell}
                defaultSortKey="name"
                defaultSortDir="asc"
                emptyTitle="Không có dữ liệu trong kỳ"
                emptyHint="Thử chọn khoảng ngày khác"
            />
        </ReportPage>
    );
}
