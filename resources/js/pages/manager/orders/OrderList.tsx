import { Head, router } from '@inertiajs/react';
import {
    ClipboardList,
    Search,
    ChevronUp,
    ChevronDown,
    Rows3,
    CalendarDays,
    ReceiptText,
    CircleDollarSign,
    XCircle,
    Clock,
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
                (order.invoice_code ?? '').toLowerCase().includes(query);

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

    const summaryCards = [
        {
            label: 'Tổng order',
            value: summary.total_orders,
            icon: ClipboardList,
            color: 'text-zinc-600 dark:text-zinc-300',
        },
        {
            label: 'Đang mở',
            value: summary.open_orders,
            icon: Clock,
            color: 'text-amber-600 dark:text-amber-400',
        },
        {
            label: 'Đã thanh toán',
            value: summary.paid_orders,
            icon: CircleDollarSign,
            color: 'text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Đã hủy',
            value: summary.cancelled_orders,
            icon: XCircle,
            color: 'text-rose-600 dark:text-rose-400',
        },
    ];

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Danh sách Order" />

            <ManagerPageLayout
                sidebar={
                    <>
                        {/* Header */}
                        <div>
                            <div className="mb-1 flex items-center space-x-2 text-sky-600 dark:text-sky-400">
                                <ReceiptText className="h-5 w-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold tracking-wider uppercase">
                                    Phân hệ Quản lý
                                </span>
                            </div>
                            <h1 className="font-display text-xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                                Danh sách Order
                            </h1>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                Xem lịch sử & chi tiết toàn bộ đơn hàng
                            </p>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-2">
                            {summaryCards.map((card) => (
                                <div
                                    key={card.label}
                                    className="rounded-xl border border-zinc-200/80 p-3 dark:border-zinc-800/80"
                                >
                                    <div
                                        className={`flex items-center space-x-1.5 ${card.color}`}
                                    >
                                        <card.icon className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                                            {card.label}
                                        </span>
                                    </div>
                                    <p
                                        className={`mt-1 text-lg font-semibold tabular-nums ${card.color}`}
                                    >
                                        {card.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Date Range Filter */}
                        <div className="space-y-2">
                            <label className="flex items-center space-x-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                <CalendarDays className="h-3.5 w-3.5" />
                                <span>Khoảng thời gian</span>
                            </label>
                            <DatePicker
                                mode="range"
                                startDate={startDateVal}
                                endDate={endDateVal}
                                onChange={handleRangeApply}
                                className="w-full justify-start"
                            />
                            <button
                                type="button"
                                onClick={handleReset}
                                className="flex w-full items-center justify-center space-x-1.5 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-500 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                            >
                                <RotateCcw className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>Đặt lại</span>
                            </button>
                        </div>

                        {/* Type Filter */}
                        <div className="space-y-2">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Loại đơn
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {(
                                    [
                                        ['all', 'Tất cả'],
                                        ['dine_in', 'Tại bàn'],
                                        ['takeaway', 'Mang đi'],
                                    ] as const
                                ).map(([val, label]) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => {
                                            setTypeFilter(val);
                                            setCurrentPage(1);
                                        }}
                                        className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                                            typeFilter === val
                                                ? 'bg-sky-600 text-white shadow-xs'
                                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="space-y-2">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Trạng thái
                            </span>
                            <select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 transition-colors outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            >
                                <option value="all">Tất cả</option>
                                <option value="pending">Chờ xử lý</option>
                                <option value="processing">
                                    Đang chế biến
                                </option>
                                <option value="completed">Hoàn thành</option>
                                <option value="paid">Đã thanh toán</option>
                                <option value="cancelled">Đã hủy</option>
                            </select>
                        </div>
                    </>
                }
            >
                {/* Search Bar */}
                <div className="border-b border-zinc-100 px-4 pt-4 pb-3 dark:border-zinc-800">
                    <div className="relative">
                        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Tìm theo mã order hoặc mã hóa đơn..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-4 pl-9 text-xs text-zinc-900 transition-colors outline-none placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 z-10 bg-zinc-50 backdrop-blur-sm dark:bg-zinc-800/90">
                            <tr className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none"
                                    onClick={() => handleSort('order_code')}
                                >
                                    <span className="flex items-center space-x-1">
                                        <span>Mã order</span>
                                        {renderSortIcon('order_code')}
                                    </span>
                                </th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none"
                                    onClick={() => handleSort('table_number')}
                                >
                                    <span className="flex items-center space-x-1">
                                        <span>Bàn</span>
                                        {renderSortIcon('table_number')}
                                    </span>
                                </th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none"
                                    onClick={() => handleSort('status')}
                                >
                                    <span className="flex items-center space-x-1">
                                        <span>Trạng thái</span>
                                        {renderSortIcon('status')}
                                    </span>
                                </th>
                                <th className="px-4 py-2.5 text-right">Món</th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 text-right select-none"
                                    onClick={() => handleSort('total')}
                                >
                                    <span className="flex items-center justify-end space-x-1">
                                        <span>Tổng tiền</span>
                                        {renderSortIcon('total')}
                                    </span>
                                </th>
                                <th className="px-4 py-2.5">Thanh toán</th>
                                <th
                                    className="cursor-pointer px-4 py-2.5 select-none"
                                    onClick={() => handleSort('created_at')}
                                >
                                    <span className="flex items-center space-x-1">
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
                                        colSpan={7}
                                        className="px-4 py-12 text-center"
                                    >
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
                                            className={`cursor-pointer transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-900/10 ${isCompact ? '' : ''}`}
                                        >
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-xs font-medium text-zinc-900 tabular-nums dark:text-zinc-100`}
                                            >
                                                {order.order_code}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-xs text-zinc-600 dark:text-zinc-400`}
                                            >
                                                {order.table_number ??
                                                    'Mang đi'}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}
                                            >
                                                <span
                                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.className}`}
                                                >
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right text-xs text-zinc-600 tabular-nums dark:text-zinc-400`}
                                            >
                                                {order.item_count}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right text-xs font-medium text-zinc-900 tabular-nums dark:text-zinc-100`}
                                            >
                                                {formatCurrency(order.total)}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-xs text-zinc-600 dark:text-zinc-400`}
                                            >
                                                {order.payment_method
                                                    ? (PAYMENT_LABELS[
                                                          order.payment_method
                                                      ] ?? order.payment_method)
                                                    : '—'}
                                            </td>
                                            <td
                                                className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-xs text-zinc-500 tabular-nums dark:text-zinc-400`}
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
