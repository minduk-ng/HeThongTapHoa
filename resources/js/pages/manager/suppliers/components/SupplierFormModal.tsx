import { router } from '@inertiajs/react';
import { Building2, MapPin } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import {
    ManagerFormModal,
    FormSection,
    FormField,
} from '@/components/form';
import type { SupplierData } from '../SuppliersManager';

interface SupplierFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplierToEdit?: SupplierData | null;
}

export default function SupplierFormModal({
    isOpen,
    onClose,
    supplierToEdit,
}: SupplierFormModalProps) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [note, setNote] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            if (supplierToEdit) {
                setName(supplierToEdit.name || '');
                setPhone(supplierToEdit.phone || '');
                setAddress(supplierToEdit.address || '');
                setNote(supplierToEdit.note || '');
            } else {
                setName('');
                setPhone('');
                setAddress('');
                setNote('');
            }

            setErrors({});
        });
    }, [supplierToEdit, isOpen]);

    const isDirty = useMemo(() => {
        if (supplierToEdit) {
            return (
                name !== (supplierToEdit.name || '')
                || phone !== (supplierToEdit.phone || '')
                || address !== (supplierToEdit.address || '')
                || note !== (supplierToEdit.note || '')
            );
        }

        return (
            name.trim() !== ''
            || phone.trim() !== ''
            || address.trim() !== ''
            || note.trim() !== ''
        );
    }, [supplierToEdit, name, phone, address, note]);

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
            name: name.trim(),
            phone: phone.trim() || null,
            address: address.trim() || null,
            note: note.trim() || null,
        };

        const url = supplierToEdit
            ? `/manager/suppliers/${supplierToEdit.id}`
            : '/manager/suppliers';

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
                supplierToEdit
                    ? 'Cập nhật nhà cung cấp'
                    : 'Thêm nhà cung cấp mới'
            }
            subtitle="Đối tác cung cấp nguyên liệu hàng hóa và quản lý công nợ"
            isEditing={!!supplierToEdit}
            isDirty={isDirty}
            submitting={submitting}
            size="lg"
            formId="supplier-form"
        >
            {/* Section 1: Doanh nghiệp & Liên hệ */}
            <FormSection
                title="Doanh nghiệp & Liên hệ"
                description="Tên đơn vị cung cấp và số điện thoại liên lạc"
                icon={Building2}
                gridCols={2}
            >
                <FormField
                    label="Tên nhà cung cấp"
                    required
                    error={errors.name}
                >
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ví dụ: Công ty TNHH Thực phẩm Sạch"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        required
                    />
                </FormField>

                <FormField
                    label="Số điện thoại"
                    error={errors.phone}
                >
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="028 1234 5678"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold tabular-nums text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>

            {/* Section 2: Địa chỉ & Ghi chú */}
            <FormSection
                title="Địa chỉ & Ghi chú"
                description="Địa điểm giao hàng và điều khoản lưu ý"
                icon={MapPin}
                gridCols={1}
            >
                <FormField label="Địa chỉ kho / Trụ sở" error={errors.address}>
                    <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Số nhà, tên đường, quận/huyện, tỉnh/thành phố…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>

                <FormField label="Ghi chú" error={errors.note}>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="Thông tin thêm về sản phẩm cung cấp, thời hạn giao hàng, chiết khấu…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>
        </ManagerFormModal>
    );
}
