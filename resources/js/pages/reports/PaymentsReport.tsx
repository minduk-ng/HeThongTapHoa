import {
    Banknote,
    ChartPie,
    CreditCard,
    ReceiptText,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportDonut from '../../components/reports/ReportDonut';
import { formatVND, paymentLabel } from '../../components/reports/reportFormat';
import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface PaymentRow {
    id: number;
    invoice_code: string;
    issued_at: string;
    payment_method: string;
    table_name: string | null;
    total_amount: number;
    amount_received: number;
    change_amount: number;
}

interface MethodRow {
    method: string;
    count: number;
    total: number;
    pct: number;
}

interface Metrics {
    revenue: number;
    cash_total: number;
    bank_total: number;
    invoice_count: number;
}

interface Comparison {
    prev_revenue: number;
    change_pct: number | null;
}

interface Props {
    rows: PaymentRow[];
    metrics: Metrics;
    comparison: Comparison;
    startDate: string;
    endDate: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'method', label: 'PTTT' },
    { key: 'count', label: 'Số HĐ', numeric: true },
    { key: 'total', label: 'Tổng tiền', numeric: true },
    { key: 'pct', label: 'Tỷ trọng %', numeric: true },
];

export default function PaymentsReport({
    rows,
    metrics,
    comparison,
    startDate,
    endDate,
}: Props) {
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/payments',
        startDate,
        endDate,
    );
    const [search, setSearch] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('all');
    const [showDonut, setShowDonut] = useState(true);

    const methodRows = useMemo(() => {
        const map = new Map<string, { count: number; total: number }>();

        for (const r of safeRows) {
            const cur = map.get(r.payment_method) ?? { count: 0, total: 0 };

            cur.count += 1;
            cur.total += r.total_amount;
            map.set(r.payment_method, cur);
        }

        return [...map.entries()]
            .map(([method, { count, total }]) => ({
                method,
                count,
                total,
                pct:
                    metrics.revenue > 0
                        ? Math.round((total / metrics.revenue) * 1000) / 10
                        : 0,
            }))
            .sort((a, b) => b.total - a.total);
    }, [safeRows, metrics.revenue]);

    const methodFiltered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return methodRows.filter(
            (r) =>
                (!q || paymentLabel(r.method).toLowerCase().includes(q)) &&
                (paymentFilter === 'all' || r.method === paymentFilter),
        );
    }, [methodRows, search, paymentFilter]);

    const pct = comparison.change_pct;
    const metricCards: MetricCard[] = [
        {
            label: 'Doanh thu',
            value: formatVND(metrics.revenue),
            icon: ReceiptText,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'So kỳ trước',
            value:
                pct === null
                    ? '—'
                    : `${pct > 0 ? '+' : ''}${pct}% (kỳ trước ${formatVND(comparison.prev_revenue)})`,
            icon: pct !== null && pct < 0 ? TrendingDown : TrendingUp,
            color:
                pct === null
                    ? 'text-zinc-600 dark:text-zinc-300'
                    : pct < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Tiền mặt',
            value: formatVND(metrics.cash_total),
            icon: Banknote,
            color: 'text-sky-600 dark:text-sky-400',
        },
        {
            label: 'Chuyển khoản',
            value: formatVND(metrics.bank_total),
            icon: CreditCard,
            color: 'text-amber-600 dark:text-amber-400',
        },
    ];

    const donutData = [
        { name: 'Tiền mặt', value: metrics.cash_total },
        { name: 'Chuyển khoản', value: metrics.bank_total },
    ];

    const renderCell = (row: MethodRow, key: string) => {
        switch (key) {
            case 'method':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {paymentLabel(row.method)}
                    </span>
                );
            case 'count':
                return row.count;
            case 'total':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatVND(row.total)}
                    </span>
                );
            case 'pct':
                return `${row.pct}%`;
            default:
                return '—';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        methodFiltered.map((r) =>
            visibleKeys.map((key) => {
                switch (key) {
                    case 'method':
                        return paymentLabel(r.method);
                    case 'total':
                        return r.total;
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
            title="Báo cáo thanh toán"
            subtitle="Doanh thu và phương thức thanh toán trong khoảng thời gian"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_thanh_toan"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm mã HĐ, bàn..."
            extraFilters={
                <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                    <option value="all">Mọi PTTT</option>
                    <option value="cash">Tiền mặt</option>
                    <option value="bank_transfer">Chuyển khoản</option>
                </select>
            }
            getExportRows={getExportRows}
            extraActions={
                <button
                    type="button"
                    onClick={() => setShowDonut((v) => !v)}
                    className={`flex items-center space-x-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        showDonut
                            ? 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-800/60 dark:bg-sky-900/20 dark:text-sky-400'
                            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                >
                    <ChartPie className="h-3.5 w-3.5 stroke-[1.5]" />
                    <span>Biểu đồ</span>
                </button>
            }
        >
            <div className="flex min-h-0 flex-1">
                {showDonut && (
                    <div className="w-[320px] shrink-0 border-r border-zinc-100 dark:border-zinc-800">
                        <ReportDonut
                            title="Tỷ trọng doanh thu theo phương thức"
                            data={donutData}
                            formatValue={formatVND}
                        />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <ReportTable
                        columns={COLUMNS}
                        rows={methodFiltered}
                        rowKey={(r) => r.method}
                        renderCell={renderCell}
                        emptyTitle="Không có hoá đơn nào trong khoảng thời gian này"
                        emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
                    />
                </div>
            </div>
        </ReportPage>
    );
}
