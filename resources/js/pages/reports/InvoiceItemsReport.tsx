import {
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Hash,
    ReceiptText,
    ShoppingBag,
} from 'lucide-react';
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

interface TreeNode {
    kind: 'root' | 'child';
    invoice_id: number;
    invoice_code?: string;
    issued_at?: string;
    table_name?: string | null;
    payment_method?: string;
    total?: number;
    item?: ItemRow;
}

function buildNodes(filtered: ItemRow[], collapsed: Set<number>): TreeNode[] {
    const groups = new Map<number, ItemRow[]>();

    for (const r of filtered) {
        const g = groups.get(r.invoice_id) ?? [];

        g.push(r);
        groups.set(r.invoice_id, g);
    }

    const invoices = [...groups.entries()].sort((a, b) =>
        b[1][0].issued_at.localeCompare(a[1][0].issued_at),
    );
    const nodes: TreeNode[] = [];

    for (const [invoice_id, items] of invoices) {
        const first = items[0];

        nodes.push({
            kind: 'root',
            invoice_id,
            invoice_code: first.invoice_code,
            issued_at: first.issued_at,
            table_name: first.table_name,
            payment_method: first.payment_method,
            total: items.reduce((s, it) => s + it.subtotal, 0),
        });

        if (!collapsed.has(invoice_id)) {
            for (const it of items) {
                nodes.push({ kind: 'child', invoice_id, item: it });
            }
        }
    }

    return nodes;
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
    { key: 'invoice_code', label: 'Mã HĐ', sortable: false },
    { key: 'issued_at', label: 'Thời gian', sortable: false },
    { key: 'table_name', label: 'Bàn', sortable: false },
    { key: 'item_name', label: 'Tên món', sortable: false },
    { key: 'quantity', label: 'SL', numeric: true, sortable: false },
    { key: 'unit_price', label: 'Đơn giá', numeric: true, sortable: false },
    { key: 'subtotal', label: 'Thành tiền', numeric: true, sortable: false },
    { key: 'payment_method', label: 'PTTT', sortable: false },
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

    const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

    const toggleCollapse = (invoice_id: number) => {
        setCollapsed((prev) => {
            const next = new Set(prev);

            if (next.has(invoice_id)) {
                next.delete(invoice_id);
            } else {
                next.add(invoice_id);
            }

            return next;
        });
    };

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

    const treeRows = useMemo(
        () => buildNodes(filtered, collapsed),
        [filtered, collapsed],
    );

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

    const renderCell = (row: TreeNode, key: string) => {
        if (row.kind === 'root') {
            switch (key) {
                case 'invoice_code':
                    return (
                        <span className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => toggleCollapse(row.invoice_id)}
                                className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                            >
                                {collapsed.has(row.invoice_id) ? (
                                    <ChevronRight className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </button>
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {row.invoice_code}
                            </span>
                        </span>
                    );
                case 'issued_at':
                    return formatDateTime(row.issued_at ?? null);
                case 'table_name':
                    return row.table_name ?? '—';
                case 'payment_method':
                    return paymentLabel(row.payment_method ?? null);
                case 'subtotal':
                    return (
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatVND(row.total ?? 0)}
                        </span>
                    );
                default:
                    return '—';
            }
        }

        const it = row.item;

        if (!it) {
            return '—';
        }

        switch (key) {
            case 'item_name':
                return <span className="pl-6">{it.item_name}</span>;
            case 'quantity':
                return it.quantity;
            case 'unit_price':
                return formatVND(it.unit_price);
            case 'subtotal':
                return formatVND(it.subtotal);
            default:
                return '—';
        }
    };

    const cellExport = (row: TreeNode, key: string): string | number => {
        if (row.kind === 'root') {
            switch (key) {
                case 'invoice_code':
                    return row.invoice_code ?? '';
                case 'issued_at':
                    return formatDateTime(row.issued_at ?? null);
                case 'table_name':
                    return row.table_name ?? '';
                case 'payment_method':
                    return paymentLabel(row.payment_method ?? null);
                case 'subtotal':
                    return row.total ?? 0;
                default:
                    return '';
            }
        }

        const it = row.item;

        if (!it) {
            return '';
        }

        switch (key) {
            case 'item_name':
                return it.item_name;
            case 'quantity':
                return it.quantity;
            case 'unit_price':
                return it.unit_price;
            case 'subtotal':
                return it.subtotal;
            default:
                return '';
        }
    };

    const getExportRows = (visibleKeys: string[]): (string | number)[][] => {
        const nodes = buildNodes(filtered, new Set());
        const grandTotal = nodes
            .filter((n) => n.kind === 'root')
            .reduce((s, n) => s + (n.total ?? 0), 0);

        return [
            ...nodes.map((n) => visibleKeys.map((k) => cellExport(n, k))),
            visibleKeys.map((k) =>
                k === 'invoice_code'
                    ? 'Tổng cộng'
                    : k === 'subtotal'
                      ? grandTotal
                      : '',
            ),
        ];
    };

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
                rows={treeRows}
                rowKey={(row) =>
                    row.kind === 'root'
                        ? `inv-${row.invoice_id}`
                        : `it-${row.item!.id}`
                }
                renderCell={renderCell}
                pagination={false}
                emptyTitle="Không có dòng món nào trong khoảng thời gian này"
                emptyHint="Thử mở rộng khoảng ngày hoặc đổi bộ lọc"
            />
        </ReportPage>
    );
}
