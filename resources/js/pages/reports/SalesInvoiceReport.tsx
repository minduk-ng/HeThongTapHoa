import {
    Banknote,
    CircleDollarSign,
    ReceiptText,
    TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface InvoiceRow {
    id: number;
    invoice_code: string;
    table_name: string | null;
    payment_method: string;
    orders_count: number;
    total_amount: number;
    amount_received: number;
    change_amount: number;
    issued_at: string;
}

interface Metrics {
    revenue: number;
    invoice_count: number;
    avg_invoice: number;
    bank_transfer_count: number;
}

interface Props {
    invoices: InvoiceRow[];
    metrics: Metrics;
    startDate: string;
    endDate: string;
}

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
};

const formatVND = (v: number) =>
    new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(v);

const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

const COLUMNS: ReportTableColumn[] = [
    { key: 'invoice_code', label: 'Mã HĐ' },
    { key: 'issued_at', label: 'Thời gian' },
    { key: 'table_name', label: 'Bàn' },
    { key: 'orders_count', label: 'Số order', numeric: true },
    { key: 'payment_method', label: 'PTTT' },
    { key: 'total_amount', label: 'Tổng tiền', numeric: true },
    {
        key: 'amount_received',
        label: 'Khách đưa',
        numeric: true,
        visible: false,
    },
    { key: 'change_amount', label: 'Tiền thừa', numeric: true, visible: false },
];

export default function SalesInvoiceReport({
    invoices,
    metrics,
    startDate,
    endDate,
}: Props) {
    const safeInvoices = useMemo(
        () => (Array.isArray(invoices) ? invoices : []),
        [invoices],
    );

    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/sales-invoices',
        startDate,
        endDate,
    );

    const [search, setSearch] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return safeInvoices.filter(
            (inv) =>
                (!q ||
                    inv.invoice_code.toLowerCase().includes(q) ||
                    (inv.table_name ?? '').toLowerCase().includes(q)) &&
                (paymentFilter === 'all' ||
                    inv.payment_method === paymentFilter),
        );
    }, [safeInvoices, search, paymentFilter]);

    const metricCards: MetricCard[] = [
        {
            label: 'Doanh thu',
            value: formatVND(metrics.revenue),
            icon: CircleDollarSign,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Số hoá đơn',
            value: metrics.invoice_count,
            icon: ReceiptText,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
        {
            label: 'Trung bình/HĐ',
            value: formatVND(metrics.avg_invoice),
            icon: TrendingUp,
            color: 'text-sky-600 dark:text-sky-400',
        },
        {
            label: 'HĐ chuyển khoản',
            value: metrics.bank_transfer_count,
            icon: Banknote,
            color: 'text-amber-600 dark:text-amber-400',
        },
    ];

    const renderCell = (row: InvoiceRow, key: string) => {
        switch (key) {
            case 'invoice_code':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.invoice_code}
                    </span>
                );
            case 'issued_at':
                return formatDateTime(row.issued_at);
            case 'table_name':
                return row.table_name ?? '—';
            case 'orders_count':
                return row.orders_count;
            case 'payment_method':
                return PAYMENT_LABELS[row.payment_method] ?? '—';
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

    // Xuất số thô cho cột tiền để Excel tính được; ngày giữ dạng hiển thị.
    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        filtered.map((inv) =>
            visibleKeys.map((key) => {
                switch (key) {
                    case 'issued_at':
                        return formatDateTime(inv.issued_at);
                    case 'table_name':
                        return inv.table_name ?? '';
                    case 'payment_method':
                        return PAYMENT_LABELS[inv.payment_method] ?? '';
                    default:
                        return (
                            (inv as unknown as Record<string, string | number>)[
                                key
                            ] ?? ''
                        );
                }
            }),
        );

    return (
        <ReportPage
            title="Báo cáo hoá đơn bán hàng"
            subtitle="Doanh thu theo hoá đơn đã phát hành trong khoảng thời gian"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_hoa_don_ban_hang"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo mã HĐ hoặc bàn..."
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
