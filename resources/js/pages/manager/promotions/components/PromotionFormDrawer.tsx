import { router } from '@inertiajs/react';
import {
    X,
    Plus,
    Shuffle,
    Download,
    Tag,
    Sparkles,
    Ticket,
    Percent,
    SlidersHorizontal,
    Clock,
    Layers,
    Save,
    AlertCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import DatePicker from '../../../../components/DatePicker';
import { exportXLSX } from '../../../../components/reports/reportExport';
import type { PromotionData } from '../PromotionsManager';
import type { ActionRow } from './PromotionActionsEditor';
import PromotionActionsEditor from './PromotionActionsEditor';
import type { ConditionRow } from './PromotionConditionsEditor';
import PromotionConditionsEditor from './PromotionConditionsEditor';
import PromotionPreview from './PromotionPreview';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotionToEdit: PromotionData | null;
    menuItems: { id: number; name: string }[];
    menuCategories: { id: number; name: string }[];
}

const randomCode = () =>
    Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

const DAYS = [
    { v: 1, l: 'Thứ 2' },
    { v: 2, l: 'Thứ 3' },
    { v: 3, l: 'Thứ 4' },
    { v: 4, l: 'Thứ 5' },
    { v: 5, l: 'Thứ 6' },
    { v: 6, l: 'Thứ 7' },
    { v: 0, l: 'Chủ nhật' },
];

interface SlotRow {
    days: number[];
    start: string;
    end: string;
}

