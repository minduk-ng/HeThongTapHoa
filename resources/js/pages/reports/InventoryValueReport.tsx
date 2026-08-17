import type { DataTableColumn } from '../../components/DataTable';
import DataTable from '../../components/DataTable';

interface Row {
    id: number;
    code: string;
    name: string;
    unit: string;
    stock_quantity: number;
    cost_price: number;
    value: number;
}

export default function InventoryValueReport({
    rows,
    totalValue,
}: {
    rows: Row[];
    totalValue: number;
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
            key: 'cost_price',
            header: 'Giá vốn (đ)',
            sortable: true,
            align: 'right',
            render: (r) => (
                <span className="tabular-nums">
                    {r.cost_price.toLocaleString('vi-VN')}
                </span>
            ),
        },
        {
            key: 'value',
            header: 'Giá trị (đ)',
            sortable: true,
            align: 'right',
            render: (r) => (
                <span className="tabular-nums font-semibold">
                    {r.value.toLocaleString('vi-VN')}
                </span>
            ),
        },
    ];

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold font-display">
                    Báo cáo giá trị kho
                </h1>
                <div className="text-sm text-zinc-500">
                    Tổng giá trị:{' '}
                    <span className="font-bold tabular-nums text-sky-600">
                        {totalValue.toLocaleString('vi-VN')} đ
                    </span>
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
