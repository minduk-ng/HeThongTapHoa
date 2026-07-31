import { Ban, ClipboardList, ReceiptText, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
    formatDateTime,
    formatVND,
} from '../../components/reports/reportFormat';
import ReportPage from '../../components/reports/ReportPage';
import type { MetricCard } from '../../components/reports/ReportPage';
import ReportTable from '../../components/reports/ReportTable';
import type { ReportTableColumn } from '../../components/reports/ReportTable';
import { useReportFilters } from '../../components/reports/useReportFilters';

interface OrderRow {
    id: number;
    order_code: string;
    table_name: string | null;
    item_count: number;
    total: number;
    cancelled_at: string;
    note: string | null;
}

interface ItemRow {
    id: number;
    order_code: string;
    item_name: string;
    quantity: number;
    subtotal: number;
    cancellation_reason: string | null;
    cancelled_by_name: string | null;
    cancelled_at: string;
}

interface Metrics {
    cancelled_orders_count: number;
    cancelled_orders_value: number;
    cancelled_items_count: number;
    cancelled_items_value: number;
}

interface Props {
    cancelledOrders: OrderRow[];
    cancelledItems: ItemRow[];
    metrics: Metrics;
    startDate: string;
    endDate: string;
}

const ORDER_COLUMNS: ReportTableColumn[] = [
    { key: 'order_code', label: 'Mã order' },
    { key: 'table_name', label: 'Bàn' },
    { key: 'item_count', label: 'Số món', numeric: true },
    { key: 'total', label: 'Giá trị', numeric: true },
    { key: 'cancelled_at', label: 'Thời điểm huỷ' },
    { key: 'note', label: 'Ghi chú' },
];

const ITEM_COLUMNS: ReportTableColumn[] = [
    { key: 'order_code', label: 'Mã order' },
    { key: 'item_name', label: 'Tên món' },
    { key: 'quantity', label: 'SL', numeric: true },
    { key: 'subtotal', label: 'Giá trị', numeric: true },
    { key: 'cancellation_reason', label: 'Lý do huỷ' },
    { key: 'cancelled_by_name', label: 'Người huỷ' },
    { key: 'cancelled_at', label: 'Thời điểm huỷ' },
];

export default function CancelledReport({
    cancelledOrders,
    cancelledItems,
    metrics,
    startDate,
    endDate,
}: Props) {
    const safeOrders = useMemo(
        () => (Array.isArray(cancelledOrders) ? cancelledOrders : []),
        [cancelledOrders],
    );
    const safeItems = useMemo(
        () => (Array.isArray(cancelledItems) ? cancelledItems : []),
        [cancelledItems],
    );
    const { rangeStart, rangeEnd, applyRange, reset } = useReportFilters(
        '/reports/cancelled',
        startDate,
        endDate,
    );
    const [search, setSearch] = useState('');
    const [mode, setMode] = useState<'orders' | 'items'>('orders');

    const isOrders = mode === 'orders';
    const columns = isOrders ? ORDER_COLUMNS : ITEM_COLUMNS;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        if (isOrders) {
            return safeOrders.filter(
                (r) =>
                    !q ||
                    r.order_code.toLowerCase().includes(q) ||
                    (r.table_name ?? '').toLowerCase().includes(q),
            );
        }

        return safeItems.filter(
            (r) =>
                !q ||
                r.order_code.toLowerCase().includes(q) ||
                r.item_name.toLowerCase().includes(q) ||
                (r.cancellation_reason ?? '').toLowerCase().includes(q),
        );
    }, [isOrders, safeOrders, safeItems, search]);

    const metricCards: MetricCard[] = [
        {
            label: 'Số đơn huỷ',
            value: metrics.cancelled_orders_count,
            icon: Ban,
            color: 'text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Giá trị đơn huỷ',
            value: formatVND(metrics.cancelled_orders_value),
            icon: ReceiptText,
            color: 'text-rose-600 dark:text-rose-400',
        },
        {
            label: 'Số món huỷ',
            value: metrics.cancelled_items_count,
            icon: XCircle,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'Giá trị món huỷ',
            value: formatVND(metrics.cancelled_items_value),
            icon: ClipboardList,
            color: 'text-amber-600 dark:text-amber-400',
        },
    ];

    const renderCell = (row: OrderRow | ItemRow, key: string) => {
        switch (key) {
            case 'order_code':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {(row as OrderRow).order_code}
                    </span>
                );
            case 'table_name':
                return (row as OrderRow).table_name ?? '—';
            case 'item_count':
                return (row as OrderRow).item_count;
            case 'total':
            case 'subtotal':
                return (
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatVND(
                            (row as OrderRow).total ??
                                (row as ItemRow).subtotal,
                        )}
                    </span>
                );
            case 'cancelled_at':
                return formatDateTime(
                    (row as OrderRow).cancelled_at ??
                        (row as ItemRow).cancelled_at,
                );
            case 'note':
                return (row as OrderRow).note ?? '—';
            case 'item_name':
                return (row as ItemRow).item_name;
            case 'quantity':
                return (row as ItemRow).quantity;
            case 'cancellation_reason':
                return (row as ItemRow).cancellation_reason ?? '—';
            case 'cancelled_by_name':
                return (row as ItemRow).cancelled_by_name ?? '—';
            default:
                return '—';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] =>
        filtered.map((r) =>
            visibleKeys.map((key) => {
                switch (key) {
                    case 'cancelled_at':
                        return formatDateTime(
                            (r as OrderRow).cancelled_at ??
                                (r as ItemRow).cancelled_at,
                        );
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
            title="Báo cáo hoá đơn huỷ"
            subtitle="Đơn huỷ nguyên và món bị huỷ trong khoảng thời gian"
            metrics={metricCards}
            columns={columns}
            exportName={isOrders ? 'bao_cao_don_huy' : 'bao_cao_mon_huy'}
            startDate={rangeStart}
            endDate={rangeEnd}
            onRangeApply={applyRange}
            onReset={reset}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={
                isOrders
                    ? 'Tìm mã order, bàn...'
                    : 'Tìm mã order, món, lý do...'
            }
            extraFilters={
                <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700">
                    {(
                        [
                            ['orders', 'Đơn huỷ'],
                            ['items', 'Món huỷ'],
                        ] as const
                    ).map(([val, label]) => (
                        <button
                            key={val}
                            type="button"
                            onClick={() => setMode(val)}
                            className={`px-3 py-2 text-sm font-semibold transition-colors first:rounded-l-lg last:rounded-r-lg ${
                                mode === val
                                    ? 'bg-sky-600 text-white'
                                    : 'text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            }
            getExportRows={getExportRows}
        >
            {/* key=mode: remount để reset sort/pagination khi đổi loại */}
            <ReportTable
                key={mode}
                columns={columns}
                rows={filtered}
                rowKey={(r) => r.id}
                renderCell={renderCell}
                defaultSortKey="cancelled_at"
                defaultSortDir="desc"
                emptyTitle={
                    isOrders
                        ? 'Không có đơn huỷ nào trong khoảng thời gian này'
                        : 'Không có món huỷ nào trong khoảng thời gian này'
                }
                emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
            />
        </ReportPage>
    );
}
