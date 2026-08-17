import type { DataTableColumn } from '../../components/DataTable';
import DataTable from '../../components/DataTable';

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

export default function LowStockReport({
    rows,
}: {
    rows: Row[];
}) {
    const columns: DataTableColumn<Row>[] = [
        {
            key: 'name',
            header: 'Nguyên liệu',
            sortable: true,
            render: (r) => <span className="font-medium">{r.name}</span>,
        },
        { key: 'code', header: 'Mã', sortable: true, render: (r) => r.code },
        { key: 'unit', header: 'Đơn vị', sortable: true, render: (r) => r.unit },
        {
            key: 'stock_quantity',
            header: 'Tồn kho',
            sortable: true,
            align: 'right',
            render: (r) => (
                <span className="tabular-nums">
                    {r.stock_quantity.toLocaleString('vi-VN')}
                </span>
            ),
        },
        {
            key: 'min_stock_alert',
            header: 'Định mức tối thiểu',
            sortable: true,
            align: 'right',
            render: (r) => (
                <span className="tabular-nums">
                    {r.min_stock_alert.toLocaleString('vi-VN')}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Mức',
            sortable: true,
            render: (r) => (
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig[r.status].className}`}
                >
                    {statusConfig[r.status].label}
                </span>
            ),
        },
        {
            key: 'suggest_qty',
            header: 'Đề xuất nhập',
            sortable: true,
            align: 'right',
            render: (r) => (
                <span className="tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                    {r.suggest_qty.toLocaleString('vi-VN')}
                </span>
            ),
        },
    ];

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold font-display">
                    Báo cáo tồn kho thấp
                </h1>
                <div className="text-sm text-zinc-500">
                    Nguyên liệu đang dưới định mức tối thiểu
                </div>
            </div>
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                defaultSortKey="name"
                getSortValue={(r, k) => r[k as keyof Row] as string | number}
            />
        </div>
    );
}
