import { Head, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ReceiptText,
    Clock,
    User,
    History,
    PackageCheck,
    Send,
    PlusCircle,
    XCircle,
    Truck,
    CircleDollarSign,
    RotateCcw,
} from 'lucide-react';
import React, { useState } from 'react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import RefundModal from './components/RefundModal';
import type {RefundLine} from './components/RefundModal';

interface OrderItemData {
    id: number;
    name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    discount_amount: number;
    note: string | null;
    status: string;
    served_at: string | null;
    cancellation_reason: string | null;
}

interface InvoiceData {
    id: number;
    invoice_code: string;
    payment_method: string;
    total_amount: number;
    deposit_amount: number;
    amount_received: number;
    change_amount: number;
    issued_at: string;
    lines: RefundLine[];
}

interface ActivityData {
    id: number;
    action: string;
    user_name: string;
    meta: Record<string, any> | null;
    created_at: string;
}

interface DepositData {
    id: number;
    amount: number;
    method: string;
    status: string;
    note: string | null;
    received_by_name: string;
    created_at: string;
}

interface OrderDetailData {
    id: number;
    order_code: string;
    table_number: string | null;
    customer_name: string | null;
    status: string;
    subtotal: number;
    vat_amount: number;
    total: number;
    discount_amount: number;
    deposit_total: number;
    deposits: DepositData[];
    created_at: string;
    items: OrderItemData[];
    invoice: InvoiceData | null;
    activities: ActivityData[];
}

