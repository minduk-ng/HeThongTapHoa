import { router } from '@inertiajs/react';
import {
    Coffee,
    Image as ImageIcon,
    Loader2,
    Plus,
    Receipt,
    Trash2,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    ManagerFormModal,
    FormSection,
    FormField,
} from '@/components/form';
import { compressAndResizeImage } from '../../../../utils/imageCompressor';
import type { MenuItemData } from './ProductTable';

interface Category {
    id: number;
    name: string;
}

interface ProductFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    productToEdit?: MenuItemData | null;
    categories: Category[];
    onOpenAddCategoryModal: () => void;
}

export default function ProductFormModal({
    isOpen,
    onClose,
    productToEdit,
    categories,
    onOpenAddCategoryModal,
}: ProductFormModalProps) {
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
                setCategoryId(
                    productToEdit.category_id || (categories[0]?.id ?? ''),
                );
                setPrice(
                    productToEdit.price ? String(productToEdit.price) : '',
                );
                setVatRate(
                    productToEdit.vat_rate
                        ? String(productToEdit.vat_rate)
                        : '0',
                );
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

    useEffect(() => {
        if (isCompressingImage) {
            const timer = setTimeout(() => {
                setShowCompressingSpinner(true);
            }, 300);

            return () => {
                clearTimeout(timer);
                setShowCompressingSpinner(false);
            };
        }

        return undefined;
    }, [isCompressingImage]);

    const isDirty = useMemo(() => {
        if (productToEdit) {
            return (
                name !== (productToEdit.name || '')
                || String(categoryId) !== String(productToEdit.category_id || '')
                || price !== String(productToEdit.price || '')
                || vatRate !== String(productToEdit.vat_rate || 0)
                || description !== (productToEdit.description || '')
                || isAvailable !== (productToEdit.is_available ?? true)
                || imageFile !== null
            );
        }

        return (
            name.trim() !== ''
            || price.trim() !== ''
            || description.trim() !== ''
            || imageFile !== null
        );
    }, [
        productToEdit,
        name,
        categoryId,
        price,
        vatRate,
        description,
        isAvailable,
        imageFile,
    ]);

    const handleImageChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];

        if (!file) {
return;
}

        try {
            setIsCompressingImage(true);
            const compressed = await compressAndResizeImage(file);
            setImageFile(compressed);
            setSafeImagePreview(URL.createObjectURL(compressed));
        } catch {
            setErrors((prev) => ({
                ...prev,
                image: 'Không thể nén ảnh, vui lòng thử ảnh khác.',
            }));
        } finally {
            setIsCompressingImage(false);
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

        if (submitting) {
return;
}

        setSubmitting(true);
        const timer = setTimeout(() => {
            setSubmitting(false);
        }, 8000);

        const formData = new FormData();
        formData.append('name', name.trim());
        formData.append('category_id', String(categoryId));
        formData.append('price', price);
        formData.append('vat_rate', vatRate);
        formData.append('description', description.trim());
        formData.append('is_available', isAvailable ? '1' : '0');

        if (imageFile) {
            formData.append('image', imageFile);
        }

        const url = productToEdit
            ? `/manager/products/${productToEdit.id}`
            : '/manager/products';

        router.post(url, formData, {
            forceFormData: true,
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
                productToEdit
                    ? 'Cập nhật món ăn / đồ uống'
                    : 'Thêm món mới vào thực đơn'
            }
            subtitle="Thiết lập tên món, giá niêm yết, thuế VAT và hình ảnh hiển thị trên quầy thu ngân"
            isEditing={!!productToEdit}
            isDirty={isDirty}
            submitting={submitting}
            size="xl"
            formId="product-form"
        >
            {/* Section 1: Thông tin cơ bản */}
            <FormSection
                title="Thông tin cơ bản"
                description="Tên món, danh mục nhóm và trạng thái kinh doanh"
                icon={Coffee}
                gridCols={2}
            >
                <FormField
                    label="Tên món ăn / đồ uống"
                    required
                    error={errors.name}
                >
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ví dụ: Cà phê Muối, Trà sữa Trân châu…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        required
                    />
                </FormField>

                <FormField
                    label="Danh mục thực đơn"
                    required
                    error={errors.category_id}
                >
                    <div className="flex gap-2">
                        <select
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                            required
                        >
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={onOpenAddCategoryModal}
                            className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors shrink-0"
                            title="Thêm danh mục mới"
                        >
                            <Plus className="h-3.5 w-3.5 stroke-2" />
                            <span>Tạo DM</span>
                        </button>
                    </div>
                </FormField>

                <FormField
                    label="Trạng thái kinh doanh"
                    hint="Bật để hiển thị và cho phép gọi món tại quầy POS"
                >
                    <div className="flex items-center gap-3 pt-1">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isAvailable}
                                onChange={(e) => setIsAvailable(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-sky-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-sky-600"></div>
                            <span className="ml-2.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                {isAvailable ? 'Đang phục vụ' : 'Tạm ngưng / Hết món'}
                            </span>
                        </label>
                    </div>
                </FormField>
            </FormSection>

            {/* Section 2: Giá bán & Thuế */}
            <FormSection
                title="Định giá & Thuế"
                description="Đơn giá niêm yết bán lẻ và tỷ lệ thuế suất"
                icon={Receipt}
                gridCols={2}
            >
                <FormField
                    label="Giá bán niêm yết (VNĐ)"
                    required
                    error={errors.price}
                >
                    <input
                        type="number"
                        min="0"
                        step="1000"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="Ví dụ: 35000"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold tabular-nums text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        required
                    />
                </FormField>

                <FormField
                    label="Thuế suất VAT (%)"
                    error={errors.vat_rate}
                    hint="Thuế tính trên doanh thu món"
                >
                    <select
                        value={vatRate}
                        onChange={(e) => setVatRate(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold tabular-nums text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                        <option value="0">0% (Không chịu thuế)</option>
                        <option value="5">5%</option>
                        <option value="8">8% (Giảm trừ VAT)</option>
                        <option value="10">10% (Chuẩn)</option>
                    </select>
                </FormField>
            </FormSection>

            {/* Section 3: Hình ảnh & Mô tả */}
            <FormSection
                title="Hình ảnh & Mô tả"
                description="Ảnh minh họa trên thực đơn POS và lời giới thiệu"
                icon={ImageIcon}
                gridCols={2}
            >
                {/* Image Upload Box */}
                <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Ảnh sản phẩm
                    </label>
                    <div className="flex items-center gap-3">
                        <div className="relative h-24 w-24 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                            {imagePreview ? (
                                <>
                                    <img
                                        src={imagePreview}
                                        alt="Preview"
                                        className="h-full w-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleRemoveImage}
                                        className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-xs"
                                        title="Xóa ảnh"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </>
                            ) : (
                                <ImageIcon className="h-7 w-7 text-zinc-400 stroke-[1.2]" />
                            )}
                            {showCompressingSpinner && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 space-y-1.5">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleImageChange}
                                className="hidden"
                                id="product-image-upload"
                            />
                            <label
                                htmlFor="product-image-upload"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer shadow-2xs transition-colors"
                            >
                                <ImageIcon className="h-3.5 w-3.5 stroke-[1.5]" />
                                <span>{imagePreview ? 'Đổi ảnh khác' : 'Tải ảnh lên'}</span>
                            </label>
                            <p className="text-[11px] text-zinc-400 leading-tight">
                                JPG, PNG hoặc WebP. Hệ thống tự động tối ưu hóa kích thước.
                            </p>
                            {errors.image && (
                                <p className="text-xs text-rose-500 font-medium">
                                    {errors.image}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <FormField label="Mô tả thực đơn" error={errors.description}>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="Mô tả hương vị, nguyên liệu hoặc thông điệp món…"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                </FormField>
            </FormSection>
        </ManagerFormModal>
    );
}
