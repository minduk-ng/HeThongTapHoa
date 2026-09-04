import { router } from '@inertiajs/react';
import { X } from 'lucide-react';
import React, { useState } from 'react';
import type { SupplierData } from '../SuppliersManager';

interface SupplierPaymentsModalProps {
    supplier: SupplierData | null;
    onClose: () => void;
}

const formatMoney = (value: number) =>
    new Intl.NumberFormat('vi-VN').format(value) + ' ₫';

export default function SupplierPaymentsModal({
    supplier,
    onClose,
}: SupplierPaymentsModalProps) {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    React.useEffect(() => {
        queueMicrotask(() => {
            setSelectedIds(supplier?.unpaid_vouchers.map((v) => v.id) ?? []);
            setAmount(supplier ? String(supplier.debt) : '');
            setNote('');
            setErrors({});
        });
    }, [supplier]);

    if (!supplier) {
        return null;
    }

    const toggleVoucher = (id: number) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const selectedTotal = supplier.unpaid_vouchers
        .filter((v) => selectedIds.includes(v.id))
        .reduce((sum, v) => sum + v.total, 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
return;
}

        setSubmitting(true);

        const timer = setTimeout(() => {
            setSubmitting(false);
        }, 8000);

        router.post(
            `/manager/suppliers/${supplier.id}/payments`,
            {
                amount,
                note: note.trim() || null,
                voucher_ids: selectedIds,
            },
            {
                onSuccess: () => {
                    clearTimeout(timer);
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    clearTimeout(timer);
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            },
        );
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs"
                onClick={onClose}
            />

            <div className="relative z-101 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-200/80 bg-zinc-50/50 px-6 py-4 dark:border-zinc-800/80 dark:bg-zinc-800/50">
                    <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                        Thanh toán công nợ — {supplier.name}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                        <X className="h-5 w-5 stroke-[1.5]" />
                    </button>
                </div>

                <form
                    id="payment-form"
                    onSubmit={handleSubmit}
                    className="flex-1 space-y-4 overflow-y-auto p-6 text-xs"
                >
                    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                        <div className="flex items-center justify-between">
                            <span className="text-zinc-500 dark:text-zinc-400">
                                Tổng công nợ chưa trả
                            </span>
                            <span className="font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                                {formatMoney(supplier.debt)}
                            </span>
                        </div>
                    </div>

                    {supplier.unpaid_vouchers.length > 0 && (
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                Phiếu nhập được thanh toán
                            </label>
                            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-700">
                                {supplier.unpaid_vouchers.map((v) => (
                                    <label
                                        key={v.id}
                                        className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                                    >
                                        <span className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(
                                                    v.id,
                                                )}
                                                onChange={() =>
                                                    toggleVoucher(v.id)
                                                }
                                                className="h-3.5 w-3.5 accent-sky-600"
                                            />
                                            <span className="font-medium">
                                                {v.voucher_code}
                                            </span>
                                            <span className="text-zinc-400">
                                                {v.transacted_at}
                                            </span>
                                        </span>
                                        <span className="tabular-nums">
                                            {formatMoney(v.total)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Số tiền thanh toán{' '}
                            <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="1000"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="Nhập số tiền..."
                            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            required
                        />
                        <p className="mt-1 text-[11px] text-zinc-400">
                            Tổng phiếu được chọn: {formatMoney(selectedTotal)}
                        </p>
                        {errors.amount && (
                            <p className="mt-1 text-xs text-rose-500">
                                {errors.amount}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Ghi chú
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Tra trước, chuyển khoản..."
                            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                        {errors.note && (
                            <p className="mt-1 text-xs text-rose-500">
                                {errors.note}
                            </p>
                        )}
                    </div>
                </form>

                <div className="flex justify-end space-x-3 border-t border-zinc-200/80 bg-zinc-50 p-4 dark:border-zinc-800/80 dark:bg-zinc-800/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-2xs transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        form="payment-form"
                        disabled={
                            submitting ||
                            selectedIds.length === 0 ||
                            !amount ||
                            Number(amount) <= 0
                        }
                        className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
                    >
                        {submitting
                            ? 'Đang ghi nhận...'
                            : 'Ghi nhận thanh toán'}
                    </button>
                </div>
            </div>
        </div>
    );
}
