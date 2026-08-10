import React from 'react';
import { Image as ImageIcon, Edit3, Trash2 } from 'lucide-react';
import DataTable, { DataTableColumn } from '../../../../components/DataTable';

interface Category {
    id: number;
    name: string;
}

export interface MenuItemData {
    id: number;
    category_id: number | null;
    name: string;
    price: number | string;
    vat_rate: number | string;
    image: string | null;
    description: string | null;
    is_available: boolean;
    category?: Category | null;
}

interface ProductTableProps {
    items: MenuItemData[];
    onEdit: (item: MenuItemData) => void;
    onDelete: (item: MenuItemData) => void;
}

export default function ProductTable({ items, onEdit, onDelete }: ProductTableProps) {
    const formatCurrency = (val: number | string) => {
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    const formatProductCode = (id: number) => {
        return `SP${String(id).padStart(5, '0')}`;
    };

    const columns: DataTableColumn<MenuItemData>[] = [
        {
            key: 'image',
            header: 'Ảnh',
            hideWhenCompact: true,
            className: 'w-20',
            render: (item) => (
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                        <ImageIcon className="w-5 h-5 text-zinc-400 stroke-[1.5]" />
                    )}
                </div>
            ),
        },
        {
            key: 'code',
            header: 'Mã SP',
            sortable: true,
            className: 'font-mono text-xs text-sky-600 dark:text-sky-400 font-medium tabular-nums',
            render: (item) => formatProductCode(item.id),
        },
        {
            key: 'name',
            header: 'Tên sản phẩm',
            sortable: true,
            render: (item) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</span>,
        },
        {
            key: 'category',
            header: 'Danh mục',
            sortable: true,
            render: (item) => <span className="text-zinc-600 dark:text-zinc-400">{item.category?.name ?? '—'}</span>,
        },
        {
            key: 'price',
            header: 'Giá bán',
            sortable: true,
            align: 'right',
            render: (item) => <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(item.price)}</span>,
        },
        {
            key: 'vat_rate',
            header: 'Thuế VAT',
            sortable: true,
            align: 'center',
            render: (item) => <span className="text-xs text-zinc-500 tabular-nums">{Number(item.vat_rate)}%</span>,
        },
        {
            key: 'is_available',
            header: 'Trạng thái',
            sortable: true,
            align: 'center',
            render: (item) => (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.is_available
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                }`}>
                    {item.is_available ? 'Hoạt động' : 'Ngừng bán'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Thao tác',
            align: 'center',
            className: 'w-24',
            render: (item) => (
                <div className="flex items-center justify-center space-x-1">
                    <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="p-1.5 text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Chỉnh sửa sản phẩm"
                        aria-label="Chỉnh sửa sản phẩm"
                    >
                        <Edit3 className="w-4 h-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Xóa sản phẩm"
                        aria-label="Xóa sản phẩm"
                    >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            rows={items}
            rowKey={(item) => item.id}
            defaultSortKey="name"
            getSortValue={(item, key) => {
                if (key === 'code') return item.id;
                if (key === 'name') return item.name;
                if (key === 'category') return item.category?.name ?? '';
                if (key === 'price') return item.price;
                if (key === 'vat_rate') return item.vat_rate;
                if (key === 'is_available') return item.is_available ? 1 : 0;
                return String(item[key as keyof MenuItemData] ?? '');
            }}
            emptyMessage="Không tìm thấy sản phẩm"
        />
    );
}
