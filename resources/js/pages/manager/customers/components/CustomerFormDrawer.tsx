import { router } from '@inertiajs/react';
import { X } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import type { CustomerData } from '../CustomersManager';

interface CustomerFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    customerToEdit?: CustomerData | null;
}

export default function CustomerFormDrawer({
    isOpen,
    onClose,
    customerToEdit,
}: CustomerFormDrawerProps) {
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [note, setNote] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            if (customerToEdit) {
                setFullName(customerToEdit.full_name || '');
                setPhone(customerToEdit.phone || '');
                setNote(customerToEdit.note || '');
            } else {
                setFullName('');
                setPhone('');
                setNote('');
            }

            setErrors({});
        });
    }, [customerToEdit, isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const payload = {
            full_name: fullName,
            phone,
            note,
        };

        const url = customerToEdit
            ? `/manager/customers/${customerToEdit.id}`
            : '/manager/customers';

        router.post(url, payload, {
            onSuccess: () => {
                setSubmitting(false);
                onClose();
            },
            onError: (errs) => {
                setErrors(errs as any);
                setSubmitting(false);
            },
        });
    };

    return (
        <div className="fixed inset-0 z-100 overflow-hidden">
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            <div className="absolute inset-y-0 right-0 z-101 flex max-w-full pl-10">
                <div className="flex w-screen max-w-md flex-col justify-between border-l border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900">
                    <div className="flex items-center justify-between border-b border-zinc-200/80 bg-zinc-50/50 p-6 dark:border-zinc-800/80 dark:bg-zinc-800/50">
                        <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {customerToEdit
                                ? 'Cập nhật khách hàng'
                                : 'Thêm khách hàng mới'}
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
                        id="customer-form"
                        onSubmit={handleSubmit}
                        className="flex-1 space-y-4 overflow-y-auto p-6 text-xs"
                    >
                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                Tên khách hàng{' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Ví dụ: Nguyễn Văn A"
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            />
                            {errors.full_name && (
                                <p className="mt-1 text-xs text-red-500">
                                    {errors.full_name}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                Số điện thoại{' '}
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="Ví dụ: 0901234567"
                                maxLength={15}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                required
                            />
                            {errors.phone && (
                                <p className="mt-1 text-xs text-red-500">
                                    {errors.phone}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                Ghi chú
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                                placeholder="Ghi chú về khách hàng..."
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            />
                            {errors.note && (
                                <p className="mt-1 text-xs text-red-500">
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
                            form="customer-form"
                            disabled={submitting}
                            className="rounded-xl bg-sky-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50"
                        >
                            {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
