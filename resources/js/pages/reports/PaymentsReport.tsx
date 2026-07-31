import {
    Banknote,
    CreditCard,
    ReceiptText,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportDonut from '../../components/reports/ReportDonut';
import {
    formatDateTime,
    formatVND,
    paymentLabel,
} from '../../components/reports/reportFormat';
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
    { key: 'invoice_code', label: 'Mã HĐ' },
    { key: 'issued_at', label: 'Thời gian' },
    { key: 'payment_method', label: 'PTTT' },
    { key: 'table_name', label: 'Bàn' },
    { key: 'total_amount', label: 'Tổng tiền', numeric: true },
    { key: 'amount_received', label: 'Khách đưa', numeric: true },
    { key: 'change_amount', label: 'Tiền thừa', numeric: true },
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

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeRows.filter(
            (r) =>
                (!q ||
                    r.invoice_code.toLowerCase().includes(q) ||
                    (r.table_name ?? '').toLowerCase().includes(q)) &&
                (paymentFilter === 'all' || r.payment_method === paymentFilter),
        );
    }, [safeRows, search, paymentFilter]);

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

    const renderCell = (row: PaymentRow, key: string) => {
        switch (key) {
            case 'invoice_code':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.invoice_code}
                    </span>
                );
            case 'issued_at':
                return formatDateTime(row.issued_at);
            case 'payment_method':
                return paymentLabel(row.payment_method);
            case 'table_name':
                return row.table_name ?? '—';
            case 'total_amount':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatVND(row.total_amount)}
                    </span>
                );
            case 'amount_received':
                return formatVND(row.amount_received);
            case 'change_amount':
                return formatVND(row.change_amount);
            default:
                return '—';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        filtered.map((r) =>
            visibleKeys.map((key) => {
                switch (key) {
                    case 'issued_at':
                        return formatDateTime(r.issued_at);
                    case 'payment_method':
                        return paymentLabel(r.payment_method);
                    case 'table_name':
                        return r.table_name ?? '';
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
        >
            <ReportDonut
                title="Tỷ trọng doanh thu theo phương thức"
                data={donutData}
                formatValue={formatVND}
            />
            <ReportTable
                columns={COLUMNS}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                defaultSortKey="issued_at"
                defaultSortDir="desc"
                emptyTitle="Không có hoá đơn nào trong khoảng thời gian này"
                emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
            />
        </ReportPage>
    );
}