interface OrderDetailProps {
    order: OrderDetailData;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
    draft: { label: 'Nháp', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
    pending: { label: 'Chờ xử lý', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    confirmed: { label: 'Đã xác nhận', className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    processing: { label: 'Đang chế biến', className: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    completed: { label: 'Hoàn thành', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    paid: { label: 'Đã thanh toán', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    cancelled: { label: 'Đã hủy', className: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
};

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    created: { label: 'Tạo đơn hàng', icon: PlusCircle, color: 'text-sky-500' },
    sent_kitchen: { label: 'Gửi xuống bếp', icon: Send, color: 'text-amber-500' },
    additional: { label: 'Gọi thêm món', icon: PlusCircle, color: 'text-sky-500' },
    completed: { label: 'Bếp hoàn thành', icon: PackageCheck, color: 'text-emerald-500' },
    served: { label: 'Phục vụ', icon: Truck, color: 'text-emerald-500' },
    item_cancel: { label: 'Hủy món', icon: XCircle, color: 'text-rose-500' },
    order_cancelled: { label: 'Hủy đơn hàng', icon: XCircle, color: 'text-rose-500' },
    checkout: { label: 'Thanh toán', icon: CircleDollarSign, color: 'text-emerald-600' },
    refund: { label: 'Hoàn trả', icon: RotateCcw, color: 'text-rose-500' },
    deposit_received: { label: 'Nhận đặt cọc', icon: CircleDollarSign, color: 'text-violet-600 dark:text-violet-400' },
};

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
};

export default function OrderDetail({ order }: OrderDetailProps) {
    const [activeTab, setActiveTab] = useState<'detail' | 'history'>('detail');
    const [refundOpen, setRefundOpen] = useState(false);

    const safeItems = Array.isArray(order.items) ? order.items : [];
    const safeActivities = Array.isArray(order.activities) ? order.activities : [];

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    const formatDateTime = (iso: string) => {
        const d = new Date(iso);

        return d.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const statusInfo = STATUS_MAP[order.status] ?? STATUS_MAP.draft;

    const depositTotal = order.deposit_total || 0;

    const cocDu = Math.max(0, (order.invoice ? order.invoice.deposit_amount : depositTotal) - order.total);
    const displayChangeAmount = order.invoice 
        ? Math.max(
              order.invoice.change_amount,
              cocDu + Math.max(0, order.invoice.amount_received - Math.max(0, order.total - order.invoice.deposit_amount))
          )
        : 0;

    return (
        <DashboardLayout fullWidth={true}>
            <Head title={`Chi tiết Order ${order.order_code}`} />

            <div className="flex-1 flex flex-col h-full w-full min-h-0 overflow-hidden">
                <div className="flex-1 h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-xs flex flex-col min-w-0 min-h-0 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <button
                                    type="button"
                                    onClick={() => router.get('/manager/orders')}
                                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div>
                                    <div className="flex items-center space-x-2.5">
                                        <ReceiptText className="w-5 h-5 text-sky-500" />
                                        <h1 className="font-display text-2xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                                            {order.order_code}
                                        </h1>
                                        <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}>
                                            {statusInfo.label}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                    {formatCurrency(order.total)}
                                </p>
                                {order.vat_amount > 0 && (
                                    <p className="text-xs text-zinc-400 tabular-nums">VAT: {formatCurrency(order.vat_amount)}</p>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex space-x-1.5 mt-4">
                            <button
                                type="button"
                                onClick={() => setActiveTab('detail')}
                                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                                    activeTab === 'detail'
                                        ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <ReceiptText className="w-4.5 h-4.5" />
                                <span>Chi tiết</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                                    activeTab === 'history'
                                        ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <History className="w-4.5 h-4.5" />
                                <span>Lịch sử</span>
                                <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 tabular-nums">
                                    {safeActivities.length}
                                </span>
                            </button>
                            {order.status === 'paid' && order.invoice && (
                                <button
                                    type="button"
                                    onClick={() => setRefundOpen(true)}
                                    className="ml-auto flex items-center space-x-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                                >
                                    <RotateCcw className="w-4.5 h-4.5" />
                                    <span>Hoàn trả</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col min-h-0">
                        {activeTab === 'detail' ? (
                            <>
                                {/* Info Banner */}
                                <div className="mx-6 mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 text-sm">
                                    <div>
                                        <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Bàn / Đơn</span>
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{order.table_number ?? 'Mang đi'}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Khách hàng</span>
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{order.customer_name ?? '—'}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Thời gian đặt</span>
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{formatDateTime(order.created_at)}</span>
                                    </div>
                                    {order.invoice && (
                                        <>
                                            <div>
                                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Mã Hóa đơn</span>
                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{order.invoice.invoice_code}</span>
                                            </div>
                                            <div>
                                                <span className="text-xs text-zinc-400 dark:text-zinc-500 block font-medium">Thời gian thanh toán</span>
                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{formatDateTime(order.invoice.issued_at)}</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Items Table - scrollable */}
                                <div className="flex-1 overflow-auto min-h-0 px-6 pt-4">
                                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                                        Món ăn ({safeItems.length})
                                    </h2>
                                    <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden">
                                        <table className="w-full border-collapse text-left">
                                            <thead className="sticky top-0 z-10 border-b border-zinc-200/80 bg-zinc-50/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-800/95">
                                                <tr className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                                    <th className="px-3 py-2 text-left border-r border-zinc-200/60 dark:border-zinc-800/60">Món</th>
                                                    <th className="px-3 py-2 text-center border-r border-zinc-200/60 dark:border-zinc-800/60">SL</th>
                                                    <th className="px-3 py-2 text-right border-r border-zinc-200/60 dark:border-zinc-800/60">Đơn giá</th>
                                                    <th className="px-3 py-2 text-right border-r border-zinc-200/60 dark:border-zinc-800/60">Thành tiền</th>
                                                    <th className="px-3 py-2 text-right border-r border-zinc-200/60 dark:border-zinc-800/60">Giảm giá</th>
                                                    <th className="px-3 py-2 text-center border-r border-zinc-200/60 dark:border-zinc-800/60">Trạng thái</th>
                                                    <th className="px-3 py-2 text-center">Thời gian</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                                {safeItems.map((item) => (
                                                    <tr key={item.id} className={`transition-colors hover:bg-sky-50/30 dark:hover:bg-sky-950/20 ${item.status === 'cancelled' ? 'opacity-50' : ''}`}>
                                                        <td className="px-3 py-2 text-left border-r border-zinc-100/80 dark:border-zinc-800/40">
                                                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight">{item.name}</p>
                                                            {item.note && <p className="text-[11px] text-zinc-400 leading-tight">{item.note}</p>}
                                                            {item.cancellation_reason && (
                                                                <p className="text-[11px] text-rose-500 leading-tight">Lý do: {item.cancellation_reason}</p>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-center text-sm text-zinc-600 dark:text-zinc-400 tabular-nums border-r border-zinc-100/80 dark:border-zinc-800/40">{item.quantity}</td>
                                                        <td className="px-3 py-2 text-right text-sm text-zinc-600 dark:text-zinc-400 tabular-nums border-r border-zinc-100/80 dark:border-zinc-800/40">{formatCurrency(item.unit_price)}</td>
                                                        <td className="px-3 py-2 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100 tabular-nums border-r border-zinc-100/80 dark:border-zinc-800/40">{formatCurrency(item.subtotal)}</td>
                                                        <td className="px-3 py-2 text-right text-sm tabular-nums border-r border-zinc-100/80 dark:border-zinc-800/40">
                                                            {item.discount_amount > 0 ? (
                                                                <span className="font-medium text-rose-600 dark:text-rose-400">
                                                                    −{formatCurrency(item.discount_amount)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-center border-r border-zinc-100/80 dark:border-zinc-800/40">
                                                            <span className={`text-xs font-medium ${
                                                                item.status === 'cancelled' ? 'text-rose-500'
                                                                : item.served_at ? 'text-emerald-600'
                                                                : item.status === 'completed' ? 'text-sky-600'
                                                                : 'text-zinc-400'
                                                            }`}>
                                                                {item.status === 'cancelled' ? 'Đã hủy'
                                                                    : item.served_at ? 'Đã phục vụ'
                                                                    : item.status === 'completed' ? 'Đã xong'
                                                                    : 'Đang chờ'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-center text-xs text-zinc-400 tabular-nums">
                                                            {item.served_at ? formatDateTime(item.served_at) : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Totals & Payment Info - fixed at bottom */}
                                <div className="shrink-0 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40">
                                    {order.invoice && (order as any).invoice_sibling_count > 0 && (
                                        <p className="text-xs text-sky-600 dark:text-sky-400 mb-2 font-medium">
                                            Hóa đơn gộp · {(order as any).invoice_sibling_count + 1} đơn cùng hóa đơn này
                                        </p>
                                    )}
                                    <div className="flex flex-col md:flex-row md:justify-between gap-4">
                                        <div className="flex-1">
                                            {/* Left side spacing */}
                                        </div>
                                        <div className="w-full md:w-80 space-y-2 text-sm">
                                            <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                                                <span>Tạm tính ({safeItems.filter(i => i.status !== 'cancelled').reduce((s, i) => s + i.quantity, 0)} món):</span>
                                                <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{formatCurrency(order.subtotal)}</span>
                                            </div>
                                            {order.vat_amount > 0 && (
                                                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                                                    <span>Thuế VAT:</span>
                                                    <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{formatCurrency(order.vat_amount)}</span>
                                                </div>
                                            )}
                                            {order.discount_amount > 0 && (
                                                <div className="flex justify-between text-rose-600 dark:text-rose-400 font-medium">
                                                    <span>Giảm giá:</span>
                                                    <span className="font-semibold tabular-nums">−{formatCurrency(order.discount_amount)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-zinc-700 dark:text-zinc-300 font-medium">
                                                <span>Tổng tiền đơn hàng:</span>
                                                <span className="font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">{formatCurrency(order.total)}</span>
                                            </div>
                                            {((order.invoice ? order.invoice.deposit_amount : depositTotal) > 0) && (
                                                <div className="flex justify-between text-violet-600 dark:text-violet-400 font-medium">
                                                    <span>Khấu trừ đặt cọc:</span>
                                                    <span className="font-semibold tabular-nums">
                                                        −{formatCurrency(order.invoice ? order.invoice.deposit_amount : depositTotal)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between border-t border-zinc-250/60 dark:border-zinc-800 pt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                                <span>{order.invoice ? 'Khách đã trả (thực thu):' : 'Khách cần trả:'}</span>
                                                <span className="text-base font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                                                    {formatCurrency(
                                                        Math.max(0, order.total - (order.invoice ? order.invoice.deposit_amount : depositTotal))
                                                    )}
                                                </span>
                                            </div>
                                            {order.invoice && (
                                                <>
                                                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/60 pt-2">
                                                        <span>Khách đưa ({PAYMENT_LABELS[order.invoice.payment_method] || order.invoice.payment_method}):</span>
                                                        <span className="font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(order.invoice.amount_received)}</span>
                                                    </div>
                                                    {displayChangeAmount > 0 && (
                                                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                                                            <span>Trả lại (Tiền thừa):</span>
                                                            <span className="font-bold tabular-nums">{formatCurrency(displayChangeAmount)}</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* History Timeline */
                            <div className="flex-1 overflow-auto min-h-0 p-6">
                                {safeActivities.length === 0 ? (
                                    <div className="text-center py-12">
                                        <History className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                                        <p className="text-base text-zinc-500 dark:text-zinc-400">Chưa có hoạt động nào được ghi nhận</p>
                                        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Lịch sử sẽ hiển thị khi đơn hàng có thao tác</p>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        {/* Timeline line */}
                                        <div className="absolute left-[17px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-700" />

                                        <div className="space-y-5">
                                            {(() => {
                                                const depositActivities = safeActivities.filter(a => a.action === 'deposit_received');

                                                return safeActivities.map((activity) => {
                                                    const config = ACTION_CONFIG[activity.action] ?? {
                                                        label: activity.action,
                                                        icon: Clock,
                                                        color: 'text-zinc-400',
                                                    };
                                                    const Icon = config.icon;
                                                    const depositIdx = activity.action === 'deposit_received'
                                                        ? depositActivities.findIndex(a => a.id === activity.id)
                                                        : -1;
                                                    const displayLabel = activity.action === 'deposit_received' && depositIdx !== -1
                                                        ? `Đặt cọc lần ${depositIdx + 1}`
                                                        : config.label;

                                                    return (
                                                        <div key={activity.id} className="relative flex items-start space-x-3.5 pl-1">
                                                            {/* Icon */}
                                                            <div className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 ${config.color}`}>
                                                                <Icon className="w-4.5 h-4.5" />
                                                            </div>

                                                            {/* Content */}
                                                            <div className="flex-1 min-w-0 pt-1">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                                                        {displayLabel}
                                                                    </span>
                                                                    <span className="text-xs text-zinc-400 tabular-nums">
                                                                        {formatDateTime(activity.created_at)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center space-x-1.5 mt-1">
                                                                    <User className="w-3.5 h-3.5 text-zinc-400" />
                                                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{activity.user_name}</span>
                                                                </div>

                                                                {/* Meta details */}
                                                                {activity.meta && (
                                                                    <div className="mt-2 space-y-1">
                                                                        {Array.isArray(activity.meta.items) && activity.meta.items.map((item: any, idx: number) => (
                                                                            <p key={idx} className="text-sm text-zinc-500 dark:text-zinc-400">
                                                                                • {item.name} × {item.qty ?? item.qty_reduced ?? '—'}
                                                                                {item.reason && <span className="text-rose-400"> ({item.reason})</span>}
                                                                            </p>
                                                                        ))}
                                                                        {activity.meta.invoice_code && (
                                                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                                                HĐ: {activity.meta.invoice_code} • {PAYMENT_LABELS[activity.meta.payment_method] ?? activity.meta.payment_method}
                                                                            </p>
                                                                        )}
                                                                        {activity.meta.reason && !activity.meta.items && (
                                                                            <p className="text-sm text-rose-400">Lý do: {activity.meta.reason}</p>
                                                                        )}
                                                                        {activity.meta.total != null && !activity.meta.invoice_code && (
                                                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">
                                                                                Tổng: {formatCurrency(activity.meta.total)}
                                                                            </p>
                                                                        )}
                                                                        {activity.meta.partial && (
                                                                            <p className="text-sm text-amber-500">(Hoàn thành một phần)</p>
                                                                        )}
                                        {activity.meta.amount != null && (
                                            <p className="text-sm text-zinc-650 dark:text-zinc-400 tabular-nums font-semibold mt-1">
                                                {activity.action === 'refund' ? 'Số tiền hoàn: ' : 'Số tiền cọc: '}<span className="text-violet-600 dark:text-violet-400 font-bold">{formatCurrency(activity.meta.amount)}</span>
                                                {activity.meta.method && ` • Hình thức: ${PAYMENT_LABELS[activity.meta.method] || activity.meta.method}`}
                                            </p>
                                        )}
                                                                    </div>
                                                                )}
                                                                {activity.action === 'deposit_received' && activity.meta?.amount == null && (
                                                                    <p className="text-sm text-zinc-650 dark:text-zinc-400 tabular-nums font-semibold mt-1">
                                                                        Số tiền cọc: <span className="text-violet-600 dark:text-violet-400 font-bold">
                                                                            {formatCurrency(order.deposits?.[depositIdx]?.amount ?? depositTotal)}
                                                                        </span>
                                                                        {(order.deposits?.[depositIdx]?.method) && (
                                                                            ` • Hình thức: ${PAYMENT_LABELS[order.deposits[depositIdx].method] || order.deposits[depositIdx].method}`
                                                                        )}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <RefundModal
                isOpen={refundOpen}
                invoiceId={order.invoice?.id ?? 0}
                lines={Array.isArray(order.invoice?.lines) ? order.invoice.lines : []}
                onClose={() => setRefundOpen(false)}
            />
        </DashboardLayout>
    );
}
