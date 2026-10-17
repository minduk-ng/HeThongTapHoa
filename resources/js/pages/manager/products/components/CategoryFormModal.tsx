import { router } from '@inertiajs/react';
import { X } from 'lucide-react';
import React, { useState } from 'react';

interface CategoryFormModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CategoryFormModal({
    isOpen,
    onClose,
}: CategoryFormModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [errors, setErrors] = useState<{ name?: string }>({});
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setErrors({ name: 'Tên danh mục không được để trống' });

            return;
        }

        setSubmitting(true);
        router.post(
            '/manager/categories',
            { name, description },
            {
                onSuccess: () => {
                    setName('');
                    setDescription('');
                    setSubmitting(false);
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs as any);
                    setSubmitting(false);
                },
            },
        );
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-800/80 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                    <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        Thêm danh mục mới
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                        aria-label="Đóng"
                    >
                        <X className="h-4 w-4 stroke-[1.5]" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Tên danh mục <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ví dụ: Mì cay, Đồ uống, Trà sữa..."
                            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            required
                        />
                        {errors.name && (
                            <p className="mt-1 text-xs text-red-500">
                                {errors.name}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            Mô tả danh mục
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Mô tả chi tiết về nhóm sản phẩm này..."
                            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50"
                        >
                            {submitting ? 'Đang lưu...' : 'Lưu danh mục'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
