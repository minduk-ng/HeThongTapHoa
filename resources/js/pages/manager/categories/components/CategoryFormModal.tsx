import { router } from '@inertiajs/react';
import { FileText, FolderTree } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { ManagerFormModal, FormSection, FormField } from '@/components/form';
import type { CategoryData } from './CategoryTable';

interface CategoryFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryToEdit?: CategoryData | null;
}

export default function CategoryFormModal({
    isOpen,
    onClose,
    categoryToEdit,
}: CategoryFormModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [sortOrder, setSortOrder] = useState<string>('0');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            if (categoryToEdit) {
                setName(categoryToEdit.name || '');
                setDescription(categoryToEdit.description || '');
                setSortOrder(
                    categoryToEdit.display_order
                        ? String(categoryToEdit.display_order)
                        : categoryToEdit.sort_order
                          ? String(categoryToEdit.sort_order)
                          : '0',
                );
            } else {
                setName('');
                setDescription('');
                setSortOrder('0');
            }

            setErrors({});
        });
    }, [categoryToEdit, isOpen]);

    const isDirty = useMemo(() => {
        if (categoryToEdit) {
            const origOrder = categoryToEdit.display_order
                ? String(categoryToEdit.display_order)
                : categoryToEdit.sort_order
                  ? String(categoryToEdit.sort_order)
                  : '0';

            return (
                name !== (categoryToEdit.name || '') ||
                description !== (categoryToEdit.description || '') ||
                sortOrder !== origOrder
            );
        }

        return (
            name.trim() !== '' ||
            description.trim() !== '' ||
            (sortOrder !== '0' && sortOrder.trim() !== '')
        );
    }, [categoryToEdit, name, description, sortOrder]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
            return;
        }

        setSubmitting(true);

        const payload = {
            name,
            description,
            sort_order: sortOrder ? Number(sortOrder) : 0,
        };

        if (categoryToEdit) {
            router.post(`/manager/categories/${categoryToEdit.id}`, payload, {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            });
        } else {
            router.post('/manager/categories', payload, {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            });
        }
    };

    return (
        <ManagerFormModal
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={handleSubmit}
            title={categoryToEdit ? 'Cập nhật danh mục' : 'Thêm danh mục mới'}
            subtitle="Phân nhóm thực đơn và quản lý thứ tự hiển thị tại quầy POS"
            isEditing={!!categoryToEdit}
            isDirty={isDirty}
            submitting={submitting}
            size="md"
            formId="category-form"
        >
            {/* Section 1: Thông tin danh mục */}
            <FormSection
                title="Thông tin danh mục"
                description="Tên và vị trí hiển thị"
                icon={FolderTree}
                gridCols={2}
            >
                <FormField label="Tên danh mục" required error={errors.name}>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ví dụ: Mì cay, Đồ uống, Trà sữa…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        required
                    />
                </FormField>

                <FormField
                    label="Thứ tự sắp xếp"
                    hint="Số nhỏ hơn sẽ hiển thị trước trên thực đơn"
                    error={errors.sort_order}
                >
                    <input
                        type="number"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        placeholder="0"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-900 tabular-nums focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>

            {/* Section 2: Mô tả bổ sung */}
            <FormSection
                title="Mô tả bổ sung"
                description="Thông tin chi tiết về nhóm món này"
                icon={FileText}
                gridCols={1}
            >
                <FormField label="Mô tả danh mục" error={errors.description}>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="Mô tả chi tiết nhóm sản phẩm này…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>
        </ManagerFormModal>
    );
}
