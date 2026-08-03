import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import { X } from 'lucide-react';
import DatePicker from '../../../../components/DatePicker';
import SearchableSelect from '../../../../components/SearchableSelect';
import type { SelectOption } from '../../../../components/SearchableSelect';
import { PromotionData } from './PromotionTable';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotionToEdit: PromotionData | null;
    menuItems?: SelectOption[];
    menuCategories?: SelectOption[];
}
type FormState = {
    code: string;
    name: string;
    description: string;
    discount_type: 'percentage' | 'fixed_amount';
    discount_value: string;
    target_type: 'order' | 'item' | 'category';
    target_value: string;
    min_order_amount: string;
    max_discount_amount: string;
    max_uses: string;
    starts_at: string;
    expires_at: string;
    is_active: boolean;
};
const empty: FormState = {
    code: '',
    name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: '',
    target_type: 'order',
    target_value: '',
    min_order_amount: '0',
    max_discount_amount: '',
    max_uses: '',
    starts_at: '',
    expires_at: '',
    is_active: true,
};
const localDate = (value: string | null) =>
    value ? new Date(value).toISOString().slice(0, 16) : '';

export default function PromotionFormDrawer({
    isOpen,
    onClose,
    promotionToEdit,
    menuItems,
    menuCategories,
}: Props) {
    const [form, setForm] = useState<FormState>(empty);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setErrors({});
        setForm(
            promotionToEdit
                ? {
                      code: promotionToEdit.code,
                      name: promotionToEdit.name,
                      description: promotionToEdit.description || '',
                      discount_type: promotionToEdit.discount_type,
                      discount_value: String(promotionToEdit.discount_value),
                      target_type: promotionToEdit.target_type ?? 'order',
                      target_value:
                          promotionToEdit.target_value === null ||
                          promotionToEdit.target_value === undefined
                              ? ''
                              : String(promotionToEdit.target_value),
                      min_order_amount: String(
                          promotionToEdit.min_order_amount ?? 0,
                      ),
                      max_discount_amount:
                          promotionToEdit.max_discount_amount === null
                              ? ''
                              : String(promotionToEdit.max_discount_amount),
                      max_uses:
                          promotionToEdit.max_uses === null
                              ? ''
                              : String(promotionToEdit.max_uses),
                      starts_at: localDate(promotionToEdit.starts_at),
                      expires_at: localDate(promotionToEdit.expires_at),
                      is_active: promotionToEdit.is_active,
                  }
                : empty,
        );
    }, [promotionToEdit, isOpen]);

    if (!isOpen) return null;
    const set = (key: keyof FormState, value: string | boolean) =>
        setForm((current) => ({ ...current, [key]: value }));
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        const payload = {
            ...form,
            discount_value: Number(form.discount_value),
            target_value:
                form.target_type === 'order' || form.target_value === ''
                    ? null
                    : Number(form.target_value),
            min_order_amount:
                form.min_order_amount === ''
                    ? null
                    : Number(form.min_order_amount),
            max_discount_amount:
                form.max_discount_amount === ''
                    ? null
                    : Number(form.max_discount_amount),
            max_uses: form.max_uses === '' ? null : Number(form.max_uses),
            starts_at: form.starts_at || null,
            expires_at: form.expires_at || null,
        };
        router.post(
            promotionToEdit
                ? `/manager/promotions/${promotionToEdit.id}`
                : '/manager/promotions',
            payload,
            {
                onSuccess: onClose,
                onError: (value) => setErrors(value as Record<string, string>),
                onFinish: () => setSubmitting(false),
            },
        );
    };
    const fields: {
        key: keyof FormState;
        label: string;
        type?: string;
        required?: boolean;
    }[] = [
        { key: 'code', label: 'Mã khuyến mãi', required: true },
        { key: 'name', label: 'Tên khuyến mãi', required: true },
        {
            key: 'min_order_amount',
            label: 'Đơn hàng tối thiểu',
            type: 'number',
        },
        { key: 'max_uses', label: 'Số lượt dùng tối đa', type: 'number' },
    ];
    return (
        <div className="fixed inset-0 z-[100]">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-xs"
                onClick={onClose}
            />
            <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-200 p-5 dark:border-zinc-800">
                    <h2 className="font-display text-xl text-zinc-900 dark:text-zinc-100">
                        {promotionToEdit
                            ? 'Cập nhật khuyến mãi'
                            : 'Thêm khuyến mãi mới'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <X className="h-5 w-5 stroke-[1.5]" />
                    </button>
                </div>
                <form
                    id="promotion-form"
                    onSubmit={submit}
                    className="flex-1 space-y-4 overflow-y-auto p-5"
                >
                    <div className="grid grid-cols-2 gap-4">
                        {fields.map((field) => (
                            <label
                                key={field.key}
                                className={
                                    field.key === 'name' || field.key === 'code'
                                        ? 'col-span-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300'
                                        : 'text-xs font-semibold text-zinc-700 dark:text-zinc-300'
                                }
                            >
                                {field.label}
                                {field.required && (
                                    <span className="text-rose-500"> *</span>
                                )}
                                <input
                                    type={field.type || 'text'}
                                    value={String(form[field.key])}
                                    onChange={(e) =>
                                        set(
                                            field.key,
                                            field.key === 'code'
                                                ? e.target.value.toUpperCase()
                                                : e.target.value,
                                        )
                                    }
                                    className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                />
                                {errors[field.key] && (
                                    <span className="mt-1 block text-xs text-rose-500">
                                        {errors[field.key]}
                                    </span>
                                )}
                            </label>
                        ))}
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Giá trị giảm<span className="text-rose-500"> *</span>
                            <span className="mt-1.5 flex overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 focus-within:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800">
                                <input
                                    type="number"
                                    value={form.discount_value}
                                    onChange={(e) =>
                                        set('discount_value', e.target.value)
                                    }
                                    className="w-full min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-900 outline-none dark:text-zinc-100"
                                />
                                <span className="border-l border-zinc-300 dark:border-zinc-700" />
                                <select
                                    value={form.discount_type}
                                    onChange={(e) =>
                                        set('discount_type', e.target.value)
                                    }
                                    className="shrink-0 bg-transparent px-1.5 py-2.5 text-xs font-medium text-zinc-700 outline-none dark:text-zinc-300"
                                >
                                    <option value="percentage">%</option>
                                    <option value="fixed_amount">VND</option>
                                </select>
                            </span>
                            {errors.discount_value && (
                                <span className="mt-1 block text-xs text-rose-500">
                                    {errors.discount_value}
                                </span>
                            )}
                        </label>
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Mức giảm tối đa
                            <input
                                type="number"
                                disabled={form.discount_type !== 'percentage'}
                                value={form.max_discount_amount}
                                onChange={(e) =>
                                    set('max_discount_amount', e.target.value)
                                }
                                className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none dark:text-zinc-100 ${
                                    form.discount_type === 'percentage'
                                        ? 'border-zinc-300 bg-zinc-50 text-zinc-900 focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800'
                                        : 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500'
                                }`}
                            />
                            {errors.max_discount_amount && (
                                <span className="mt-1 block text-xs text-rose-500">
                                    {errors.max_discount_amount}
                                </span>
                            )}
                        </label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Phạm vi áp dụng
                            <span className="mt-1.5 flex overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                                {(
                                    [
                                        ['order', 'Toàn đơn'],
                                        ['item', 'Theo món'],
                                        ['category', 'Theo danh mục'],
                                    ] as const
                                ).map(([type, label]) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() =>
                                            set('target_type', type)
                                        }
                                        className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors ${
                                            form.target_type === type
                                                ? 'bg-sky-600 text-white'
                                                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </span>
                            {form.target_type !== 'order' && (
                                <SearchableSelect
                                    options={
                                        form.target_type === 'item'
                                            ? menuItems ?? []
                                            : menuCategories ?? []
                                    }
                                    value={
                                        form.target_value === ''
                                            ? null
                                            : Number(form.target_value)
                                    }
                                    onChange={(id) =>
                                        set(
                                            'target_value',
                                            id === null ? '' : String(id),
                                        )
                                    }
                                    placeholder={
                                        form.target_type === 'item'
                                            ? 'Chọn món...'
                                            : 'Chọn danh mục...'
                                    }
                                />
                            )}
                            {errors.target_value && (
                                <span className="mt-1 block text-xs text-rose-500">
                                    {errors.target_value}
                                </span>
                            )}
                        </label>
                        <div className="hidden md:block" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Ngày bắt đầu
                            <DatePicker
                                mode="single"
                                className="w-full justify-start"
                                value={
                                    form.starts_at
                                        ? form.starts_at.slice(0, 10)
                                        : null
                                }
                                onChange={(v) => set('starts_at', v ?? '')}
                            />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Ngày kết thúc
                            <DatePicker
                                mode="single"
                                className="w-full justify-start"
                                value={
                                    form.expires_at
                                        ? form.expires_at.slice(0, 10)
                                        : null
                                }
                                onChange={(v) => set('expires_at', v ?? '')}
                            />
                        </label>
                    </div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Mô tả
                        <textarea
                            rows={3}
                            value={form.description}
                            onChange={(e) => set('description', e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                    </label>
                    <label className="flex items-center gap-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => set('is_active', e.target.checked)}
                            className="h-4 w-4 accent-sky-600"
                        />
                        Đang hoạt động
                    </label>
                </form>
                <div className="flex justify-end gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
                    >
                        Hủy
                    </button>
                    <button
                        form="promotion-form"
                        disabled={submitting}
                        className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {submitting ? 'Đang lưu…' : 'Lưu khuyến mãi'}
                    </button>
                </div>
            </div>
        </div>
    );
}