export default function PromotionFormDrawer({
    isOpen,
    onClose,
    promotionToEdit,
    menuItems,
    menuCategories,
}: Props) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'promotion' | 'coupon' | 'voucher'>('promotion');
    const [code, setCode] = useState('');
    const [startDate, setStartDate] = useState<string | null>(null);
    const [endDate, setEndDate] = useState<string | null>(null);
    const [status, setStatus] = useState(true);
    const [maxUsage, setMaxUsage] = useState('');
    const [targetUsage, setTargetUsage] = useState('');
    const [exclusive, setExclusive] = useState(false);
    const [actions, setActions] = useState<ActionRow[]>([
        { action_type: 'discount_percent', action_value: '', max_discount_amount: '' },
    ]);
    const [conditions, setConditions] = useState<ConditionRow[]>([]);
    const [codePrefix, setCodePrefix] = useState('');
    const [codeQuantity, setCodeQuantity] = useState('');
    const [codeRandom, setCodeRandom] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [timeSlots, setTimeSlots] = useState<SlotRow[]>([]);

    const updateSlot = (i: number, patch: Partial<SlotRow>) =>
        setTimeSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    const addSlot = () => setTimeSlots((prev) => [...prev, { days: [1, 2, 3, 4, 5], start: '11:00', end: '14:00' }]);
    const removeSlot = (i: number) => setTimeSlots((prev) => prev.filter((_, idx) => idx !== i));
    const toggleDay = (i: number, d: number) => {
        setTimeSlots((prev) =>
            prev.map((s, idx) => {
                if (idx !== i) {
return s;
}

                const has = s.days.includes(d);

                return { ...s, days: has ? s.days.filter((x) => x !== d) : [...s.days, d].sort() };
            })
        );
    };

    useEffect(() => {
        queueMicrotask(() => {
            setErrors({});
            const toYmd = (v: string | null) => {
                if (!v) {
                    return null;
                }

                const parts = v.split('/'); // d/m/Y from controller

                if (parts.length === 3) {
                    return `${parts[2]}-${parts[1]}-${parts[0]}`;
                }

                return v;
            };

            if (promotionToEdit) {
                setName(promotionToEdit.name);
                setType(promotionToEdit.type);
                setCode(promotionToEdit.code || '');
                setStartDate(toYmd(promotionToEdit.start_date || null));
                setEndDate(toYmd(promotionToEdit.end_date || null));
                setStatus(promotionToEdit.status);
                setMaxUsage(promotionToEdit.max_usage === null ? '' : String(promotionToEdit.max_usage));
                setTargetUsage(promotionToEdit.target_usage === null ? '' : String(promotionToEdit.target_usage));
                setExclusive(!promotionToEdit.stackable);
                setActions(
                    promotionToEdit.actions.length
                        ? promotionToEdit.actions.map((a) => ({
                              action_type: a.action_type,
                              action_value: String(a.action_value),
                              max_discount_amount: a.max_discount_amount === null ? '' : String(a.max_discount_amount),
                          }))
                        : [{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]
                );
                setConditions(
                    promotionToEdit.conditions.map((c) => ({ cond_type: c.cond_type, cond_value: c.cond_value }))
                );
                setCodePrefix(promotionToEdit.code_prefix || '');
                setCodeQuantity(promotionToEdit.code_quantity === null ? '' : String(promotionToEdit.code_quantity));
                setCodeRandom(promotionToEdit.code_random);
                setTimeSlots(
                    (promotionToEdit.time_slots ?? []).map((s) => ({
                        days: [s.day_of_week],
                        start: s.start_time.slice(0, 5),
                        end: s.end_time.slice(0, 5),
                    }))
                );
            } else {
                setName('');
                setType('promotion');
                setCode('');
                setStartDate(null);
                setEndDate(null);
                setStatus(true);
                setMaxUsage('');
                setTargetUsage('');
                setExclusive(false);
                setActions([{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
                setConditions([]);
                setCodePrefix('');
                setCodeQuantity('');
                setCodeRandom(false);
                setTimeSlots([]);
            }
        });
    }, [promotionToEdit, isOpen]);

    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        if (!promotionToEdit || exporting || promotionToEdit.codes_count <= 0) {
return;
}

        setExporting(true);

        try {
            const res = await fetch(`/manager/promotions/${promotionToEdit.id}/codes?export=1`, {
                headers: { Accept: 'application/json' },
            });

            if (!res.ok) {
throw new Error('fail');
}

            const data = await res.json();
            const rows = (data.codes || []).map((c: any) => [
                c.code,
                c.status === 'used' ? 'Đã dùng' : 'Chưa dùng',
                c.used_at ? new Date(c.used_at).toLocaleString('vi-VN') : '—',
                c.invoice_code || '—',
            ]);
            await exportXLSX(
                `Danh sách mã ${promotionToEdit.code_prefix || 'KM'}`,
                promotionToEdit.name,
                ['Mã', 'Trạng thái', 'Thời gian dùng', 'Hoá đơn'],
                rows,
                `ma-${promotionToEdit.code_prefix || 'km'}`
            );
        } catch {
            // im lặng — modal danh sách mã có error state riêng
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) {
return null;
}

    const validateForm = (): boolean => {
        const errs: Record<string, string> = {};

        if (!name.trim()) {
            errs.name = 'Vui lòng nhập tên chương trình khuyến mãi.';
        }

        if (type === 'coupon' && !code.trim() && !codePrefix.trim()) {
            errs.code = 'Vui lòng nhập mã Coupon hoặc tạo mã ngẫu nhiên.';
        }

        if (type === 'voucher' && !promotionToEdit && (!codePrefix.trim() || !codeQuantity)) {
            errs.code_prefix = 'Voucher yêu cầu phát hành mã hàng loạt (Tiền tố và Số lượng mã).';
        }

        // Actions validation
        if (actions.length === 0) {
            errs.actions = 'Vui lòng thêm ít nhất một hành động giảm giá.';
        } else {
            const hasPercent = actions.some((a) => a.action_type === 'discount_percent');
            const hasAmount = actions.some((a) => a.action_type === 'discount_amount');

            if (hasPercent && hasAmount) {
                errs.actions = 'Không thể áp dụng đồng thời cả giảm % và giảm tiền cố định trên cùng một chương trình.';
            }

            for (const a of actions) {
                if (a.action_type === 'free_product' && !a.action_value) {
                    errs.actions = 'Vui lòng chọn món tặng cụ thể từ thực đơn.';
                    break;
                }

                if ((a.action_type === 'discount_percent' || a.action_type === 'discount_amount') && (!a.action_value || Number(a.action_value) <= 0)) {
                    errs.actions = 'Vui lòng nhập giá trị giảm giá hợp lệ lớn hơn 0.';
                    break;
                }

                if (a.action_type === 'discount_percent' && Number(a.action_value) > 100) {
                    errs.actions = 'Phần trăm giảm giá tối đa là 100%.';
                    break;
                }
            }
        }

        // Conditions validation
        for (const c of conditions) {
            if (!c.cond_value || c.cond_value.trim() === '') {
                errs.conditions = 'Vui lòng điền đầy đủ thông tin cho các điều kiện áp dụng.';
                break;
            }
        }

        setErrors(errs);

        return Object.keys(errs).length === 0;
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting) {
return;
}

        if (!validateForm()) {
return;
}

        setSubmitting(true);
        const isBatch = codePrefix !== '' || codeQuantity !== '';
        const payload = {
            name: name.trim(),
            type,
            code: type === 'promotion' || type === 'voucher' || isBatch ? null : code.toUpperCase() || null,
            start_date: startDate || null,
            end_date: endDate || null,
            status,
            max_usage: codePrefix ? null : maxUsage === '' ? null : Number(maxUsage),
            target_usage: targetUsage === '' ? null : Number(targetUsage),
            stackable: !exclusive,
            code_prefix: code !== '' ? null : codePrefix || null,
            code_quantity: code !== '' ? null : codeQuantity === '' ? null : Number(codeQuantity),
            code_random: type === 'voucher' ? true : code !== '' ? false : codeRandom,
            conditions: conditions.map((c) => ({ cond_type: c.cond_type, cond_value: c.cond_value })),
            actions: actions.map((a) => ({
                action_type: a.action_type,
                action_value: Number(a.action_value) || 0,
                max_discount_amount:
                    a.action_type === 'discount_percent' && a.max_discount_amount !== ''
                        ? Number(a.max_discount_amount)
                        : null,
            })),
            time_slots: timeSlots.flatMap((s) =>
                s.days.map((d) => ({ day_of_week: d, start_time: s.start, end_time: s.end }))
            ),
        };

        router.post(promotionToEdit ? `/manager/promotions/${promotionToEdit.id}` : '/manager/promotions', payload, {
            onSuccess: onClose,
            onError: (v) => setErrors(v as Record<string, string>),
            onFinish: () => setSubmitting(false),
        });
    };

    const inputCls =
        'w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3.5 py-2 text-xs text-zinc-900 transition-colors outline-none placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:text-zinc-100 dark:focus:bg-zinc-800';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-lg dark:border-zinc-800/80 dark:bg-zinc-900">
                {/* Modal Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
                    <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                            <Ticket className="h-5 w-5 stroke-[1.5]" />
                        </div>
                        <div>
                            <h3 className="font-display text-lg font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                                {promotionToEdit ? 'Chỉnh sửa chương trình khuyến mãi' : 'Tạo mới chương trình khuyến mãi'}
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Thiết lập các quy tắc giảm giá, điều kiện áp dụng và khung giờ vàng
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                        <X className="h-5 w-5 stroke-[1.5]" />
                    </button>
                </div>

                {/* Modal Body with Scroll */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                    <form id="promo-form" onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
                        {/* Left Column (8 cols): Form Sections */}
                        <div className="space-y-6 lg:col-span-8">
                            {/* Section 1: General Info */}
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                                <div className="mb-4 flex items-center space-x-2 border-b border-zinc-100 pb-3 text-sky-600 dark:border-zinc-800 dark:text-sky-400">
                                    <Tag className="h-4 w-4 stroke-[1.5]" />
                                    <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        1. Thông tin chương trình
                                    </h4>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                            Tên chương trình khuyến mãi <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Ví dụ: Giảm 20% Khai xuân đón lộc, Combo Giờ Vàng..."
                                            className={inputCls}
                                        />
                                        {errors.name && (
                                            <p className="mt-1 flex items-center gap-1 text-xs text-rose-500 font-medium">
                                                <AlertCircle className="h-3.5 w-3.5" />
                                                {errors.name}
                                            </p>
                                        )}
                                    </div>

                                    {/* Type Card Selector */}
                                    <div>
                                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                            Loại hình khuyến mãi <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setType('promotion');
                                                    setCode('');
                                                    setCodePrefix('');
                                                    setCodeQuantity('');
                                                }}
                                                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-colors ${
                                                    type === 'promotion'
                                                        ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/40 ring-1 ring-sky-500 text-sky-900 dark:text-sky-200'
                                                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/70'
                                                }`}
                                            >
                                                <div className="flex items-center gap-1.5 font-bold text-xs">
                                                    <Sparkles className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                                    <span>Tự động (Auto)</span>
                                                </div>
                                                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                                    Tự động áp dụng trên hoá đơn khi đủ điều kiện
                                                </p>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setType('coupon');
                                                    setCodePrefix('');
                                                    setCodeQuantity('');
                                                    setCodeRandom(false);
                                                }}
                                                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-colors ${
                                                    type === 'coupon'
                                                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-1 ring-emerald-500 text-emerald-900 dark:text-emerald-200'
                                                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/70'
                                                }`}
                                            >
                                                <div className="flex items-center gap-1.5 font-bold text-xs">
                                                    <Tag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                    <span>Mã Coupon</span>
                                                </div>
                                                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                                    Thu ngân hoặc khách nhập mã code cố định
                                                </p>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setType('voucher');
                                                    setCode('');
                                                    setCodeRandom(true);
                                                }}
                                                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-colors ${
                                                    type === 'voucher'
                                                        ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/40 ring-1 ring-purple-500 text-purple-900 dark:text-purple-200'
                                                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/70'
                                                }`}
                                            >
                                                <div className="flex items-center gap-1.5 font-bold text-xs">
                                                    <Ticket className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                                                    <span>Voucher quà tặng</span>
                                                </div>
                                                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                                    Sinh hàng loạt mã ngẫu nhiên, dùng 1 lần
                                                </p>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Coupon Single Code Input */}
                                    {type === 'coupon' && (
                                        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-3.5 dark:border-emerald-800/60 dark:bg-emerald-950/20">
                                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                                Mã Code áp dụng <span className="text-rose-500">*</span>
                                            </label>
                                            <div className="flex gap-2">
                                                <input
                                                    value={code}
                                                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                                                    placeholder="VD: BANMOI2026, SUMMER50..."
                                                    className="w-full rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setCode(randomCode())}
                                                    title="Tạo mã ngẫu nhiên"
                                                    className="flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                                >
                                                    <Shuffle className="h-3.5 w-3.5 stroke-[1.5]" />
                                                    <span>Ngẫu nhiên</span>
                                                </button>
                                            </div>
                                            {errors.code && (
                                                <p className="mt-1 text-xs text-rose-500 font-medium">{errors.code}</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Date Range */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                                Ngày bắt đầu hiệu lực
                                            </label>
                                            <DatePicker
                                                mode="single"
                                                className="w-full justify-start text-xs rounded-xl"
                                                value={startDate ? startDate.slice(0, 10) : null}
                                                onChange={(v) => setStartDate(v ?? '')}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                                Ngày kết thúc hiệu lực
                                            </label>
                                            <DatePicker
                                                mode="single"
                                                className="w-full justify-start text-xs rounded-xl"
                                                value={endDate ? endDate.slice(0, 10) : null}
                                                onChange={(v) => setEndDate(v ?? '')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Discount Actions (Không trùng nhau) */}
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                                <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                                    <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400">
                                        <Percent className="h-4 w-4 stroke-[1.5]" />
                                        <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            2. Cấu hình mức giảm giá &amp; Quà tặng
                                        </h4>
                                    </div>
                                    <span className="text-[11px] text-zinc-400">Không cộng dồn trùng loại</span>
                                </div>

                                <PromotionActionsEditor actions={actions} onChange={setActions} menuItems={menuItems} />
                                {errors.actions && (
                                    <p className="mt-2 flex items-center gap-1 text-xs text-rose-500 font-medium">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        {errors.actions}
                                    </p>
                                )}
                            </div>

                            {/* Section 3: Conditions (Không trùng nhau) */}
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                                <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                                    <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400">
                                        <SlidersHorizontal className="h-4 w-4 stroke-[1.5]" />
                                        <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            3. Điều kiện áp dụng
                                        </h4>
                                    </div>
                                    <span className="text-[11px] text-zinc-400">Lọc đơn hàng &amp; danh mục</span>
                                </div>

                                <PromotionConditionsEditor
                                    conditions={conditions}
                                    onChange={setConditions}
                                    menuItems={menuItems}
                                    menuCategories={menuCategories}
                                />
                                {errors.conditions && (
                                    <p className="mt-2 flex items-center gap-1 text-xs text-rose-500 font-medium">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        {errors.conditions}
                                    </p>
                                )}
                            </div>

                            {/* Section 4: Advanced Limits, Batch & Golden Hours */}
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900 space-y-5">
                                <div className="flex items-center space-x-2 border-b border-zinc-100 pb-3 text-sky-600 dark:border-zinc-800 dark:text-sky-400">
                                    <Clock className="h-4 w-4 stroke-[1.5]" />
                                    <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        4. Giới hạn &amp; Khung giờ áp dụng
                                    </h4>
                                </div>

                                {/* Usage Limit Inputs */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {type !== 'voucher' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                                Tổng số lượt sử dụng tối đa
                                            </label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={maxUsage}
                                                onChange={(e) => setMaxUsage(e.target.value)}
                                                placeholder="Để trống = Không giới hạn"
                                                className={inputCls}
                                            />
                                        </div>
                                    )}
                                    {type === 'promotion' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                                Mục tiêu lượt dùng (KPI)
                                            </label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={targetUsage}
                                                onChange={(e) => setTargetUsage(e.target.value)}
                                                placeholder="Để theo dõi hiệu suất"
                                                className={inputCls}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Batch Voucher Generation */}
                                {type === 'voucher' && (
                                    <div className="rounded-xl border border-purple-200/80 bg-purple-50/30 p-4 dark:border-purple-800/60 dark:bg-purple-950/20 space-y-3">
                                        <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900 dark:text-purple-300">
                                            <Layers className="h-4 w-4" />
                                            <span>Phát hành mã Voucher hàng loạt</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                                    Chuỗi tiền tố (Prefix) <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    value={codePrefix}
                                                    onChange={(e) => {
                                                        setCodePrefix(e.target.value.toUpperCase());
                                                        setCode('');
                                                    }}
                                                    placeholder="VD: VC2026, VIP..."
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                                                    Số lượng mã cần sinh <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={100000}
                                                    value={codeQuantity}
                                                    onChange={(e) => {
                                                        setCodeQuantity(e.target.value);
                                                        setCode('');
                                                    }}
                                                    placeholder="VD: 50, 100, 500"
                                                    className={inputCls}
                                                />
                                            </div>
                                        </div>
                                        {errors.code_prefix && (
                                            <p className="text-xs text-rose-500 font-medium">{errors.code_prefix}</p>
                                        )}
                                        {promotionToEdit && promotionToEdit.codes_count > 0 && (
                                            <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                                                Đã phát hành: {promotionToEdit.codes_count} mã · Đã sử dụng: {promotionToEdit.codes_used} mã
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Golden Hours Slots */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                                Khung giờ vàng (Tùy chọn)
                                            </label>
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                                Chỉ áp dụng trong khoảng giờ và thứ đã chọn. Để trống = áp dụng mọi lúc.
                                            </p>
                                        </div>
                                    </div>

                                    {timeSlots.map((slot, i) => (
                                        <div
                                            key={i}
                                            className="space-y-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-800/40"
                                        >
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {DAYS.map((d) => (
                                                    <button
                                                        key={d.v}
                                                        type="button"
                                                        onClick={() => toggleDay(i, d.v)}
                                                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                                                            slot.days.includes(d.v)
                                                                ? 'bg-sky-600 text-white'
                                                                : 'bg-zinc-200/70 text-zinc-600 hover:bg-zinc-300/70 dark:bg-zinc-700/60 dark:text-zinc-300'
                                                        }`}
                                                    >
                                                        {d.l}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="flex items-center gap-2 pt-1">
                                                <input
                                                    type="time"
                                                    value={slot.start}
                                                    onChange={(e) => updateSlot(i, { start: e.target.value })}
                                                    className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800"
                                                />
                                                <span className="text-xs text-zinc-400 font-bold">—</span>
                                                <input
                                                    type="time"
                                                    value={slot.end}
                                                    onChange={(e) => updateSlot(i, { end: e.target.value })}
                                                    className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeSlot(i)}
                                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                                                    title="Xóa khung giờ"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={addSlot}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                                    >
                                        <Plus className="h-3.5 w-3.5 stroke-2" />
                                        <span>Thêm khung giờ vàng</span>
                                    </button>
                                </div>

                                {/* Stackable Toggle */}
                                {type !== 'promotion' && (
                                    <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                                Áp dụng độc quyền
                                            </label>
                                            <p className="text-[11px] text-zinc-500">
                                                Không cho phép cộng dồn với các chương trình khuyến mãi tự động khác
                                            </p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={exclusive}
                                            onChange={(e) => setExclusive(e.target.checked)}
                                            className="h-4 w-4 rounded accent-sky-600"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column (4 cols): Sticky Live Preview */}
                        <div className="space-y-4 lg:col-span-4 lg:sticky lg:top-2">
                            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                                <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                                    <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        Xem trước (Live Preview)
                                    </h4>
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                                        Thẻ mẫu
                                    </span>
                                </div>

                                <PromotionPreview
                                    name={name}
                                    type={type}
                                    code={code}
                                    codePrefix={codePrefix}
                                    actions={actions}
                                    conditions={conditions}
                                    menuItems={menuItems}
                                    menuCategories={menuCategories}
                                    startDate={startDate}
                                    endDate={endDate || ''}
                                    status={status}
                                    exclusive={exclusive}
                                    maxUsage={maxUsage}
                                    timeSlotsCount={timeSlots.length}
                                />
                            </div>

                            {/* Batch Codes Export if Voucher */}
                            {promotionToEdit && promotionToEdit.codes_count > 0 && (
                                <button
                                    type="button"
                                    onClick={handleExport}
                                    disabled={exporting}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-semibold text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50"
                                >
                                    <Download className="h-4 w-4 stroke-[1.5]" />
                                    <span>{exporting ? 'Đang xuất Excel...' : 'Xuất danh sách mã Excel'}</span>
                                </button>
                            )}

                            {/* Footer Submit / Cancel buttons */}
                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50"
                                >
                                    <Save className="h-3.5 w-3.5 stroke-2" />
                                    <span>{submitting ? 'Đang lưu...' : 'Lưu & Kích hoạt'}</span>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
