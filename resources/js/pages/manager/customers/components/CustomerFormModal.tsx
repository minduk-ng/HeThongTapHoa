import { router } from '@inertiajs/react';
import { FileText, User } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import {
    ManagerFormModal,
    FormSection,
    FormField,
} from '@/components/form';
import type { CustomerData } from '../CustomersManager';

interface CustomerFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    customerToEdit?: CustomerData | null;
}

export default function CustomerFormModal({
    isOpen,
    onClose,
    customerToEdit,
}: CustomerFormModalProps) {
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

    const isDirty = useMemo(() => {
        if (customerToEdit) {
            return (
                fullName !== (customerToEdit.full_name || '')
                || phone !== (customerToEdit.phone || '')
                || note !== (customerToEdit.note || '')
            );
        }

        return (
            fullName.trim() !== ''
            || phone.trim() !== ''
            || note.trim() !== ''
        );
    }, [customerToEdit, fullName, phone, note]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
return;
}

        setSubmitting(true);
        const timer = setTimeout(() => {
            setSubmitting(false);
        }, 8000);

        const payload = {
            full_name: fullName.trim(),
            phone: phone.trim(),
            note: note.trim() || null,
        };

        const url = customerToEdit
            ? `/manager/customers/${customerToEdit.id}`
            : '/manager/customers';

        router.post(url, payload, {
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
        });
    };

    return (
        <ManagerFormModal
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={handleSubmit}
            title={
                customerToEdit
                    ? 'Cập nhật khách hàng'
                    : 'Thêm khách hàng mới'
            }
            subtitle="Thông tin khách hàng phục vụ tích điểm, lịch sử mua hàng và chăm sóc"
            isEditing={!!customerToEdit}
            isDirty={isDirty}
            submitting={submitting}
            size="md"
            formId="customer-form"
        >
            {/* Section 1: Thông tin khách hàng */}
            <FormSection
                title="Thông tin liên hệ"
                description="Họ tên và số điện thoại định danh"
                icon={User}
                gridCols={2}
            >
                <FormField
                    label="Họ và tên"
                    required
                    error={errors.full_name}
                >
                    <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ví dụ: Nguyễn Văn A"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        required
                    />
                </FormField>

                <FormField
                    label="Số điện thoại"
                    required
                    error={errors.phone}
                >
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0912 345 678"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold tabular-nums text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        required
                    />
                </FormField>
            </FormSection>

            {/* Section 2: Ghi chú & Sở thích */}
            <FormSection
                title="Ghi chú khách hàng"
                description="Sở thích hoặc lưu ý khi phục vụ"
                icon={FileText}
                gridCols={1}
            >
                <FormField label="Ghi chú" error={errors.note}>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="Ví dụ: Khách quen uống cà phê ít đường, dị ứng hải sản…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>
        </ManagerFormModal>
    );
}
