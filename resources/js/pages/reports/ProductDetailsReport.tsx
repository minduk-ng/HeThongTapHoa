import { Award, ClipboardList, ReceiptText, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatVND } from '../../components/reports/reportFormat';
import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface ProductRow {
    menu_item_id: number;
    item_name: string;
    category_name: string | null;
    quantity: number;
    revenue: number;
    avg_price: number;
}

interface Metrics {
    revenue: number;
    quantity_total: number;
    item_count: number;
    top_item: string | null;
}

interface Category {
    id: number;
    name: string;
}

interface Props {
    rows: ProductRow[];
    metrics: Metrics;
    categories: Category[];
    startDate: string;
    endDate: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'item_name', label: 'Tên món' },
    { key: 'category_name', label: 'Danh mục' },
    { key: 'quantity', label: 'SL bán', numeric: true },
    { key: 'revenue', label: 'Doanh thu', numeric: true },
    { key: 'avg_price', label: 'Giá TB', numeric: true },
];

export default function ProductDetailsReport({
    rows,
    metrics,
    categories,
    startDate,
    endDate,
}: Props) {
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const safeCategories = useMemo(
        () => (Array.isArray(categories) ? categories : []),
        [categories],
    );
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/product-details',
        startDate,
        endDate,
    );
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter(
            (r) =>
                (!q || r.item_name.toLowerCase().includes(q)) &&
                (categoryFilter === 'all' ||
                    r.category_name === categoryFilter),
        );
    }, [safeRows, search, categoryFilter]);

    const metricCards: MetricCard[] = [
        {
            label: 'Doanh thu',
            value: formatVND(metrics.revenue),
            icon: ReceiptText,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'SL bán',
            value: metrics.quantity_total,
            icon: ShoppingBag,
            color: 'text-sky-600 dark:text-sky-400',
        },
        {
            label: 'Số món phát sinh',
            value: metrics.item_count,
            icon: ClipboardList,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
        {
            label: 'Top món',
            value: metrics.top_item ?? '—',
            icon: Award,
            color: 'text-amber-600 dark:text-amber-400',
        },
    ];

    const renderCell = (row: ProductRow, key: string) => {
        switch (key) {
            case 'item_name':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.item_name}
                    </span>
                );
            case 'category_name':
                return row.category_name ?? '—';
            case 'quantity':
                return row.quantity;
            case 'revenue':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatVND(row.revenue)}
                    </span>
                );
            case 'avg_price':
                return formatVND(row.avg_price);
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
            title="Báo cáo chi tiết sản phẩm hàng hoá"
            subtitle="Doanh số gom theo từng món trong khoảng thời gian"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_chi_tiet_san_pham"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm tên món..."
            extraFilters={
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                    <option value="all">Mọi danh mục</option>
                    {safeCategories.map((c) => (
                        <option key={c.id} value={c.name}>
                            {c.name}
                        </option>
                    ))}
                </select>
            }
            getExportRows={getExportRows}
        >
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.menu_item_id}
                renderCell={renderCell}
                defaultSortKey="revenue"
                defaultSortDir="desc"
                emptyTitle="Không có món nào phát sinh trong khoảng thời gian này"
                emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
            />
        </ReportPage>
    );
}
