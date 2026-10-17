import { router } from '@inertiajs/react';
import {
    AlertCircle,
    Clock,
    Download,
    Percent,
    Plus,
    Shuffle,
    SlidersHorizontal,
    Sparkles,
    Tag,
    Ticket,
    X,
} from 'lucide-react';
import React, { useEffect, useState, useMemo } from 'react';
import { ManagerFormModal } from '@/components/form';
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
    Array.from(
        { length: 8 },
        () =>
            'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)],
    ).join('');

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

export default function PromotionFormModal({
    isOpen,
    onClose,
    promotionToEdit,
    menuItems,
    menuCategories,
}: Props) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'promotion' | 'coupon' | 'voucher'>(
        'promotion',
    );
    const [code, setCode] = useState('');
    const [startDate, setStartDate] = useState<string | null>(null);
    const [endDate, setEndDate] = useState<string | null>(null);
    const [status, setStatus] = useState(true);
    const [maxUsage, setMaxUsage] = useState('');
    const [targetUsage, setTargetUsage] = useState('');
    const [exclusive, setExclusive] = useState(false);
    const [actions, setActions] = useState<ActionRow[]>([
        {
            action_type: 'discount_percent',
            action_value: '',
            max_discount_amount: '',
        },
    ]);
    const [conditions, setConditions] = useState<ConditionRow[]>([]);
    const [codePrefix, setCodePrefix] = useState('');
    const [codeQuantity, setCodeQuantity] = useState('');
    const [codeRandom, setCodeRandom] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [timeSlots, setTimeSlots] = useState<SlotRow[]>([]);

    const updateSlot = (i: number, patch: Partial<SlotRow>) =>
        setTimeSlots((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
        );
    const addSlot = () =>
        setTimeSlots((prev) => [
            ...prev,
            { days: [1, 2, 3, 4, 5], start: '11:00', end: '14:00' },
        ]);
    const removeSlot = (i: number) =>
        setTimeSlots((prev) => prev.filter((_, idx) => idx !== i));
    const toggleDay = (i: number, d: number) => {
        setTimeSlots((prev) =>
            prev.map((s, idx) => {
                if (idx !== i) {
                    return s;
                }

                const has = s.days.includes(d);

                return {
                    ...s,
                    days: has
                        ? s.days.filter((x) => x !== d)
                        : [...s.days, d].sort(),
                };
            }),
        );
    };

    useEffect(() => {
        queueMicrotask(() => {
            setErrors({});
            const toYmd = (v: string | null) => {
                if (!v) {
                    return null;
                }

                const parts = v.split('/');

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
                setMaxUsage(
                    promotionToEdit.max_usage === null
                        ? ''
                        : String(promotionToEdit.max_usage),
                );
                setTargetUsage(
                    promotionToEdit.target_usage === null
                        ? ''
                        : String(promotionToEdit.target_usage),
                );
                setExclusive(!promotionToEdit.stackable);
                setActions(
                    promotionToEdit.actions.length
                        ? promotionToEdit.actions.map((a) => ({
                              action_type: a.action_type,
                              action_value: String(a.action_value),
                              max_discount_amount:
                                  a.max_discount_amount === null
                                      ? ''
                                      : String(a.max_discount_amount),
                          }))
                        : [
                              {
                                  action_type: 'discount_percent',
                                  action_value: '',
                                  max_discount_amount: '',
                              },
                          ],
                );
                setConditions(
                    promotionToEdit.conditions.map((c) => ({
                        cond_type: c.cond_type,
                        cond_value: c.cond_value,
                    })),
                );
                setCodePrefix(promotionToEdit.code_prefix || '');
                setCodeQuantity(
                    promotionToEdit.code_quantity === null
                        ? ''
                        : String(promotionToEdit.code_quantity),
                );
                setCodeRandom(promotionToEdit.code_random);
                setTimeSlots(
                    (promotionToEdit.time_slots ?? []).map((s) => ({
                        days: [s.day_of_week],
                        start: s.start_time.slice(0, 5),
                        end: s.end_time.slice(0, 5),
                    })),
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
                setActions([
                    {
                        action_type: 'discount_percent',
                        action_value: '',
                        max_discount_amount: '',
                    },
                ]);
                setConditions([]);
                setCodePrefix('');
                setCodeQuantity('');
                setCodeRandom(false);
                setTimeSlots([]);
            }
        });
    }, [promotionToEdit, isOpen]);

    const isDirty = useMemo(() => {
        if (promotionToEdit) {
            return (
                name !== promotionToEdit.name ||
                type !== promotionToEdit.type ||
                code !== (promotionToEdit.code || '') ||
                status !== promotionToEdit.status
            );
        }

        return (
            name.trim() !== '' ||
            code.trim() !== '' ||
            codePrefix.trim() !== '' ||
            conditions.length > 0
        );
    }, [promotionToEdit, name, type, code, status, codePrefix, conditions]);

    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        if (!promotionToEdit || exporting || promotionToEdit.codes_count <= 0) {
            return;
        }

        setExporting(true);

        try {
            const res = await fetch(
                `/manager/promotions/${promotionToEdit.id}/codes?export=1`,
                {
                    headers: { Accept: 'application/json' },
                },
            );

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
                `ma-${promotionToEdit.code_prefix || 'km'}`,
            );
        } catch {
            // Error state handled elsewhere
        } finally {
            setExporting(false);
        }
    };

    const validateForm = (): boolean => {
        const errs: Record<string, string> = {};

        if (!name.trim()) {
            errs.name = 'Vui lòng nhập tên chương trình khuyến mãi.';
        }

        if (type === 'coupon' && !code.trim() && !codePrefix.trim()) {
            errs.code = 'Vui lòng nhập mã Coupon hoặc tạo mã ngẫu nhiên.';
        }

        if (
            type === 'voucher' &&
            !promotionToEdit &&
            (!codePrefix.trim() || !codeQuantity)
        ) {
            errs.code_prefix =
                'Voucher yêu cầu phát hành mã hàng loạt (Tiền tố và Số lượng mã).';
        }

        // Actions validation
        if (actions.length === 0) {
            errs.actions = 'Vui lòng thêm ít nhất một hành động giảm giá.';
        } else {
            const hasPercent = actions.some(
                (a) => a.action_type === 'discount_percent',
            );
            const hasAmount = actions.some(
                (a) => a.action_type === 'discount_amount',
            );

            if (hasPercent && hasAmount) {
                errs.actions =
                    'Không thể áp dụng đồng thời cả giảm % và giảm tiền cố định trên cùng một chương trình.';
            }

            for (const a of actions) {
                if (a.action_type === 'free_product' && !a.action_value) {
                    errs.actions = 'Vui lòng chọn món tặng cụ thể từ thực đơn.';
                    break;
                }

                if (
                    (a.action_type === 'discount_percent' ||
                        a.action_type === 'discount_amount') &&
                    (!a.action_value || Number(a.action_value) <= 0)
                ) {
                    errs.actions =
                        'Vui lòng nhập giá trị giảm giá hợp lệ lớn hơn 0.';
                    break;
                }

                if (
                    a.action_type === 'discount_percent' &&
                    Number(a.action_value) > 100
                ) {
                    errs.actions = 'Phần trăm giảm giá tối đa là 100%.';
                    break;
                }
            }
        }

        // Conditions validation
        for (const c of conditions) {
            if (!c.cond_value || c.cond_value.trim() === '') {
                errs.conditions =
                    'Vui lòng điền đầy đủ thông tin cho các điều kiện áp dụng.';
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
            code:
                type === 'promotion' || type === 'voucher' || isBatch
                    ? null
                    : code.toUpperCase() || null,
            start_date: startDate || null,
            end_date: endDate || null,
            status,
            max_usage: codePrefix
                ? null
                : maxUsage === ''
                  ? null
                  : Number(maxUsage),
            target_usage: targetUsage === '' ? null : Number(targetUsage),
            stackable: !exclusive,
            code_prefix: code !== '' ? null : codePrefix || null,
            code_quantity:
                code !== ''
                    ? null
                    : codeQuantity === ''
                      ? null
                      : Number(codeQuantity),
            code_random:
                type === 'voucher' ? true : code !== '' ? false : codeRandom,
            conditions: conditions.map((c) => ({
                cond_type: c.cond_type,
                cond_value: c.cond_value,
            })),
            actions: actions.map((a) => ({
                action_type: a.action_type,
                action_value: Number(a.action_value) || 0,
                max_discount_amount:
                    a.action_type === 'discount_percent' &&
                    a.max_discount_amount !== ''
                        ? Number(a.max_discount_amount)
                        : null,
            })),
            time_slots: timeSlots.flatMap((s) =>
                s.days.map((d) => ({
                    day_of_week: d,
                    start_time: s.start,
                    end_time: s.end,
                })),
            ),
        };

        router.post(
            promotionToEdit
                ? `/manager/promotions/${promotionToEdit.id}`
                : '/manager/promotions',
            payload,
            {
                onSuccess: onClose,
                onError: (v) => setErrors(v as Record<string, string>),
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const inputCls =
        'w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3.5 py-2 text-xs text-zinc-900 transition-colors outline-hidden placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700/80 dark:bg-zinc-800/50 dark:text-zinc-100 dark:focus:bg-zinc-800 font-medium';

    return (
        <ManagerFormModal
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={submit}
            title={
                promotionToEdit
                    ? 'Chỉnh sửa chương trình khuyến mãi'
                    : 'Tạo mới chương trình khuyến mãi'
            }
            subtitle="Thiết lập các quy tắc giảm giá, điều kiện áp dụng và khung giờ vàng"
            isEditing={!!promotionToEdit}
            isDirty={isDirty}
            submitting={submitting}
            size="2xl"
            formId="promo-form"
        >
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
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
                                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Tên chương trình khuyến mãi{' '}
                                    <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ví dụ: Giảm 20% Khai xuân đón lộc, Combo Giờ Vàng…"
                                    className={inputCls}
                                />
                                {errors.name && (
                                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-500">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        {errors.name}
                                    </p>
                                )}
                            </div>

                            {/* Type Card Selector */}
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Loại hình khuyến mãi{' '}
                                    <span className="text-rose-500">*</span>
                                </label>
                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setType('promotion');
                                            setCode('');
                                            setCodePrefix('');
                                            setCodeQuantity('');
                                        }}
                                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                                            type === 'promotion'
                                                ? 'border-sky-500 bg-sky-50/60 text-sky-900 ring-1 ring-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                                                : 'border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <Sparkles className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                            <span>Tự động (Auto)</span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                                            Tự động áp dụng trên hoá đơn khi đủ
                                            điều kiện
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
                                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                                            type === 'coupon'
                                                ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900 ring-1 ring-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200'
                                                : 'border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <Tag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                            <span>Mã Coupon</span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                                            Dùng chung một mã công khai (vd:
                                            CHAOMUNG2026)
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setType('voucher');
                                            setCode('');
                                            setCodeRandom(true);
                                        }}
                                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                                            type === 'voucher'
                                                ? 'border-purple-500 bg-purple-50/60 text-purple-900 ring-1 ring-purple-500 dark:bg-purple-950/40 dark:text-purple-200'
                                                : 'border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 text-xs font-bold">
                                            <Ticket className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                                            <span>Voucher độc bản</span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                                            Mỗi khách hàng sở hữu 1 mã riêng,
                                            dùng 1 lần
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {/* Conditional Code Generation */}
                            {type === 'coupon' && (
                                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
                                    <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                        Mã Coupon áp dụng{' '}
                                        <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            value={code}
                                            onChange={(e) =>
                                                setCode(
                                                    e.target.value.toUpperCase(),
                                                )
                                            }
                                            placeholder="Ví dụ: SALE50K, FREESHIP"
                                            className={`${inputCls} font-mono font-bold tracking-wider uppercase`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCode(randomCode())
                                            }
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                                            title="Sinh mã ngẫu nhiên"
                                        >
                                            <Shuffle className="h-3.5 w-3.5" />
                                            <span>Tạo mã</span>
                                        </button>
                                    </div>
                                    {errors.code && (
                                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-500">
                                            <AlertCircle className="h-3.5 w-3.5" />
                                            {errors.code}
                                        </p>
                                    )}
                                </div>
                            )}

                            {type === 'voucher' && (
                                <div className="rounded-xl border border-purple-200/70 bg-purple-50/30 p-3.5 dark:border-purple-900/40 dark:bg-purple-950/20">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                                Tiền tố mã (Prefix)
                                            </label>
                                            <input
                                                value={codePrefix}
                                                onChange={(e) =>
                                                    setCodePrefix(
                                                        e.target.value.toUpperCase(),
                                                    )
                                                }
                                                placeholder="VD: VIP, TET2026"
                                                className={`${inputCls} font-mono uppercase`}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                                Số lượng mã phát hành
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10000"
                                                value={codeQuantity}
                                                onChange={(e) =>
                                                    setCodeQuantity(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="VD: 100"
                                                className={`${inputCls} font-semibold tabular-nums`}
                                            />
                                        </div>
                                    </div>
                                    {errors.code_prefix && (
                                        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-500">
                                            <AlertCircle className="h-3.5 w-3.5" />
                                            {errors.code_prefix}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 2: Validity and Limitations */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="mb-4 flex items-center space-x-2 border-b border-zinc-100 pb-3 text-sky-600 dark:border-zinc-800 dark:text-sky-400">
                            <Clock className="h-4 w-4 stroke-[1.5]" />
                            <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                2. Thời hạn & Giới hạn áp dụng
                            </h4>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Ngày bắt đầu
                                </label>
                                <DatePicker
                                    mode="single"
                                    value={startDate}
                                    onChange={setStartDate}
                                    placeholder="Chọn ngày bắt đầu…"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Ngày kết thúc
                                </label>
                                <DatePicker
                                    mode="single"
                                    value={endDate}
                                    onChange={setEndDate}
                                    placeholder="Không giới hạn…"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Tổng lượt dùng tối đa
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={maxUsage}
                                    onChange={(e) =>
                                        setMaxUsage(e.target.value)
                                    }
                                    placeholder="Không giới hạn"
                                    className={`${inputCls} tabular-nums`}
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Mục tiêu lượt dùng (KPI)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={targetUsage}
                                    onChange={(e) =>
                                        setTargetUsage(e.target.value)
                                    }
                                    placeholder="Ví dụ: 200 lượt"
                                    className={`${inputCls} tabular-nums`}
                                />
                            </div>
                        </div>

                        <div className="mt-4 space-y-2.5 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                <input
                                    type="checkbox"
                                    checked={exclusive}
                                    onChange={(e) =>
                                        setExclusive(e.target.checked)
                                    }
                                    className="rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
                                />
                                <span>
                                    Không áp dụng đồng thời với các chương trình
                                    khuyến mãi khác
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                <input
                                    type="checkbox"
                                    checked={status}
                                    onChange={(e) =>
                                        setStatus(e.target.checked)
                                    }
                                    className="rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
                                />
                                <span>
                                    Kích hoạt chương trình ngay sau khi lưu
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Section 3: Time Slots (Happy Hour) */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
                                <Clock className="h-4 w-4 stroke-[1.5]" />
                                <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                    3. Khung giờ vàng (Happy Hour)
                                </h4>
                            </div>
                            <button
                                type="button"
                                onClick={addSlot}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Thêm khung giờ</span>
                            </button>
                        </div>

                        {timeSlots.length === 0 ? (
                            <p className="py-1 text-xs text-zinc-400">
                                Áp dụng cho mọi khung giờ trong ngày. Nhấn “Thêm
                                khung giờ” để giới hạn theo giờ vàng.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {timeSlots.map((slot, idx) => (
                                    <div
                                        key={idx}
                                        className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-800/40"
                                    >
                                        <div className="flex flex-wrap items-center gap-1">
                                            {DAYS.map((d) => {
                                                const active =
                                                    slot.days.includes(d.v);

                                                return (
                                                    <button
                                                        key={d.v}
                                                        type="button"
                                                        onClick={() =>
                                                            toggleDay(idx, d.v)
                                                        }
                                                        className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                                                            active
                                                                ? 'bg-sky-600 text-white'
                                                                : 'bg-zinc-200/80 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300'
                                                        }`}
                                                    >
                                                        {d.l}
                                                    </button>
                                                );
                                            })}
                                            <button
                                                type="button"
                                                onClick={() => removeSlot(idx)}
                                                className="ml-auto p-1 text-zinc-400 hover:text-rose-500"
                                                title="Xoá khung giờ"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs">
                                            <span>Từ:</span>
                                            <input
                                                type="time"
                                                value={slot.start}
                                                onChange={(e) =>
                                                    updateSlot(idx, {
                                                        start: e.target.value,
                                                    })
                                                }
                                                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
                                            />
                                            <span>Đến:</span>
                                            <input
                                                type="time"
                                                value={slot.end}
                                                onChange={(e) =>
                                                    updateSlot(idx, {
                                                        end: e.target.value,
                                                    })
                                                }
                                                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Section 4: Actions Editor */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="mb-4 flex items-center space-x-2 border-b border-zinc-100 pb-3 text-emerald-600 dark:border-zinc-800 dark:text-emerald-400">
                            <Percent className="h-4 w-4 stroke-[1.5]" />
                            <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                4. Mức ưu đãi (Hành động giảm giá)
                            </h4>
                        </div>
                        {errors.actions && (
                            <p className="mb-3 text-xs font-medium text-rose-500">
                                {errors.actions}
                            </p>
                        )}
                        <PromotionActionsEditor
                            actions={actions}
                            onChange={setActions}
                            menuItems={menuItems}
                        />
                    </div>

                    {/* Section 5: Conditions Editor */}
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="mb-4 flex items-center space-x-2 border-b border-zinc-100 pb-3 text-purple-600 dark:border-zinc-800 dark:text-purple-400">
                            <SlidersHorizontal className="h-4 w-4 stroke-[1.5]" />
                            <h4 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                5. Điều kiện áp dụng
                            </h4>
                        </div>
                        {errors.conditions && (
                            <p className="mb-3 text-xs font-medium text-rose-500">
                                {errors.conditions}
                            </p>
                        )}
                        <PromotionConditionsEditor
                            conditions={conditions}
                            onChange={setConditions}
                            menuItems={menuItems}
                            menuCategories={menuCategories}
                        />
                    </div>
                </div>

                {/* Right Column (4 cols): Live Preview & Batch Export */}
                <div className="space-y-4 lg:sticky lg:top-0 lg:col-span-4">
                    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-2.5 dark:border-zinc-800">
                            <h4 className="font-display text-xs font-bold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
                                Xem trước (Live Preview)
                            </h4>
                            <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
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
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-semibold text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                            <Download className="h-4 w-4 stroke-[1.5]" />
                            <span>
                                {exporting
                                    ? 'Đang xuất Excel…'
                                    : 'Xuất danh sách mã Excel'}
                            </span>
                        </button>
                    )}
                </div>
            </div>
        </ManagerFormModal>
    );
}
