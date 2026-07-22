import React, { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { CategoryData } from './CategoryTable';

interface CategoryFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    categoryToEdit?: CategoryData | null;
}

export default function CategoryFormDrawer({
    isOpen,
    onClose,
    categoryToEdit,
}: CategoryFormDrawerProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [sortOrder, setSortOrder] = useState<string>('0');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (categoryToEdit) {
            setName(categoryToEdit.name || '');
            setDescription(categoryToEdit.description || '');
            setSortOrder(categoryToEdit.sort_order ? String(categoryToEdit.sort_order) : '0');
        } else {
            setName('');
            setDescription('');
            setSortOrder('0');
        }
        setErrors({});
    }, [categoryToEdit, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
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
        <div className="fixed inset-0 z-[100] overflow-hidden">
            {/* Dimming Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10 z-[101]">
                <div className="w-screen max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between">
                    {/* Header */}
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                            {categoryToEdit ? 'Cập nhật danh mục' : 'Thêm danh mục mới'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Scrollable Form Body */}
                    <form id="category-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                        {/* Name Input */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Tên danh mục <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ví dụ: Mì cay, Đồ uống, Trà sữa..."
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                        </div>

                        {/* Sort Order Input */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Thứ tự sắp xếp (Sort order)
                            </label>
                            <input
                                type="number"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                placeholder="0"
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-[11px] text-zinc-400 mt-1">
                                Số nhỏ hơn sẽ hiển thị trước trên thực đơn.
                            </p>
                        </div>

                        {/* Description Textarea */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Mô tả danh mục
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                placeholder="Mô tả chi tiết nhóm sản phẩm này..."
                                className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </form>

                    {/* Footer Action Buttons */}
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-lg shadow-xs"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            form="category-form"
                            disabled={submitting}
                            className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
                        >
                            {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
