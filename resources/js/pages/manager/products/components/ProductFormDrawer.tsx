import { router } from '@inertiajs/react';
import { X, Plus, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { compressAndResizeImage } from '../../../../utils/imageCompressor';
import type { MenuItemData } from './ProductTable';

interface Category {
    id: number;
    name: string;
}

interface ProductFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    productToEdit?: MenuItemData | null;
    categories: Category[];
    onOpenAddCategoryModal: () => void;
}

export default function ProductFormDrawer({
    isOpen,
    onClose,
    productToEdit,
    categories,
    onOpenAddCategoryModal,
}: ProductFormDrawerProps) {
    const [name, setName] = useState('');
    const [categoryId, setCategoryId] = useState<number | string>('');
    const [price, setPrice] = useState<string>('');
    const [vatRate, setVatRate] = useState<string>('0');
    const [description, setDescription] = useState('');
    const [isAvailable, setIsAvailable] = useState<boolean>(true);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const blobUrlRef = useRef<string | null>(null);

    // Clean up created blob URL to prevent memory leaks
    const setSafeImagePreview = (newUrl: string | null) => {
        if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }

        if (newUrl && newUrl.startsWith('blob:')) {
            blobUrlRef.current = newUrl;
        }

        setImagePreview(newUrl);
    };

    useEffect(() => {
        queueMicrotask(() => {
            if (productToEdit) {
                setName(productToEdit.name || '');
                setCategoryId(productToEdit.category_id || (categories[0]?.id ?? ''));
                setPrice(productToEdit.price ? String(productToEdit.price) : '');
                setVatRate(productToEdit.vat_rate ? String(productToEdit.vat_rate) : '0');
                setDescription(productToEdit.description || '');
                setIsAvailable(productToEdit.is_available ?? true);
                setSafeImagePreview(productToEdit.image || null);
                setImageFile(null);
            } else {
                setName('');
                setCategoryId(categories[0]?.id || '');
                setPrice('');
                setVatRate('0');
                setDescription('');
                setIsAvailable(true);
                setSafeImagePreview(null);
                setImageFile(null);
            }

            setErrors({});
        });

        return () => {
            if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [productToEdit, isOpen, categories]);

    const [isCompressingImage, setIsCompressingImage] = useState(false);
    const [showCompressingSpinner, setShowCompressingSpinner] = useState(false);
    const [showSubmittingSpinner, setShowSubmittingSpinner] = useState(false);

    useEffect(() => {
        if (!isCompressingImage) {
            return;
        }

        const timer = setTimeout(() => {
            setShowCompressingSpinner(true);
        }, 300);

        return () => {
            clearTimeout(timer);
            setShowCompressingSpinner(false);
        };
    }, [isCompressingImage]);

    useEffect(() => {
        if (!submitting) {
            return;
        }

        const timer = setTimeout(() => {
            setShowSubmittingSpinner(true);
        }, 300);

        return () => {
            clearTimeout(timer);
            setShowSubmittingSpinner(false);
        };
    }, [submitting]);

    // Handle Ctrl+V Paste Image from Clipboard
    useEffect(() => {
        if (!isOpen) {
return;
}

        const handlePaste = async (e: ClipboardEvent) => {
            if (!e.clipboardData || !e.clipboardData.files) {
return;
}

            const files = Array.from(e.clipboardData.files);
            const imageItem = files.find((f) => f.type.startsWith('image/'));

            if (imageItem) {
                e.preventDefault();
                setIsCompressingImage(true);

                try {
                    const compressed = await compressAndResizeImage(imageItem, 600, 0.85);
                    setImageFile(compressed);
                    const newBlobUrl = URL.createObjectURL(compressed);
                    setSafeImagePreview(newBlobUrl);
                } finally {
                    setIsCompressingImage(false);
                }
            }
        };

        window.addEventListener('paste', handlePaste);

        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [isOpen]);

    if (!isOpen) {
return null;
}

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const rawFile = e.target.files[0];
            setIsCompressingImage(true);

            try {
                const compressed = await compressAndResizeImage(rawFile, 600, 0.85);
                setImageFile(compressed);
                const newBlobUrl = URL.createObjectURL(compressed);
                setSafeImagePreview(newBlobUrl);
            } finally {
                setIsCompressingImage(false);
            }
        }
    };

    const handleRemoveImage = () => {
        setImageFile(null);
        setSafeImagePreview(null);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('name', name);
        formData.append('category_id', String(categoryId));
        formData.append('price', price);
        formData.append('vat_rate', vatRate);
        formData.append('description', description);
        formData.append('is_available', isAvailable ? '1' : '0');

        if (imageFile) {
            formData.append('image', imageFile);
        }

        setSubmitting(true);

        if (productToEdit) {
            router.post(`/manager/products/${productToEdit.id}`, formData, {
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
            router.post('/manager/products', formData, {
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
        <div className="fixed inset-0 z-100 overflow-hidden">
            {/* Dimming Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10 z-101">
                <div className="w-full max-w-xl bg-white dark:bg-zinc-900 border-l border-zinc-200/80 dark:border-zinc-800/80 shadow-lg flex flex-col justify-between">
                    {/* Header */}
                    <div className="p-6 border-b border-zinc-200/80 dark:border-zinc-800/80 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                        <h2 className="text-xl font-bold font-display text-zinc-900 dark:text-zinc-100">
                            {productToEdit ? 'Cập nhật hàng hóa' : 'Thêm sản phẩm mới'}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                         aria-label="Đóng">
                            <X className="w-5 h-5 stroke-[1.5]" />
                        </button>
                    </div>

                    {/* Scrollable Form Body */}
                    <form id="product-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Section 1: Thông tin sản phẩm */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                Thông tin chung
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Category Dropdown with Quick Add Button */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                            Danh mục <span className="text-red-500">*</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={onOpenAddCategoryModal}
                                            className="text-xs text-sky-600 dark:text-sky-400 font-medium hover:underline flex items-center space-x-1"
                                        >
                                            <Plus className="w-3.5 h-3.5 stroke-[2]" />
                                            <span>Thêm mới</span>
                                        </button>
                                    </div>
                                    <select
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                                    >
                                        <option value="">— Chọn danh mục —</option>
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.category_id && <p className="text-xs text-red-500 mt-1">{errors.category_id}</p>}
                                </div>

                                {/* Product Code ID info */}
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Mã hàng hóa (ID)
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        value={productToEdit ? `SP${String(productToEdit.id).padStart(5, '0')}` : 'Tự động tạo (SPXXXXX)'}
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 border-zinc-200 dark:border-zinc-700 cursor-not-allowed font-mono"
                                    />
                                </div>
                            </div>

                            {/* Product Name */}
                            <div>
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Tên hàng hóa <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ví dụ: Cà phê sữa đá"
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                                />
                                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                            </div>

                            {/* Image Upload / Clipboard Paste Container */}
                            <div>
                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Ảnh sản phẩm
                                </label>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    {/* Enlarged Image Preview Box (w-36 h-36) */}
                                    <div className="w-36 h-36 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 flex items-center justify-center overflow-hidden relative shrink-0 shadow-xs">
                                        {showCompressingSpinner ? (
                                            <div className="text-center p-2 text-sky-600 dark:text-sky-400">
                                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-1 stroke-[1.5]" />
                                                <span className="text-[10px] font-medium block">Đang nén 600x600 WebP…</span>
                                            </div>
                                        ) : imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center p-3">
                                                <ImageIcon className="w-8 h-8 text-zinc-400 mx-auto stroke-[1.5]" />
                                                <span className="text-xs text-zinc-400 block mt-1">Chưa có ảnh</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 space-y-2">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="block w-full text-xs text-zinc-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 dark:file:bg-zinc-800 dark:file:text-zinc-200 cursor-pointer"
                                        />
                                        {imagePreview && (
                                            <button
                                                type="button"
                                                onClick={handleRemoveImage}
                                                className="text-xs text-rose-600 dark:text-rose-400 font-medium hover:underline flex items-center space-x-1"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 stroke-[1.5]" />
                                                <span>Xóa ảnh</span>
                                            </button>
                                        )}
                                        <p className="text-[11px] text-zinc-400">
                                            Mẹo: Bạn có thể sao chép ảnh từ web/máy tính và nhấn <strong className="text-sky-600 dark:text-sky-400">Ctrl + V</strong> để dán ảnh.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Active Switch Toggle */}
                            <div className="pt-2">
                                <label className="flex items-center space-x-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isAvailable}
                                        onChange={(e) => setIsAvailable(e.target.checked)}
                                        className="checkbox-field"
                                    />
                                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                        Sản phẩm có bán (hiển thị trên menu)
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Section 2: Định giá */}
                        <div className="space-y-4 pt-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                Định giá & Thuế
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Giá bán (VNĐ) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="50000"
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 tabular-nums font-semibold"
                                    />
                                    {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Thuế VAT (%)
                                    </label>
                                    <input
                                        type="number"
                                        value={vatRate}
                                        onChange={(e) => setVatRate(e.target.value)}
                                        placeholder="8"
                                        className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500 tabular-nums font-semibold"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Ghi chú */}
                        <div className="space-y-4 pt-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                Ghi chú thêm
                            </h3>

                            <div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    placeholder="Nhập ghi chú cho món ăn..."
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                                />
                            </div>
                        </div>
                    </form>

                    {/* Footer Action Buttons */}
                    <div className="p-4 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-800/50 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-xl shadow-2xs transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            form="product-form"
                            disabled={submitting}
                            className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-xl shadow-xs disabled:opacity-50 transition-colors"
                        >
                            {showSubmittingSpinner ? 'Đang lưu…' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
