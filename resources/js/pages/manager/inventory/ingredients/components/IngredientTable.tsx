import { Edit3, Trash2 } from 'lucide-react';
import React from 'react';
import type { DataTableColumn } from '../../../../../components/DataTable';
import DataTable from '../../../../../components/DataTable';

export interface IngredientData {
    id: number;
    code?: string;
    name: string;
    unit: string;
    stock_quantity: number;
    min_stock_alert: number;
    cost_price: number;
    purchase_unit?: string | null;
    unit_conversion?: number;
}

interface IngredientTableProps {
    ingredients: IngredientData[];
    onEdit: (ingredient: IngredientData) => void;
    onDelete: (ingredient: IngredientData) => void;
}

export default function IngredientTable({
    ingredients,
    onEdit,
    onDelete,
}: IngredientTableProps) {
    const formatCurrency = (val: number) =>
        Number(val).toLocaleString('vi-VN') + ' đ';

    const columns: DataTableColumn<IngredientData>[] = [
        {
            key: 'code',
            header: 'Mã NVL',
            sortable: true,
            align: 'center',
            className:
                'w-32 font-mono text-xs text-sky-600 dark:text-sky-400 font-medium tabular-nums',
            render: (item) =>
                item.code || `NVL${String(item.id).padStart(5, '0')}`,
        },
        {
            key: 'name',
            header: 'Tên nguyên liệu',
            align: 'left',
            sortable: true,
            render: (item) => (
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {item.name}
                </span>
            ),
        },
        {
            key: 'unit',
            header: 'Đơn vị',
            align: 'center',
            className: 'w-24',
            render: (item) => (
                <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800">
                    {item.unit}
                </span>
            ),
        },
        {
            key: 'stock_quantity',
            header: 'Tồn kho',
            sortable: true,
            align: 'right',
            render: (item) => (
                <span
                    className={`font-bold tabular-nums ${item.stock_quantity <= item.min_stock_alert ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}
                >
                    {item.stock_quantity.toLocaleString('vi-VN')} {item.unit}
                </span>
            ),
        },
        {
            key: 'cost_price',
            header: 'Giá vốn đơn vị',
            sortable: true,
            align: 'right',
            render: (item) => (
                <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                    {formatCurrency(item.cost_price)}/{item.unit}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Trạng thái',
            align: 'center',
            className: 'w-32',
            render: (item) => (
                <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.stock_quantity <= item.min_stock_alert
                            ? 'border border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                >
                    {item.stock_quantity <= item.min_stock_alert
                        ? 'Sắp hết hàng'
                        : 'An toàn'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Thao tác',
            align: 'center',
            className: 'w-40',
            render: (item) => (
                <div className="flex items-center justify-center space-x-1">
                    <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400"
                        title="Chỉnh sửa"
                    >
                        <Edit3 className="h-4 w-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                        title="Xóa"
                    >
                        <Trash2 className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            rows={ingredients}
            rowKey={(item) => item.id}
            defaultSortKey="name"
            getSortValue={(item, key) => {
                if (key === 'code') {
                    return item.code ?? `NVL${item.id}`;
                }

                if (key === 'name') {
                    return item.name;
                }

                if (key === 'stock_quantity') {
                    return item.stock_quantity;
                }

                if (key === 'cost_price') {
                    return item.cost_price;
                }

                return item[key as keyof IngredientData] ?? '';
            }}
            emptyMessage="Không tìm thấy nguyên liệu"
        />
    );
}
