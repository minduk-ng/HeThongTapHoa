import React, { useState, useEffect, useRef } from 'react';
import { router } from '@inertiajs/react';
import { MenuItemData } from './ProductTable';

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

        return () => {
            if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [productToEdit, isOpen, categories]);

    // Handle Ctrl+V Paste Image from Clipboard
    useEffect(() => {
        if (!isOpen) return;

        const handlePaste = (e: ClipboardEvent) => {
            if (!e.clipboardData || !e.clipboardData.files) return;

            const files = Array.from(e.clipboardData.files);
            const imageItem = files.find((f) => f.type.startsWith('image/'));

            if (imageItem) {
                e.preventDefault();
                setImageFile(imageItem);
                const newBlobUrl = URL.createObjectURL(imageItem);
                setSafeImagePreview(newBlobUrl);
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const newBlobUrl = URL.createObjectURL(file);
            setSafeImagePreview(newBlobUrl);
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
        <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Dimming Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
                <div className="w-screen max-w-xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between">
                    {/* Header */}
                    <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                            {productToEdit ? 'Cập nhật hàng hóa' : 'Thêm sản phẩm mới'}
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
                    <form id="product-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Section 1: Thông tin sản phẩm */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                Thông tin chung
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Category Dropdown with Quick Add Button */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                            Danh mục <span className="text-red-500">*</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={onOpenAddCategoryModal}
                                            className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center space-x-1"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                            <span>Thêm mới</span>
                                        </button>
                                    </div>
                                    <select
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">-- Chọn danh mục --</option>
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
                                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Mã hàng hóa (ID)
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        value={productToEdit ? `SP${String(productToEdit.id).padStart(5, '0')}` : 'Tự động tạo (SPXXXXX)'}
                                        className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 border-zinc-300 dark:border-zinc-700 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            {/* Product Name */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Tên hàng hóa <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ví dụ: Mỳ cay hải sản vi cá chép"
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                            </div>

                            {/* Image Upload / Clipboard Paste Container */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                    Ảnh sản phẩm (Hỗ trợ <kbd className="px-1.5 py-0.5 text-[10px] bg-zinc-100 dark:bg-zinc-800 border rounded">Ctrl+V</kbd> dán trực tiếp từ bộ nhớ tạm)
                                </label>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    {/* Enlarged Image Preview Box (w-36 h-36) */}
                                    <div className="w-36 h-36 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 flex items-center justify-center overflow-hidden relative shrink-0 shadow-xs">
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center p-3">
                                                <svg className="w-8 h-8 text-zinc-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
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
                                            className="block w-full text-xs text-zinc-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-zinc-800 dark:file:text-zinc-200 cursor-pointer"
                                        />
                                        {imagePreview && (
                                            <button
                                                type="button"
                                                onClick={handleRemoveImage}
                                                className="text-xs text-rose-600 dark:text-rose-400 font-medium hover:underline flex items-center space-x-1"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                <span>Xóa ảnh</span>
                                            </button>
                                        )}
                                        <p className="text-[11px] text-zinc-400">
                                            Tip: Bạn có thể sao chép ảnh từ web/máy tính và nhấn <strong className="text-blue-600 dark:text-blue-400">Ctrl + V</strong> để dán ảnh tức thì. Tự động giải phóng bộ nhớ đệm khi đổi ảnh.
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
                                        className="w-4 h-4 text-blue-600 rounded border-zinc-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                        Sản phẩm có bán (hiển thị trên menu)
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Section 2: Định giá */}
                        <div className="space-y-4 pt-2">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                Định giá & Thuế
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Giá bán (VNĐ) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="50000"
                                        className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                    />
                                    {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                        Thuế VAT (%)
                                    </label>
                                    <input
                                        type="number"
                                        value={vatRate}
                                        onChange={(e) => setVatRate(e.target.value)}
                                        placeholder="8"
                                        className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Ghi chú */}
                        <div className="space-y-4 pt-2">
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                Ghi chú thêm
                            </h3>

                            <div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    placeholder="Nhập ghi chú cho món ăn..."
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
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
                            form="product-form"
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
