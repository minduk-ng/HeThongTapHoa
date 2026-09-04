import { Head, router } from '@inertiajs/react';
import {
    Search,
    ChevronUp,
    ChevronDown,
    Rows3,
    ReceiptText,
    RotateCcw,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import DatePicker from '../../../components/DatePicker';
import ManagerPageLayout from '../../../components/ManagerPageLayout';
import DashboardLayout from '../../../layouts/DashboardLayout';

interface OrderData {
    id: number;
    order_code: string;
    table_number: string | null;
    customer_name: string | null;
    status: string;
    total: number;
    item_count: number;
    payment_method: string | null;
    invoice_code: string | null;
    created_at: string;
}

interface Summary {
    total_orders: number;
    open_orders: number;
    paid_orders: number;
    cancelled_orders: number;
}

interface OrderListProps {
    orders: OrderData[];
    summary: Summary;
    startDate: string;
    endDate: string;
}

type SortField =
    'order_code' | 'table_number' | 'status' | 'total' | 'created_at';
type SortDirection = 'asc' | 'desc';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
    draft: {
        label: 'Nháp',
        className:
            'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    },
    pending: {
        label: 'Chờ xử lý',
        className:
            'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
    confirmed: {
        label: 'Đã xác nhận',
        className:
            'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    },
    processing: {
        label: 'Đang chế biến',
        className:
            'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    },
    completed: {
        label: 'Hoàn thành',
        className:
            'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    paid: {
        label: 'Đã thanh toán',
        className:
            'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    cancelled: {
        label: 'Đã hủy',
        className:
            'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    },
};

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
};

export default function OrderList({
    orders,
    summary,
    startDate,
    endDate,
}: OrderListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<
        'all' | 'dine_in' | 'takeaway'
    >('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [startDateVal, setStartDateVal] = useState(startDate);
    const [endDateVal, setEndDateVal] = useState(endDate);

    // Table states
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState(20);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<SortField>('created_at');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const safeOrders = useMemo(
        () => (Array.isArray(orders) ? orders : []),
        [orders],
    );

    // Client-side filtering
    const filteredOrders = useMemo(() => {
        return safeOrders.filter((order) => {
            const query = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !query ||
                order.order_code.toLowerCase().includes(query) ||
                (order.invoice_code ?? '').toLowerCase().includes(query) ||
                (order.customer_name ?? '').toLowerCase().includes(query);

            const matchesType =
                typeFilter === 'all' ||
                (typeFilter === 'takeaway'
                    ? order.table_number === null
                    : order.table_number !== null);

            const matchesStatus =
                statusFilter === 'all' || order.status === statusFilter;

            return matchesSearch && matchesType && matchesStatus;
        });
    }, [safeOrders, searchQuery, typeFilter, statusFilter]);

    // Sorting
    const sortedOrders = useMemo(() => {
        const sorted = [...filteredOrders];
        sorted.sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            if (sortField === 'table_number') {
                valA = a.table_number ?? '';
                valB = b.table_number ?? '';
            }

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
            }

            if (typeof valB === 'string') {
                valB = valB.toLowerCase();
            }

            if (valA < valB) {
                return sortDirection === 'asc' ? -1 : 1;
            }

            if (valA > valB) {
                return sortDirection === 'asc' ? 1 : -1;
            }

            return 0;
        });

        return sorted;
    }, [filteredOrders, sortField, sortDirection]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const paginatedOrders = useMemo(() => {
        const start = (safeCurrentPage - 1) * pageSize;

        return sortedOrders.slice(start, start + pageSize);
    }, [sortedOrders, safeCurrentPage, pageSize]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }

        setCurrentPage(1);
    };

    const handleRangeApply = (start: string | null, end: string | null) => {
        if (!start || !end) {
            return;
        }

        setStartDateVal(start);
        setEndDateVal(end);
        router.get(
            '/manager/orders',
            { start_date: start, end_date: end },
            { preserveState: false },
        );
    };

    const handleReset = () => {
        router.get('/manager/orders', {}, { preserveState: false });
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
        }).format(val);

    const formatDateTime = (iso: string) => {
        const d = new Date(iso);

        return d.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return (
                <ChevronUp className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />
            );
        }

        return sortDirection === 'asc' ? (
            <ChevronUp className="h-3 w-3 text-sky-500" />
        ) : (
            <ChevronDown className="h-3 w-3 text-sky-500" />
        );
    };

    const hasActiveFilter = Boolean(searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || startDateVal || endDateVal);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Danh sách Order" />

            <ManagerPageLayout
                icon={ReceiptText}
                title="Danh sách Đơn hàng"
                subtitle="Xem lịch sử và chi tiết toàn bộ đơn hàng"
                badge={
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                            {summary.total_orders} đơn
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {summary.paid_orders} đã thanh toán
                        </span>
                    </div>
                }
                hasActiveFilter={hasActiveFilter}
                filters={
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Tìm mã đơn / hóa đơn..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors"
                            />
                        </div>

                        {/* Type Filter */}
                        <div className="w-36">
                            <select
                                value={typeFilter}
                                onChange={(e) => {
                                    setTypeFilter(e.target.value as any);
                                    setCurrentPage(1);
                                }}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả loại đơn</option>
                                <option value="dine_in">Tại bàn</option>
                                <option value="takeaway">Mang đi</option>
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="w-40">
                            <select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full px-3 py-1.5 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 font-medium"
                            >
                                <option value="all">Tất cả trạng thái</option>
                                <option value="pending">Chờ xử lý</option>
                                <option value="processing">Đang chế biến</option>
                                <option value="completed">Hoàn thành</option>
                                <option value="paid">Đã thanh toán</option>
                                <option value="cancelled">Đã hủy</option>
                            </select>
                        </div>

                        {/* Date Range */}
                        <div className="w-60">
                            <DatePicker
                                mode="range"
                                startDate={startDateVal}
                                endDate={endDateVal}
                                onChange={handleRangeApply}
                                className="w-full justify-start text-xs rounded-xl"
                            />
                        </div>

                        {/* Reset Filter Button */}
                        {hasActiveFilter && (
                            <button
                                type="button"
                                onClick={handleReset}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                title="Đặt lại bộ lọc"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Đặt lại</span>
                            </button>
                        )}
                    </div>
                }
            >

                {/* Table */}
                <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full border-collapse text-left">
                        <thead className="sticky top-0 z-10 border-b border-zinc-200/80 bg-zinc-50/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-800/95">
                            <tr className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none text-center border-r border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/60"
                                    onClick={() => handleSort('order_code')}
                                >
                                    <span className="flex items-center justify-center space-x-1">
                                        <span>Mã order</span>
                                        {renderSortIcon('order_code')}
                                    </span>
                                </th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none text-center border-r border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/60"
                                    onClick={() => handleSort('table_number')}
                                >
                                    <span className="flex items-center justify-center space-x-1">
                                        <span>Bàn</span>
                                        {renderSortIcon('table_number')}
                                    </span>
                                </th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none text-center border-r border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/60"
                                    onClick={() => handleSort('status')}
                                >
                                    <span className="flex items-center justify-center space-x-1">
                                        <span>Trạng thái</span>
                                        {renderSortIcon('status')}
                                    </span>
                                </th>
                                <th className="px-4 py-2.5 text-left border-r border-zinc-200/60 dark:border-zinc-800/60">Khách hàng</th>
                                <th className="px-4 py-2.5 text-center border-r border-zinc-200/60 dark:border-zinc-800/60">Món</th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none text-right border-r border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/60"
                                    onClick={() => handleSort('total')}
                                >
                                    <span className="flex items-center justify-end space-x-1">
                                        <span>Tổng tiền</span>
                                        {renderSortIcon('total')}
                                    </span>
                                </th>
                                <th className="px-4 py-2.5 text-center border-r border-zinc-200/60 dark:border-zinc-800/60">Thanh toán</th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none text-center hover:bg-zinc-100/80 dark:hover:bg-zinc-700/60"
                                    onClick={() => handleSort('created_at')}
                                >
                                    <span className="flex items-center justify-center space-x-1">
                                        <span>Thời gian</span>
                                        {renderSortIcon('created_at')}
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                            {paginatedOrders.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-4 py-16 text-center"
                                    >
                                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                            Không có đơn hàng nào trong khoảng
                                            thời gian này
                                        </p>
                                        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                            Thử mở rộng khoảng ngày hoặc kiểm
                                            tra bộ lọc
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedOrders.map((order) => {
                                    const statusInfo =
                                        STATUS_MAP[order.status] ??
                                        STATUS_MAP.draft;

                                    return (
                                        <tr
                                            key={order.id}
                                            onClick={() =>
                                                router.get(
                                                    `/manager/orders/${order.id}`,
                                                )
                                            }
                                            className="cursor-pointer transition-colors hover:bg-sky-50/40 dark:hover:bg-sky-900/15"
                                        >
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-center text-xs font-mono font-medium text-sky-600 dark:text-sky-400 tabular-nums border-r border-zinc-100/80 dark:border-zinc-800/40`}
                                            >
                                                {order.order_code}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-center text-xs font-medium text-zinc-700 dark:text-zinc-300 border-r border-zinc-100/80 dark:border-zinc-800/40`}
                                            >
                                                {order.table_number ??
                                                    'Mang đi'}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-center border-r border-zinc-100/80 dark:border-zinc-800/40`}
                                            >
                                                <span
                                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.className}`}
                                                >
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 border-r border-zinc-100/80 dark:border-zinc-800/40`}
                                            >
                                                {order.customer_name || '—'}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-center text-xs text-zinc-600 tabular-nums dark:text-zinc-400 border-r border-zinc-100/80 dark:border-zinc-800/40`}
                                            >
                                                {order.item_count}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100 border-r border-zinc-100/80 dark:border-zinc-800/40`}
                                            >
                                                {formatCurrency(order.total)}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-center text-xs text-zinc-600 dark:text-zinc-400 border-r border-zinc-100/80 dark:border-zinc-800/40`}
                                            >
                                                {order.payment_method
                                                    ? (PAYMENT_LABELS[
                                                           order.payment_method
                                                       ] ?? order.payment_method)
                                                    : '—'}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-center text-xs text-zinc-500 tabular-nums dark:text-zinc-400`}
                                            >
                                                {formatDateTime(
                                                    order.created_at,
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                    <div className="flex items-center space-x-3">
                        <span className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                            {sortedOrders.length} đơn hàng
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsCompact(!isCompact)}
                            className={`rounded p-1 transition-colors ${isCompact ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30' : 'text-zinc-400 hover:text-zinc-600'}`}
                            title={
                                isCompact ? 'Chế độ thường' : 'Chế độ compact'
                            }
                        >
                            <Rows3 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="flex items-center space-x-2">
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                            <option value={20}>20 / trang</option>
                            <option value={50}>50 / trang</option>
                            <option value={100}>100 / trang</option>
                        </select>
                        <div className="flex items-center space-x-1">
                            <button
                                type="button"
                                disabled={safeCurrentPage <= 1}
                                onClick={() =>
                                    setCurrentPage(safeCurrentPage - 1)
                                }
                                className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                Trước
                            </button>
                            <span className="px-2 text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                                {safeCurrentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={safeCurrentPage >= totalPages}
                                onClick={() =>
                                    setCurrentPage(safeCurrentPage + 1)
                                }
                                className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </div>
            </ManagerPageLayout>
        </DashboardLayout>
    );
}
