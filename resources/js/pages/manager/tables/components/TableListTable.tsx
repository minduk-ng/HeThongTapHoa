import {
    Armchair,
    CheckCircle2,
    Users,
    Clock,
    AlertTriangle,
    Edit3,
    Trash2,
} from 'lucide-react';
import React from 'react';
import type { DataTableColumn } from '../../../../components/DataTable';
import DataTable from '../../../../components/DataTable';

export interface TableData {
    id: number;
    table_number: string;
    capacity: number;
    area: string;
    status: 'available' | 'occupied' | 'reserved' | 'maintenance';
    reservation_name?: string | null;
    reservation_phone?: string | null;
    reservation_time?: string | null;
    reservation_note?: string | null;
}

interface TableListTableProps {
    tables: TableData[];
    onEdit: (table: TableData) => void;
    onDelete: (table: TableData) => void;
}

export default function TableListTable({
    tables,
    onEdit,
    onDelete,
}: TableListTableProps) {
    const renderStatusBadge = (status: TableData['status']) => {
        switch (status) {
            case 'available':
                return (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Bàn trống
                    </span>
                );
            case 'occupied':
                return (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        <Users className="mr-1 h-3.5 w-3.5" />
                        Đang dùng
                    </span>
                );
            case 'reserved':
                return (
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                        <Clock className="mr-1 h-3.5 w-3.5" />
                        Đã đặt trước
                    </span>
                );
            case 'maintenance':
                return (
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                        Bảo trì
                    </span>
                );
            default:
                return null;
        }
    };

    const columns: DataTableColumn<TableData>[] = [
        {
            key: 'table_number',
            header: 'Mã / Số bàn',
            align: 'center',
            sortable: true,
            render: (item) => (
                <div className="flex items-center justify-center space-x-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-xs font-bold text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                        <Armchair className="h-4 w-4 stroke-[1.5]" />
                    </div>
                    <span className="font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                        {item.table_number}
                    </span>
                </div>
            ),
        },
        {
            key: 'area',
            header: 'Khu vực / Tầng',
            align: 'center',
            sortable: true,
            render: (item) => (
                <span className="font-medium text-zinc-600 dark:text-zinc-400">
                    {item.area || '—'}
                </span>
            ),
        },
        {
            key: 'capacity',
            header: 'Số ghế (Sức chứa)',
            sortable: true,
            align: 'center',
            render: (item) => (
                <span className="font-semibold text-zinc-800 tabular-nums dark:text-zinc-200">
                    {item.capacity} ghế
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Trạng thái',
            sortable: true,
            align: 'center',
            render: (item) => renderStatusBadge(item.status),
        },
        {
            key: 'actions',
            header: 'Thao tác',
            align: 'center',
            className: 'w-32',
            render: (item) => (
                <div className="flex items-center justify-center space-x-1">
                    <button
                        type="button"
                        disabled={item.status === 'occupied'}
                        onClick={() => onEdit(item)}
                        className={`rounded-lg p-1.5 transition-colors ${
                            item.status === 'occupied'
                                ? 'cursor-not-allowed text-zinc-300 opacity-50 dark:text-zinc-700'
                                : 'text-zinc-500 hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400'
                        }`}
                        title={
                            item.status === 'occupied'
                                ? 'Bàn đang có khách sử dụng, không thể chỉnh sửa'
                                : 'Chỉnh sửa bàn'
                        }
                        aria-label="Chỉnh sửa bàn"
                    >
                        <Edit3 className="h-4 w-4 stroke-[1.5]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                        title="Xóa bàn"
                        aria-label="Xóa bàn"
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
            rows={tables}
            rowKey={(item) => item.id}
            defaultSortKey="table_number"
            getSortValue={(item, key) => {
                if (key === 'table_number') {
                    return item.table_number;
                }

                if (key === 'area') {
                    return item.area;
                }

                if (key === 'capacity') {
                    return item.capacity;
                }

                if (key === 'status') {
                    return item.status;
                }

                return item[key as keyof TableData] ?? '';
            }}
            emptyMessage="Không tìm thấy bàn"
        />
    );
}
