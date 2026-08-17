import { Boxes, Layers, Package } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatVND } from '../../components/reports/reportFormat';
import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface Row {
    id: number;
    code: string;
    name: string;
    unit: string;
    stock_quantity: number;
    cost_price: number;
    value: number;
}

interface Props {
    rows: Row[];
    totalValue: number;
    startDate?: string;
    endDate?: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'code', label: 'Mã nguyên liệu' },
    { key: 'name', label: 'Tên nguyên liệu' },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'stock_quantity', label: 'Tồn kho', numeric: true },
    { key: 'cost_price', label: 'Giá vốn', numeric: true },
    { key: 'value', label: 'Giá trị tồn', numeric: true },
];

export default function InventoryValueReport({
    rows,
    startDate,
    endDate,
}: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/inventory-value',
        startDate ?? today,
        endDate ?? today,
    );

    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return safeRows;

        return safeRows.filter(
            (r) =>
                r.name.toLowerCase().includes(q) ||
                r.code.toLowerCase().includes(q),
        );
    }, [safeRows, search]);

    const totalStock = useMemo(
        () => filtered.reduce((acc, r) => acc + r.stock_quantity, 0),
        [filtered],
    );

    const currentTotalValue = useMemo(
        () => filtered.reduce((acc, r) => acc + r.value, 0),
        [filtered],
    );

    const metricCards: MetricCard[] = [
        {
            label: 'Tổng giá trị kho',
            value: formatVND(currentTotalValue),
            icon: Boxes,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Số mặt hàng',
            value: filtered.length,
            icon: Layers,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
        {
            label: 'Tổng lượng tồn',
            value: totalStock.toLocaleString('vi-VN'),
            icon: Package,
            color: 'text-sky-600 dark:text-sky-400',
        },
    ];

    const renderCell = (row: Row, key: string) => {
        switch (key) {
            case 'code':
                return (
                    <span className="font-mono text-xs font-medium text-sky-600 dark:text-sky-400">
                        {row.code}
                    </span>
                );
            case 'name':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.name}
                    </span>
                );
            case 'unit':
                return row.unit;
            case 'stock_quantity':
                return (
                    <span className="tabular-nums">
                        {row.stock_quantity.toLocaleString('vi-VN')}
                    </span>
                );
            case 'cost_price':
                return (
                    <span className="tabular-nums">
                        {formatVND(row.cost_price)}
                    </span>
                );
            case 'value':
                return (
                    <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatVND(row.value)}
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
            title="Báo cáo giá trị kho"
            subtitle="Tổng hợp giá trị tồn kho nguyên liệu hiện tại theo giá vốn"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_gia_tri_kho"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo tên hoặc mã nguyên liệu..."
            getExportRows={getExportRows}
        >
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                defaultSortKey="value"
                defaultSortDir="desc"
                emptyTitle="Không có nguyên liệu nào trong kho"
                emptyHint="Thử đổi bộ lọc tìm kiếm"
            />
        </ReportPage>
    );
}
