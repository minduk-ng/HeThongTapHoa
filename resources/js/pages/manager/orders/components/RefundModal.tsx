import { router } from '@inertiajs/react';
import { RotateCcw, X } from 'lucide-react';
import React, { useState } from 'react';

export interface RefundLine {
    id: number;
    name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    discount_amount: number;
    refunded_qty: number;
}

interface RefundModalProps {
    isOpen: boolean;
    invoiceId: number;
    lines: RefundLine[];
    onClose: () => void;
}

const REFUND_REASONS = ['Hàng lỗi', 'Khách hủy', 'Giao nhầm', 'Khác'];

function getCsrfTokenFromCookie(): string {
    if (typeof document === 'undefined') {
        return '';
    }

    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : '';
}

export default function RefundModal({
    isOpen,
    invoiceId,
    lines,
    onClose,
}: RefundModalProps) {
    const [qtys, setQtys] = useState<Record<number, number>>({});
    const [reason, setReason] = useState<string>(REFUND_REASONS[0]);
    const [note, setNote] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) {
        return null;
    }

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
        }).format(val);

    const maxQty = (line: RefundLine) => line.quantity - line.refunded_qty;

    const selectedItems = lines
        .filter((l) => (qtys[l.id] ?? 0) > 0)
        .map((l) => ({ invoice_line_id: l.id, qty: qtys[l.id] }));
    const totalRefundQty = selectedItems.reduce(
        (acc, item) => acc + item.qty,
        0,
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
            return;
        }

        if (selectedItems.length === 0) {
            setError('Vui lòng chọn số lượng cần hoàn cho ít nhất một món.');

            return;
        }

        setSubmitting(true);
        setError(null);

        const timer = setTimeout(() => {
            setSubmitting(false);
        }, 8000);

        try {
            const response = await fetch('/staff/pos/refund', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getCsrfTokenFromCookie(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    invoice_id: invoiceId,
                    items: selectedItems,
                    reason,
                    note: note.trim() || null,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.success) {
                clearTimeout(timer);
                onClose();
                router.reload({ only: ['order'], onError: () => {} });
            } else {
                clearTimeout(timer);
                setError(
                    data.error ||
                        data.message ||
                        'Hoàn trả thất bại. Vui lòng thử lại.',
                );
            }
        } catch {
            clearTimeout(timer);
            setError('Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs duration-150">
            <div className="animate-in zoom-in-95 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg duration-150 dark:border-zinc-800 dark:bg-zinc-900">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400">
                        <RotateCcw className="h-5 w-5 stroke-[1.5]" />
                        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            Hoàn trả món
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                        aria-label="Đóng"
                    >
                        <X className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                    {error && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-400">
                            {error}
                        </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full border-collapse text-left text-sm">
                            <thead className="border-b border-zinc-200/80 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/80">
                                <tr className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                                    <th className="border-r border-zinc-200/60 px-3 py-2 text-left dark:border-zinc-800/60">
                                        Món
                                    </th>
                                    <th className="border-r border-zinc-200/60 px-3 py-2 text-center dark:border-zinc-800/60">
                                        Đã mua
                                    </th>
                                    <th className="border-r border-zinc-200/60 px-3 py-2 text-center dark:border-zinc-800/60">
                                        Đã hoàn
                                    </th>
                                    <th className="px-3 py-2 text-center">
                                        Hoàn ngay
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                {lines.map((line) => {
                                    const max = maxQty(line);

                                    return (
                                        <tr
                                            key={line.id}
                                            className={`transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 ${max <= 0 ? 'opacity-50' : ''}`}
                                        >
                                            <td className="border-r border-zinc-100/80 px-3 py-2 dark:border-zinc-800/40">
                                                <p className="leading-tight font-medium text-zinc-900 dark:text-zinc-100">
                                                    {line.name}
                                                </p>
                                                <p className="text-[11px] text-zinc-400 tabular-nums">
                                                    {formatCurrency(
                                                        line.unit_price,
                                                    )}
                                                </p>
                                            </td>
                                            <td className="border-r border-zinc-100/80 px-3 py-2 text-center text-zinc-600 tabular-nums dark:border-zinc-800/40 dark:text-zinc-400">
                                                {line.quantity}
                                            </td>
                                            <td className="border-r border-zinc-100/80 px-3 py-2 text-center text-zinc-600 tabular-nums dark:border-zinc-800/40 dark:text-zinc-400">
                                                {line.refunded_qty}
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={max}
                                                    disabled={max <= 0}
                                                    value={qtys[line.id] ?? 0}
                                                    onChange={(e) =>
                                                        setQtys((prev) => ({
                                                            ...prev,
                                                            [line.id]: Math.min(
                                                                max,
                                                                Math.max(
                                                                    0,
                                                                    parseInt(
                                                                        e.target
                                                                            .value,
                                                                        10,
                                                                    ) || 0,
                                                                ),
                                                            ),
                                                        }))
                                                    }
                                                    className="mx-auto block w-20 rounded-xl border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-center text-xs text-zinc-900 tabular-nums focus:ring-2 focus:ring-rose-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div>
                        <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Lý do hoàn <span className="text-rose-500">*</span>
                        </label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-rose-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                            {REFUND_REASONS.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Ghi chú bổ sung (không bắt buộc)
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Nhập chi tiết lý do..."
                            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-rose-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                    </div>

                    <div className="flex justify-end space-x-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || totalRefundQty === 0}
                            className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-rose-700 active:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {submitting
                                ? 'Đang xử lý...'
                                : `Xác nhận hoàn trả${totalRefundQty > 0 ? ` (${totalRefundQty} món)` : ''}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
