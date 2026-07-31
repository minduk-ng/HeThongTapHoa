import { ClipboardList, Hash, ReceiptText, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';

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

interface ItemRow {
    id: number;
    invoice_id: number;
    invoice_code: string;
    issued_at: string;
    table_name: string | null;
    item_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    payment_method: string;
}

interface Metrics {
    total_amount: number;
    line_count: number;
    quantity_total: number;
    invoice_count: number;
}

interface Props {
    rows: ItemRow[];
    metrics: Metrics;
    startDate: string;
    endDate: string;
}

const COLUMNS: ReportTableColumn[] = [
    { key: 'invoice_code', label: 'Mã HĐ' },
    { key: 'issued_at', label: 'Thời gian' },
    { key: 'table_name', label: 'Bàn' },
    { key: 'item_name', label: 'Tên món' },
    { key: 'quantity', label: 'SL', numeric: true },
    { key: 'unit_price', label: 'Đơn giá', numeric: true },
    { key: 'subtotal', label: 'Thành tiền', numeric: true },
    { key: 'payment_method', label: 'PTTT' },
];

export default function InvoiceItemsReport({
    rows,
    metrics,
    startDate,
    endDate,
}: Props) {
    const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/invoice-items',
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
                    r.item_name.toLowerCase().includes(q) ||
                    (r.table_name ?? '').toLowerCase().includes(q)) &&
                (paymentFilter === 'all' || r.payment_method === paymentFilter),
        );
    }, [safeRows, search, paymentFilter]);

    const metricCards: MetricCard[] = [
        {
            label: 'Tổng thành tiền',
            value: formatVND(metrics.total_amount),
            icon: ReceiptText,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Số dòng món',
            value: metrics.line_count,
            icon: ClipboardList,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
        {
            label: 'Tổng SL',
            value: metrics.quantity_total,
            icon: ShoppingBag,
            color: 'text-sky-600 dark:text-sky-400',
        },
        {
            label: 'Số HĐ',
            value: metrics.invoice_count,
            icon: Hash,
            color: 'text-amber-600 dark:text-amber-400',
        },
    ];

    const renderCell = (row: ItemRow, key: string) => {
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
            case 'item_name':
                return row.item_name;
            case 'quantity':
                return row.quantity;
            case 'unit_price':
                return formatVND(row.unit_price);
            case 'subtotal':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatVND(row.subtotal)}
                    </span>
                );
            case 'payment_method':
                return paymentLabel(row.payment_method);
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
                    case 'table_name':
                        return r.table_name ?? '';
                    case 'payment_method':
                        return paymentLabel(r.payment_method);
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
            title="Báo cáo chi tiết hoá đơn"
            subtitle="Các dòng món thuộc hoá đơn đã phát hành trong khoảng thời gian"
            metrics={metricCards}
            columns={COLUMNS}
            exportName="bao_cao_chi_tiet_hoa_don"
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm mã HĐ, món, bàn..."
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
                emptyTitle="Không có dòng món nào trong khoảng thời gian này"
                emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
            />
        </ReportPage>
    );
}
