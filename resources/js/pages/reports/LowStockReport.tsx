import { AlertCircle, AlertTriangle, PackageCheck, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

type LowStockStatus = 'out' | 'critical' | 'low';

interface Row {
    id: number;
    code: string;
    name: string;
    unit: string;
    stock_quantity: number;
    cost_price: number;
    value: number;
    status: LowStockStatus;
    suggest_qty: number;
    min_stock_alert: number;
}

interface Props {
    rows: Row[];
    startDate?: string;
    endDate?: string;
}

const statusConfig: Record<
    LowStockStatus,
    { label: string; className: string }
> = {
    out: {
        label: 'Hết hàng',
        className:
            'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    },
    critical: {
        label: 'Nguy kịch',
        className:
            'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    },
    low: {
        label: 'Sắp hết',
        className:
            'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    },
};

const COLUMNS: ReportTableColumn[] = [
    { key: 'code', label: 'Mã nguyên liệu' },
    { key: 'name', label: 'Tên nguyên liệu' },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'stock_quantity', label: 'Tồn kho', numeric: true },
    { key: 'min_stock_alert', label: 'Định mức tối thiểu', numeric: true },
    { key: 'status', label: 'Mức cảnh báo' },
    { key: 'suggest_qty', label: 'Đề xuất nhập', numeric: true },
];

export default function LowStockReport({
    rows,
    startDate,
    endDate,
}: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/low-stock',
        startDate ?? today,
        endDate ?? today,
    );

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter((r) => {
            const matchesSearch =
                !q ||
                r.name.toLowerCase().includes(q) ||
                r.code.toLowerCase().includes(q);
            const matchesStatus =
                statusFilter === 'all' || r.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [safeRows, search, statusFilter]);

    const outCount = useMemo(
        () => safeRows.filter((r) => r.status === 'out').length,
        [safeRows],
    );

    const criticalCount = useMemo(
        () => safeRows.filter((r) => r.status === 'critical').length,
        [safeRows],
    );

    const lowCount = useMemo(
        () => safeRows.filter((r) => r.status === 'low').length,
        [safeRows],
    );

    const metricCards: MetricCard[] = [
        {
            label: 'Cần nhập hàng',
            value: safeRows.length,
            icon: AlertTriangle,
            color: 'text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Đã hết hàng',
            value: outCount,
            icon: XCircle,
            color: 'text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Mức nguy kịch',
            value: criticalCount,
            icon: AlertCircle,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'Sắp hết',
            value: lowCount,
            icon: PackageCheck,
            color: 'text-zinc-600 dark:text-zinc-300',
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
                    <span
                        className={`tabular-nums font-semibold ${
                            row.stock_quantity <= 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                    >
                        {row.stock_quantity.toLocaleString('vi-VN')}
                    </span>
                );
            case 'min_stock_alert':
                return (
                    <span className="tabular-nums">
                        {row.min_stock_alert.toLocaleString('vi-VN')}
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
            case 'suggest_qty':
                return (
                    <span className="tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                        {row.suggest_qty.toLocaleString('vi-VN')}
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
            title="Báo cáo tồn kho thấp"
            subtitle="Danh sách nguyên liệu đang dưới định mức tồn kho tối thiểu cần bổ sung"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_ton_kho_thap"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo tên hoặc mã nguyên liệu..."
            extraFilters={
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                    <option value="all">Mọi mức cảnh báo</option>
                    <option value="out">Hết hàng</option>
                    <option value="critical">Nguy kịch (≤20%)</option>
                    <option value="low">Sắp hết</option>
                </select>
            }
            getExportRows={getExportRows}
        >
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                defaultSortKey="stock_quantity"
                defaultSortDir="asc"
                emptyTitle="Không có nguyên liệu nào dưới định mức tối thiểu"
                emptyHint="Kho hàng đang ở trạng thái an toàn"
            />
        </ReportPage>
    );
}
