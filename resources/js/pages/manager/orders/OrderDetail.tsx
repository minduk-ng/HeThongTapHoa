import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ReceiptText,
    Clock,
    User,
    UtensilsCrossed,
    CreditCard,
    History,
    PackageCheck,
    Send,
    PlusCircle,
    XCircle,
    CheckCircle2,
    Truck,
    CircleDollarSign,
} from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';

interface OrderItemData {
    id: number;
    name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    note: string | null;
    status: string;
    served_at: string | null;
    cancellation_reason: string | null;
}

interface InvoiceData {
    invoice_code: string;
    payment_method: string;
    total_amount: number;
    amount_received: number;
    change_amount: number;
    issued_at: string;
}

interface ActivityData {
    id: number;
    action: string;
    user_name: string;
    meta: Record<string, any> | null;
    created_at: string;
}

interface OrderDetailData {
    id: number;
    order_code: string;
    table_number: string | null;
    status: string;
    subtotal: number;
    vat_amount: number;
    total: number;
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
};

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
};

export default function OrderDetail({ order }: OrderDetailProps) {
    const [activeTab, setActiveTab] = useState<'detail' | 'history'>('detail');

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
                                    <div className="flex items-center space-x-4 mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                                        <span className="flex items-center space-x-1.5">
                                            <UtensilsCrossed className="w-4 h-4" />
                                            <span>{order.table_number ?? 'Mang đi'}</span>
                                        </span>
                                        <span className="flex items-center space-x-1.5">
                                            <Clock className="w-4 h-4" />
                                            <span className="tabular-nums">{formatDateTime(order.created_at)}</span>
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
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto min-h-0 p-6">
                        {activeTab === 'detail' ? (
                            <div className="space-y-6">
                                {/* Items Table */}
                                <div>
                                    <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                                        Món ăn ({safeItems.length})
                                    </h2>
                                    <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-zinc-50 dark:bg-zinc-800/90">
                                                <tr className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                                    <th className="px-4 py-3">Món</th>
                                                    <th className="px-4 py-3 text-center">SL</th>
                                                    <th className="px-4 py-3 text-right">Đơn giá</th>
                                                    <th className="px-4 py-3 text-right">Thành tiền</th>
                                                    <th className="px-4 py-3">Trạng thái</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                                {safeItems.map((item) => (
                                                    <tr key={item.id} className={item.status === 'cancelled' ? 'opacity-50' : ''}>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                                                            {item.note && <p className="text-xs text-zinc-400 mt-0.5">{item.note}</p>}
                                                            {item.cancellation_reason && (
                                                                <p className="text-xs text-rose-500 mt-0.5">Lý do: {item.cancellation_reason}</p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">{item.quantity}</td>
                                                        <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">{formatCurrency(item.unit_price)}</td>
                                                        <td className="px-4 py-3 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(item.subtotal)}</td>
                                                        <td className="px-4 py-3">
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
                                                            {item.served_at && (
                                                                <p className="text-xs text-zinc-400 tabular-nums">{formatDateTime(item.served_at)}</p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Invoice Info */}
                                {order.invoice && (
                                    <div>
                                        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                                            Hóa đơn thanh toán
                                        </h2>
                                        <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 p-5 space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500 dark:text-zinc-400">Mã hóa đơn</span>
                                                <span className="font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">{order.invoice.invoice_code}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500 dark:text-zinc-400">Phương thức</span>
                                                <span className="flex items-center space-x-1.5 text-zinc-900 dark:text-zinc-100">
                                                    <CreditCard className="w-4 h-4" />
                                                    <span>{PAYMENT_LABELS[order.invoice.payment_method] ?? order.invoice.payment_method}</span>
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500 dark:text-zinc-400">Tổng tiền</span>
                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(order.invoice.total_amount)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500 dark:text-zinc-400">Khách đưa</span>
                                                <span className="text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(order.invoice.amount_received)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-500 dark:text-zinc-400">Tiền thừa</span>
                                                <span className="text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(order.invoice.change_amount)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                                <span className="text-zinc-500 dark:text-zinc-400">Thời gian</span>
                                                <span className="text-zinc-600 dark:text-zinc-300 tabular-nums">{formatDateTime(order.invoice.issued_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* History Timeline */
                            <div className="space-y-0">
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
                                            {safeActivities.map((activity) => {
                                                const config = ACTION_CONFIG[activity.action] ?? {
                                                    label: activity.action,
                                                    icon: Clock,
                                                    color: 'text-zinc-400',
                                                };
                                                const Icon = config.icon;

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
                                                                    {config.label}
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
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
