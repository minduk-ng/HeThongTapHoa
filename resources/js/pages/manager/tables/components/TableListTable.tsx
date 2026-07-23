import React, { useState, useMemo } from 'react';
import { Armchair, CheckCircle2, Users, Clock, AlertTriangle, ChevronUp, ChevronDown, Edit3, Trash2, Rows3 } from 'lucide-react';

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

type SortField = 'id' | 'table_number' | 'area' | 'capacity' | 'status';
type SortDirection = 'asc' | 'desc';

export default function TableListTable({ tables, onEdit, onDelete }: TableListTableProps) {
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState<number>(20);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortField, setSortField] = useState<SortField>('table_number');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const sortedItems = useMemo(() => {
        const sorted = [...tables];
        sorted.sort((a, b) => {
            let valA: any = a[sortField as keyof TableData];
            let valB: any = b[sortField as keyof TableData];

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [tables, sortField, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const paginatedItems = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;
        return sortedItems.slice(start, start + pageSize);
    }, [sortedItems, safeCurrentPage, pageSize]);

    const renderStatusBadge = (status: TableData['status']) => {
        switch (status) {
            case 'available':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Bàn trống
                    </span>
                );
            case 'occupied':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        <Users className="w-3.5 h-3.5 mr-1" />
                        Đang dùng
                    </span>
                );
            case 'reserved':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                        <Clock className="w-3.5 h-3.5 mr-1" />
                        Đã đặt trước
                    </span>
                );
            case 'maintenance':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                        Bảo trì
                    </span>
                );
            default:
                return null;
        }
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ChevronUp className="w-3.5 h-3.5 ml-1 text-zinc-300 dark:text-zinc-600 opacity-50 inline" />;
        }
        return sortDirection === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        ) : (
            <ChevronDown className="w-3.5 h-3.5 ml-1 text-sky-600 dark:text-sky-400 inline" />
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl shadow-xs">
            {/* Scrollable Data Area */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-left text-sm relative">
                    <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 backdrop-blur-xs text-zinc-600 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800 select-none">
                        <tr>
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-12 text-xs' : 'py-3.5 w-16'}`}>STT</th>
                            <th
                                onClick={() => handleSort('table_number')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Mã / Số bàn</span>
                                    {renderSortIcon('table_number')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('area')}
                                className={`px-4 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span>Khu vực / Tầng</span>
                                    {renderSortIcon('area')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('capacity')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Số ghế (Sức chứa)</span>
                                    {renderSortIcon('capacity')}
                                </div>
                            </th>
                            <th
                                onClick={() => handleSort('status')}
                                className={`px-4 text-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    isCompact ? 'py-2' : 'py-3.5'
                                }`}
                            >
                                <div className="flex items-center justify-center">
                                    <span>Trạng thái</span>
                                    {renderSortIcon('status')}
                                </div>
                            </th>
                            <th className={`px-4 text-center ${isCompact ? 'py-2 w-28' : 'py-3.5 w-32'}`}>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {paginatedItems.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-12 px-6">
                                    <div className="flex items-start space-x-4 max-w-md">
                                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 flex items-center justify-center shrink-0">
                                            <Armchair className="w-5 h-5 stroke-[1.5]" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                Không tìm thấy bàn
                                            </h4>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                                                Chưa có bàn nào phù hợp với điều kiện tìm kiếm. Thử thay đổi từ khóa hoặc bộ lọc khu vực.
                                            </p>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedItems.map((item, index) => {
                                const realIndex = (safeCurrentPage - 1) * pageSize + index + 1;
                                return (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                                    >
                                        <td className={`px-4 text-center text-zinc-500 text-xs tabular-nums ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {realIndex}
                                        </td>
                                        <td className={`px-4 font-bold text-zinc-900 dark:text-zinc-100 ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <div className="flex items-center space-x-2">
                                                <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-xs shrink-0">
                                                    <Armchair className="w-4 h-4 stroke-[1.5]" />
                                                </div>
                                                <span className="tabular-nums">{item.table_number}</span>
                                            </div>
                                        </td>
                                        <td className={`px-4 text-zinc-600 dark:text-zinc-400 font-medium ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {item.area || '—'}
                                        </td>
                                        <td className={`px-4 text-center font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {item.capacity} ghế
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            {renderStatusBadge(item.status)}
                                        </td>
                                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                            <div className="flex items-center justify-center space-x-1">
                                                <button
                                                    type="button"
                                                    disabled={item.status === 'occupied'}
                                                    onClick={() => onEdit(item)}
                                                    className={`p-1.5 rounded-lg transition-colors ${
                                                        item.status === 'occupied'
                                                            ? 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-50'
                                                            : 'text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                    }`}
                                                    title={item.status === 'occupied' ? 'Bàn đang có khách sử dụng, không thể chỉnh sửa' : 'Chỉnh sửa bàn'}
                                                    aria-label="Chỉnh sửa bàn"
                                                >
                                                    <Edit3 className="w-4 h-4 stroke-[1.5]" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDelete(item)}
                                                    className="p-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                                    title="Xóa bàn"
                                                    aria-label="Xóa bàn"
                                                >
                                                    <Trash2 className="w-4 h-4 stroke-[1.5]" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Table Footer Controls */}
            <div className="bg-zinc-50 dark:bg-zinc-800/60 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsCompact(!isCompact)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                            isCompact
                                ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                        }`}
                    >
                        <Rows3 className="w-4 h-4 stroke-[1.5]" />
                        <span>{isCompact ? 'Xem đầy đủ' : 'Thu gọn bảng'}</span>
                    </button>

                    <div className="flex items-center space-x-1 border-l border-zinc-200 dark:border-zinc-700 pl-3">
                        <span className="text-zinc-500 mr-1">Hiển thị:</span>
                        {[20, 50, 100].map((size) => (
                            <button
                                key={size}
                                type="button"
                                onClick={() => {
                                    setPageSize(size);
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                                    pageSize === size
                                        ? 'bg-blue-600 text-white'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                            >
                                {size}
                            </button>
                        ))}
                        <span className="text-zinc-400 ml-1">dòng/trang</span>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage(1)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        |&#9664;
                    </button>

                    <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9664;
                    </button>

                    <div className="flex items-center space-x-1.5 text-zinc-600 dark:text-zinc-400">
                        <span>Trang</span>
                        <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={safeCurrentPage}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                    setCurrentPage(Math.min(Math.max(1, val), totalPages));
                                }
                            }}
                            className="w-12 text-center py-1 border rounded-md bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 font-semibold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                        <span>/ {totalPages}</span>
                    </div>

                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;
                    </button>

                    <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        &#9654;|
                    </button>
                </div>
            </div>
        </div>
    );
}
