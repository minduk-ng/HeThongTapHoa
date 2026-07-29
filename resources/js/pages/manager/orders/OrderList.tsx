import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../components/ManagerPageLayout';

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

type SortField = 'order_code' | 'table_number' | 'status' | 'total' | 'created_at';
type SortDirection = 'asc' | 'desc';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
    draft: { label: 'Nháp', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
    pending: { label: 'Chờ xử lý', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    confirmed: { label: 'Đã xác nhận', className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    processing: { label: 'Đang chế biến', className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    completed: { label: 'Hoàn thành', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    paid: { label: 'Đã thanh toán', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    cancelled: { label: 'Đã hủy', className: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
};

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
};

export default function OrderList({ orders, summary, startDate, endDate }: OrderListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'dine_in' | 'takeaway'>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [startDateVal, setStartDateVal] = useState(startDate);
    const [endDateVal, setEndDateVal] = useState(endDate);

    // Table states
    const [isCompact, setIsCompact] = useState(false);
    const [pageSize, setPageSize] = useState(20);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<SortField>('created_at');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const safeOrders = Array.isArray(orders) ? orders : [];

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
                (typeFilter === 'takeaway' ? order.table_number === null : order.table_number !== null);

            const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

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

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
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

    const handleDateApply = () => {
        router.get('/manager/orders', { start_date: startDateVal, end_date: endDateVal }, { preserveState: false });
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    const formatDateTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ChevronUp className="w-3 h-3 text-zinc-300 dark:text-zinc-600" />;
        return sortDirection === 'asc'
            ? <ChevronUp className="w-3 h-3 text-sky-500" />
            : <ChevronDown className="w-3 h-3 text-sky-500" />;
    };

    const summaryCards = [
        { label: 'Tổng order', value: summary.total_orders, icon: ClipboardList, color: 'text-zinc-600 dark:text-zinc-300' },
        { label: 'Đang mở', value: summary.open_orders, icon: Clock, color: 'text-amber-600 dark:text-amber-400' },
        { label: 'Đã thanh toán', value: summary.paid_orders, icon: CircleDollarSign, color: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Đã hủy', value: summary.cancelled_orders, icon: XCircle, color: 'text-rose-600 dark:text-rose-400' },
    ];

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Danh sách Order" />

            <ManagerPageLayout
                sidebar={
                    <>
                        {/* Header */}
                        <div>
                            <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                                <ReceiptText className="w-5 h-5 stroke-[1.5]" />
                                <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý</span>
                            </div>
                            <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                Danh sách Order
                            </h1>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                Xem lịch sử & chi tiết toàn bộ đơn hàng
                            </p>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-2">
                            {summaryCards.map((card) => (
                                <div key={card.label} className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 p-3">
                                    <div className={`flex items-center space-x-1.5 ${card.color}`}>
                                        <card.icon className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                            {card.label}
                                        </span>
                                    </div>
                                    <p className={`text-lg font-semibold tabular-nums mt-1 ${card.color}`}>{card.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Date Range Filter */}
                        <div className="space-y-2">
                            <label className="flex items-center space-x-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                <CalendarDays className="w-3.5 h-3.5" />
                                <span>Khoảng thời gian</span>
                            </label>
                            <div className="space-y-1.5">
                                <input
                                    type="date"
                                    value={startDateVal}
                                    onChange={(e) => setStartDateVal(e.target.value)}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-colors"
                                />
                                <input
                                    type="date"
                                    value={endDateVal}
                                    onChange={(e) => setEndDateVal(e.target.value)}
                                    className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-colors"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleDateApply}
                                className="w-full px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl transition-colors duration-150 shadow-xs"
                            >
                                Áp dụng
                            </button>
                        </div>

                        {/* Type Filter */}
                        <div className="space-y-2">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Loại đơn</span>
                            <div className="flex flex-wrap gap-1.5">
                                {([['all', 'Tất cả'], ['dine_in', 'Tại bàn'], ['takeaway', 'Mang đi']] as const).map(([val, label]) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => { setTypeFilter(val); setCurrentPage(1); }}
                                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                            typeFilter === val
                                                ? 'bg-sky-600 text-white shadow-xs'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Status Filter */}
                        <div className="space-y-2">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Trạng thái</span>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-colors"
                            >
                                <option value="all">Tất cả</option>
                                <option value="pending">Chờ xử lý</option>
                                <option value="processing">Đang chế biến</option>
                                <option value="completed">Hoàn thành</option>
                                <option value="paid">Đã thanh toán</option>
                                <option value="cancelled">Đã hủy</option>
                            </select>
                        </div>
                    </>
                }
            >
                {/* Search Bar */}
                <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Tìm theo mã order hoặc mã hóa đơn..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto min-h-0">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/90 backdrop-blur-sm">
                            <tr className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                <th className="px-4 py-2.5 cursor-pointer select-none" onClick={() => handleSort('order_code')}>
                                    <span className="flex items-center space-x-1"><span>Mã order</span><SortIcon field="order_code" /></span>
                                </th>
                                <th className="px-4 py-2.5 cursor-pointer select-none" onClick={() => handleSort('table_number')}>
                                    <span className="flex items-center space-x-1"><span>Bàn</span><SortIcon field="table_number" /></span>
                                </th>
                                <th className="px-4 py-2.5 cursor-pointer select-none" onClick={() => handleSort('status')}>
                                    <span className="flex items-center space-x-1"><span>Trạng thái</span><SortIcon field="status" /></span>
                                </th>
                                <th className="px-4 py-2.5 text-right">Món</th>
                                <th className="px-4 py-2.5 text-right cursor-pointer select-none" onClick={() => handleSort('total')}>
                                    <span className="flex items-center justify-end space-x-1"><span>Tổng tiền</span><SortIcon field="total" /></span>
                                </th>
                                <th className="px-4 py-2.5">Thanh toán</th>
                                <th className="px-4 py-2.5 cursor-pointer select-none" onClick={() => handleSort('created_at')}>
                                    <span className="flex items-center space-x-1"><span>Thời gian</span><SortIcon field="created_at" /></span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                            {paginatedOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">Không có đơn hàng nào trong khoảng thời gian này</p>
                                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Thử mở rộng khoảng ngày hoặc kiểm tra bộ lọc</p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedOrders.map((order) => {
                                    const statusInfo = STATUS_MAP[order.status] ?? STATUS_MAP.draft;
                                    return (
                                        <tr
                                            key={order.id}
                                            onClick={() => router.get(`/manager/orders/${order.id}`)}
                                            className={`cursor-pointer transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-900/10 ${isCompact ? '' : ''}`}
                                        >
                                            <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} font-medium text-xs text-zinc-900 dark:text-zinc-100 tabular-nums`}>
                                                {order.order_code}
                                            </td>
                                            <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-xs text-zinc-600 dark:text-zinc-400`}>
                                                {order.table_number ?? 'Mang đi'}
                                            </td>
                                            <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                                                <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${statusInfo.className}`}>
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right text-xs text-zinc-600 dark:text-zinc-400 tabular-nums`}>
                                                {order.item_count}
                                            </td>
                                            <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right text-xs font-medium text-zinc-900 dark:text-zinc-100 tabular-nums`}>
                                                {formatCurrency(order.total)}
                                            </td>
                                            <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-xs text-zinc-600 dark:text-zinc-400`}>
                                                {order.payment_method ? PAYMENT_LABELS[order.payment_method] ?? order.payment_method : '—'}
                                            </td>
                                            <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-xs text-zinc-500 dark:text-zinc-400 tabular-nums`}>
                                                {formatDateTime(order.created_at)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                            {sortedOrders.length} đơn hàng
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsCompact(!isCompact)}
                            className={`p-1 rounded transition-colors ${isCompact ? 'text-sky-600 bg-sky-50 dark:bg-sky-900/30' : 'text-zinc-400 hover:text-zinc-600'}`}
                            title={isCompact ? 'Chế độ thường' : 'Chế độ compact'}
                        >
                            <Rows3 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="flex items-center space-x-2">
                        <select
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            className="px-2 py-1 text-[11px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 outline-none"
                        >
                            <option value={20}>20 / trang</option>
                            <option value={50}>50 / trang</option>
                            <option value={100}>100 / trang</option>
                        </select>
                        <div className="flex items-center space-x-1">
                            <button
                                type="button"
                                disabled={safeCurrentPage <= 1}
                                onClick={() => setCurrentPage(safeCurrentPage - 1)}
                                className="px-2 py-1 text-[11px] rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                                Trước
                            </button>
                            <span className="px-2 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                {safeCurrentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={safeCurrentPage >= totalPages}
                                onClick={() => setCurrentPage(safeCurrentPage + 1)}
                                className="px-2 py-1 text-[11px] rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
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
