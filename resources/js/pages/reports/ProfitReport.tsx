import {
    AlertTriangle,
    ChartColumn,
    Coins,
    Percent,
    ReceiptText,
    TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportDailyBars from '../../components/reports/ReportDailyBars';
import { formatVND } from '../../components/reports/reportFormat';
import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface ProfitRow {
    menu_item_id: number;
    item_name: string;
    quantity: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
}

interface Metrics {
    revenue: number;
    cost: number;
    profit: number;
    margin: number;
}

interface DailyPoint {
    label: string;
    revenue: number;
    profit: number;
}

interface Props {
    rows: ProfitRow[];
    metrics: Metrics;
    daily: DailyPoint[];
    missing_recipe_count: number;
    startDate: string;
    endDate: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'item_name', label: 'Tên món' },
    { key: 'quantity', label: 'SL bán', numeric: true },
    { key: 'revenue', label: 'Doanh thu thuần', numeric: true },
    { key: 'cost', label: 'Giá vốn', numeric: true },
    { key: 'profit', label: 'LN gộp', numeric: true },
    { key: 'margin', label: 'Margin %', numeric: true },
];

export default function ProfitReport({
    rows,
    metrics,
    daily,
    missing_recipe_count,
    startDate,
    endDate,
}: Props) {
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const safeDaily = useMemo(
        () => (Array.isArray(daily) ? daily : []),
        [daily],
    );
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/profit',
        startDate,
        endDate,
    );
    const [search, setSearch] = useState('');
    const [showBars, setShowBars] = useState(false);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter(
            (r) => !q || r.item_name.toLowerCase().includes(q),
        );
    }, [safeRows, search]);

    const metricCards: MetricCard[] = [
        {
            label: 'Doanh thu thuần',
            value: formatVND(metrics.revenue),
            icon: ReceiptText,
            color: 'text-sky-600 dark:text-sky-400',
        },
        {
            label: 'Giá vốn',
            value: formatVND(metrics.cost),
            icon: Coins,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'LN gộp',
            value: formatVND(metrics.profit),
            icon: TrendingUp,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Margin',
            value: `${metrics.margin}%`,
            icon: Percent,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
    ];

    const renderCell = (row: ProfitRow, key: string) => {
        switch (key) {
            case 'item_name':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.item_name}
                    </span>
                );
            case 'quantity':
                return row.quantity;
            case 'revenue':
            case 'cost':
                return formatVND(row[key]);
            case 'profit':
                return (
                    <span
                        className={`font-medium tabular-nums ${
                            row.profit < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                    >
                        {formatVND(row.profit)}
                    </span>
                );
            case 'margin':
                return `${row.margin}%`;
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
            title="Báo cáo lợi nhuận"
            subtitle="Doanh thu trừ giá vốn nguyên liệu theo định lượng hiện tại"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_loi_nhuan"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm tên món..."
            getExportRows={getExportRows}
            extraActions={
                <button
                    type="button"
                    onClick={() => setShowBars((v) => !v)}
                    className={`flex items-center space-x-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        showBars
                            ? 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-800/60 dark:bg-sky-900/20 dark:text-sky-400'
                            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                >
                    <ChartColumn className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Biểu đồ theo ngày</span>
                </button>
            }
        >
            {missing_recipe_count > 0 && (
                <div className="flex items-center space-x-2 border-b border-amber-200/70 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>
                        {missing_recipe_count} món chưa khai định lượng — giá
                        vốn đang tính 0
                    </span>
                </div>
            )}
            {showBars && (
                <ReportDailyBars
                    title="Doanh thu & lợi nhuận theo ngày"
                    data={safeDaily}
                />
            )}
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.menu_item_id}
                renderCell={renderCell}
                defaultSortKey="profit"
                defaultSortDir="desc"
                emptyTitle="Không có dữ liệu bán hàng trong khoảng thời gian này"
                emptyHint="Thử mở rộng khoảng ngày"
            />
        </ReportPage>
    );
}
