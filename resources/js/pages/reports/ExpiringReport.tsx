import type { DataTableColumn } from '../../components/DataTable';
import DataTable from '../../components/DataTable';

type ExpiringStatus = 'expired' | 'soon' | 'ok';

interface Row {
    id: number;
    ingredient_name: string;
    unit: string;
    expiry_date: string;
    days_left: number;
    quantity_remaining: number;
    status: ExpiringStatus;
}

const statusConfig: Record<
    ExpiringStatus,
    { label: string; className: string }
> = {
    expired: {
        label: 'Hết hạn',
        className:
            'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    },
    soon: {
        label: 'Sắp hết hạn',
        className:
            'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    },
    ok: {
        label: 'Còn hạn',
        className:
            'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    },
};

export default function ExpiringReport({ rows }: { rows: Row[] }) {
    const columns: DataTableColumn<Row>[] = [
        {
            key: 'ingredient_name',
            header: 'Nguyên liệu',
            sortable: true,
            render: (r) => (
                <span className="font-medium">{r.ingredient_name}</span>
            ),
        },
        { key: 'unit', header: 'Đơn vị', sortable: true, render: (r) => r.unit },
        {
            key: 'expiry_date',
            header: 'HSD',
            sortable: true,
            render: (r) => <span className="tabular-nums">{r.expiry_date}</span>,
        },
        {
            key: 'days_left',
            header: 'Còn lại (ngày)',
            sortable: true,
            align: 'right',
            render: (r) => (
                <span className="tabular-nums">{r.days_left}</span>
            ),
        },
        {
            key: 'quantity_remaining',
            header: 'Tồn lô',
            sortable: true,
            align: 'right',
            render: (r) => (
                <span className="tabular-nums">
                    {r.quantity_remaining.toLocaleString('vi-VN')}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Trạng thái',
            sortable: true,
            render: (r) => (
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig[r.status].className}`}
                >
                    {statusConfig[r.status].label}
                </span>
            ),
        },
    ];

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold font-display">
                    Báo cáo hàng sắp hết hạn
                </h1>
                <div className="text-sm text-zinc-500">
                    Nguyên liệu theo lô nhập và hạn sử dụng
                </div>
            </div>
            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                defaultSortKey="days_left"
                getSortValue={(r, k) => r[k as keyof Row] as string | number}
            />
        </div>
    );
}
