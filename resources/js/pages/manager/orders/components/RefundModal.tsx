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

export default function RefundModal({ isOpen, invoiceId, lines, onClose }: RefundModalProps) {
    const [qtys, setQtys] = useState<Record<number, number>>({});
    const [reason, setReason] = useState<string>(REFUND_REASONS[0]);
    const [note, setNote] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) {
        return null;
    }

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    const maxQty = (line: RefundLine) => line.quantity - line.refunded_qty;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        router.post(
            '/staff/pos/refund',
            {
                invoice_id: invoiceId,
                items: lines
                    .filter((l) => (qtys[l.id] ?? 0) > 0)
                    .map((l) => ({ invoice_line_id: l.id, qty: qtys[l.id] })),
                reason,
                note: note.trim() || null,
            },
            {
                onSuccess: () => {
                    onClose();
                },
                onFinish: () => {
                    setSubmitting(false);
                },
                onError: () => {
                    setSubmitting(false);
                },
            },
        );
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                    <div className="flex items-center space-x-2 text-rose-600 dark:text-rose-400">
                        <RotateCcw className="w-5 h-5 stroke-[1.5]" />
                        <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            Hoàn trả món
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                        <X className="w-4 h-4 stroke-[1.5]" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-800/80">
                                <tr className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                    <th className="px-3 py-2 text-left">Món</th>
                                    <th className="px-3 py-2 text-center">Đã mua</th>
                                    <th className="px-3 py-2 text-center">Đã hoàn</th>
                                    <th className="px-3 py-2 text-center">Hoàn ngay</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                {lines.map((line) => {
                                    const max = maxQty(line);

                                    return (
                                        <tr key={line.id} className={max <= 0 ? 'opacity-50' : ''}>
                                            <td className="px-3 py-2">
                                                <p className="font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
                                                    {line.name}
                                                </p>
                                                <p className="text-[11px] text-zinc-400 tabular-nums">
                                                    {formatCurrency(line.unit_price)}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2 text-center tabular-nums text-zinc-600 dark:text-zinc-400">
                                                {line.quantity}
                                            </td>
                                            <td className="px-3 py-2 text-center tabular-nums text-zinc-600 dark:text-zinc-400">
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
                                                                Math.max(0, parseInt(e.target.value, 10) || 0),
                                                            ),
                                                        }))
                                                    }
                                                    className="w-20 ml-auto block px-2 py-1.5 text-center text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                            Lý do hoàn <span className="text-rose-500">*</span>
                        </label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                        >
                            {REFUND_REASONS.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                            Ghi chú bổ sung (không bắt buộc)
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Nhập chi tiết lý do..."
                            className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                        />
                    </div>

                    <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end space-x-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs disabled:opacity-50"
                        >
                            {submitting ? 'Đang xử lý...' : 'Xác nhận hoàn trả'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
