import { useEffect, useState } from 'react';
import { router } from '@inertiajs/react';
import { X, Plus, Shuffle, Download } from 'lucide-react';
import DatePicker from '../../../../components/DatePicker';
import PromotionActionsEditor, { ActionRow } from './PromotionActionsEditor';
import PromotionConditionsEditor, { ConditionRow } from './PromotionConditionsEditor';
import PromotionPreview from './PromotionPreview';
import { exportXLSX } from '../../../../components/reports/reportExport';
import { PromotionData } from '../PromotionsManager';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotionToEdit: PromotionData | null;
    menuItems: { id: number; name: string }[];
    menuCategories: { id: number; name: string }[];
}

const randomCode = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

const DAYS = [
    { v: 0, l: 'CN' }, { v: 1, l: 'T2' }, { v: 2, l: 'T3' }, { v: 3, l: 'T4' },
    { v: 4, l: 'T5' }, { v: 5, l: 'T6' }, { v: 6, l: 'T7' },
];

interface SlotRow { days: number[]; start: string; end: string; }

export default function PromotionFormDrawer({ isOpen, onClose, promotionToEdit, menuItems, menuCategories }: Props) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'promotion' | 'coupon' | 'voucher'>('promotion');
    const [code, setCode] = useState('');
    const [startDate, setStartDate] = useState<string | null>(null);
    const [endDate, setEndDate] = useState<string | null>(null);
    const [status, setStatus] = useState(true);
    const [maxUsage, setMaxUsage] = useState('');
    const [targetUsage, setTargetUsage] = useState('');
    const [exclusive, setExclusive] = useState(false);
    const [actions, setActions] = useState<ActionRow[]>([{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
    const [conditions, setConditions] = useState<ConditionRow[]>([]);
    const [codePrefix, setCodePrefix] = useState('');
    const [codeQuantity, setCodeQuantity] = useState('');
    const [codeRandom, setCodeRandom] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [timeSlots, setTimeSlots] = useState<SlotRow[]>([]);

    const updateSlot = (i: number, patch: Partial<SlotRow>) =>
        setTimeSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    const addSlot = () => setTimeSlots((prev) => [...prev, { days: [], start: '11:00', end: '13:00' }]);
    const removeSlot = (i: number) => setTimeSlots((prev) => prev.filter((_, idx) => idx !== i));
    const toggleDay = (i: number, d: number) => {
        setTimeSlots((prev) => prev.map((s, idx) => {
            if (idx !== i) return s;
            const has = s.days.includes(d);
            return { ...s, days: has ? s.days.filter((x) => x !== d) : [...s.days, d].sort() };
        }));
    };

    useEffect(() => {
        setErrors({});
        const toYmd = (v: string | null) => {
            if (!v) return null;
            const parts = v.split('/');  // d/m/Y from controller
            if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
            return v;
        };
        if (promotionToEdit) {
            setName(promotionToEdit.name); setType(promotionToEdit.type); setCode(promotionToEdit.code || '');
            setStartDate(toYmd(promotionToEdit.start_date || null)); setEndDate(toYmd(promotionToEdit.end_date || null));
            setStatus(promotionToEdit.status);
            setMaxUsage(promotionToEdit.max_usage === null ? '' : String(promotionToEdit.max_usage));
            setTargetUsage(promotionToEdit.target_usage === null ? '' : String(promotionToEdit.target_usage));
            setExclusive(!promotionToEdit.stackable);
            setActions(promotionToEdit.actions.length ? promotionToEdit.actions.map((a) => ({
                action_type: a.action_type, action_value: String(a.action_value),
                max_discount_amount: a.max_discount_amount === null ? '' : String(a.max_discount_amount),
            })) : [{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
            setConditions(promotionToEdit.conditions.map((c) => ({ cond_type: c.cond_type, cond_value: c.cond_value })));
            setCodePrefix(promotionToEdit.code_prefix || '');
            setCodeQuantity(promotionToEdit.code_quantity === null ? '' : String(promotionToEdit.code_quantity));
            setCodeRandom(promotionToEdit.code_random);
            setTimeSlots((promotionToEdit.time_slots ?? []).map((s) => ({
                days: [s.day_of_week],
                start: s.start_time.slice(0, 5),
                end: s.end_time.slice(0, 5),
            })));
        } else {
            setName(''); setType('promotion'); setCode(''); setStartDate(null); setEndDate(null);
            setStatus(true); setMaxUsage(''); setTargetUsage(''); setExclusive(false);
            setActions([{ action_type: 'discount_percent', action_value: '', max_discount_amount: '' }]);
            setConditions([]);
            setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false);
            setTimeSlots([]);
        }
    }, [promotionToEdit, isOpen]);

    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        if (!promotionToEdit || exporting || promotionToEdit.codes_count <= 0) return;
        setExporting(true);
        try {
            const res = await fetch(`/manager/promotions/${promotionToEdit.id}/codes?export=1`, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error('fail');
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
            // im lặng — modal danh sách mã có error state riêng
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) return null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        // free_product bắt buộc chọn món — không cho lưu nếu blank
        const blankFreeProduct = actions.some((a) => a.action_type === 'free_product' && !a.action_value);
        if (blankFreeProduct) {
            setErrors((prev) => ({ ...prev, actions: 'Món tặng (free_product) phải chọn món cụ thể.' }));
            return;
        }

        setSubmitting(true);
        const isBatch = codePrefix !== '' || codeQuantity !== '';
        const payload = {
            name, type,
            code: type === 'promotion' || type === 'voucher' || isBatch ? null : (code.toUpperCase() || null),
            start_date: startDate || null, end_date: endDate || null,
            status, max_usage: codePrefix ? null : (maxUsage === '' ? null : Number(maxUsage)),
            target_usage: targetUsage === '' ? null : Number(targetUsage),
            stackable: !exclusive,
            code_prefix: code !== '' ? null : (codePrefix || null),
            code_quantity: code !== '' ? null : (codeQuantity === '' ? null : Number(codeQuantity)),
            code_random: type === 'voucher' ? true : (code !== '' ? false : codeRandom),
            conditions: conditions.map((c) => ({ cond_type: c.cond_type, cond_value: c.cond_value })),
            actions: actions.map((a) => ({
                action_type: a.action_type,
                action_value: Number(a.action_value) || 0,
                max_discount_amount: a.action_type === 'discount_percent' && a.max_discount_amount !== '' ? Number(a.max_discount_amount) : null,
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

    const inputCls = 'w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto p-6">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-5">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {promotionToEdit ? 'Cập nhật khuyến mãi' : 'Thêm mới chương trình khuyến mãi'}
                    </h3>
                    <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left: form fields */}
                    <div className="lg:col-span-8 space-y-5">
                        {/* Thông tin chung */}
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Thông tin chung</h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tên chương trình <span className="text-rose-500">*</span></label>
                                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Khai xuân đón lộc" className={inputCls} />
                                    {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Loại hình <span className="text-rose-500">*</span></label>
                                        <select value={type} onChange={(e) => {
                                            const t = e.target.value as 'promotion' | 'coupon' | 'voucher';
                                            setType(t);

                                            if (t === 'voucher') {
                                                setCode(''); setCodeRandom(true);
                                            } else if (t === 'coupon') {
                                                setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false);
                                            }
                                        }} className={inputCls}>
                                            <option value="promotion">Khuyến mãi tự động (Promotion)</option>
                                            <option value="coupon">Mã giảm giá (Coupon) — dùng chung, nhập 1 mã</option>
                                            <option value="voucher">Mã quà tặng (Voucher) — mỗi khách 1 mã riêng</option>
                                        </select>
                                        {promotionToEdit && (
                                            (type === 'coupon' && (codePrefix !== '' || codeQuantity !== '')) ||
                                            (type === 'voucher' && code !== '') ||
                                            (type === 'voucher' && !codeRandom)
                                        ) && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                                Cấu hình này không khớp với loại {type === 'coupon' ? 'Coupon (chỉ mã đơn)' : 'Voucher (bắt buộc mã ngẫu nhiên hàng loạt)'}. Bản ghi cũ vẫn lưu được.
                                            </p>
                                        )}
                                    </div>
                                    {type === 'coupon' && (
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Mã Code <span className="text-rose-500">*</span></label>
                                            <div className="flex gap-2">
                                                <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false); }} placeholder="Nhập mã hoặc tạo ngẫu nhiên" className={inputCls} />
                                                <button type="button" onClick={() => { setCode(randomCode()); setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false); }} title="Tạo mã ngẫu nhiên"
                                                    className="px-3 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                                    <Shuffle className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {errors.code && <p className="text-xs text-rose-500 mt-1">{errors.code}</p>}
                                            {errors.code_prefix && <p className="text-xs text-rose-500 mt-1">{errors.code_prefix}</p>}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Từ ngày</label>
                                        <DatePicker mode="single" className="w-full justify-start" value={startDate ? startDate.slice(0, 10) : null} onChange={(v) => setStartDate(v ?? '')} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Đến ngày</label>
                                        <DatePicker mode="single" className="w-full justify-start" value={endDate ? endDate.slice(0, 10) : null} onChange={(v) => setEndDate(v ?? '')} />
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Cấu hình giảm giá */}
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Cấu hình giảm giá</h4>
                            <PromotionActionsEditor actions={actions} onChange={setActions} menuItems={menuItems} />
                            {errors.actions && <p className="text-xs text-rose-500 mt-1">{errors.actions}</p>}
                        </section>

                        {/* Điều kiện & Giới hạn */}
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Điều kiện &amp; Giới hạn</h4>
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {type !== 'voucher' && (
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tổng số lượt sử dụng tối đa</label>
                                            <input type="number" value={maxUsage} onChange={(e) => setMaxUsage(e.target.value)} placeholder="Không giới hạn" className={inputCls} />
                                        </div>
                                    )}
                                    {type === 'promotion' && (
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Mục tiêu (số lượt dùng)</label>
                                            <input type="number" value={targetUsage} onChange={(e) => setTargetUsage(e.target.value)} placeholder="Để tính hiệu suất" className={inputCls} />
                                        </div>
                                    )}
                                </div>
                                <PromotionConditionsEditor conditions={conditions} onChange={setConditions} menuItems={menuItems} menuCategories={menuCategories} />
                                {type === 'voucher' && (
                                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                                        <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Phát hành mã hàng loạt</h5>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Chuỗi tiền tố</label>
                                                <input value={codePrefix} onChange={(e) => { setCodePrefix(e.target.value.toUpperCase()); setCode(''); }}
                                                    placeholder="VD: DK" className={inputCls} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Số lượng mã</label>
                                                <input type="number" min={1} max={100000} value={codeQuantity} onChange={(e) => { setCodeQuantity(e.target.value); setCode(''); }}
                                                    placeholder="VD: 100" className={inputCls} />
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                            <input type="checkbox" checked={codeRandom} disabled className="h-4 w-4 accent-sky-600" />
                                            Mã ngẫu nhiên (mỗi mã dùng 1 lần — voucher)
                                        </label>
                                        <p className="text-[11px] text-zinc-500">
                                            Hệ thống tự sinh {codeQuantity || 'N'} mã ngẫu nhiên khác nhau không trùng (VD: {codePrefix || 'DK'}12345…).
                                        </p>
                                        {promotionToEdit && promotionToEdit.codes_count > 0 && (
                                            <p className="text-[11px] font-medium text-zinc-600">
                                                Đã tạo: {promotionToEdit.codes_count} mã · Đã dùng: {promotionToEdit.codes_used}
                                            </p>
                                        )}
                                        {errors.code_prefix && <p className="text-xs text-rose-500">{errors.code_prefix}</p>}
                                    </div>
                                )}
                                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                                    <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Khung giờ vàng (tùy chọn)</h5>
                                    <p className="text-[11px] text-zinc-500">Chỉ áp dụng khi thời điểm thanh toán nằm trong khung giờ đã chọn. Để trống = áp dụng mọi lúc.</p>
                                    {timeSlots.map((slot, i) => (
                                        <div key={i} className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                {DAYS.map((d) => (
                                                    <button key={d.v} type="button" onClick={() => toggleDay(i, d.v)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                                            slot.days.includes(d.v)
                                                                ? 'bg-sky-600 text-white'
                                                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                                                        }`}>
                                                        {d.l}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input type="time" value={slot.start} onChange={(e) => updateSlot(i, { start: e.target.value })} className={inputCls + ' !w-auto'} />
                                                <span className="text-xs text-zinc-500">—</span>
                                                <input type="time" value={slot.end} onChange={(e) => updateSlot(i, { end: e.target.value })} className={inputCls + ' !w-auto'} />
                                                <button type="button" onClick={() => removeSlot(i)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {errors[`time_slots.${i}.end_time`] && <p className="text-xs text-rose-500">{errors[`time_slots.${i}.end_time`]}</p>}
                                        </div>
                                    ))}
                                    <button type="button" onClick={addSlot} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                                        <Plus className="w-3.5 h-3.5" /> Thêm khung giờ
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Toggles */}
                        {type !== 'promotion' && (
                            <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1">Độc quyền</label>
                                        <p className="text-xs text-zinc-500">Không áp dụng chung với các chương trình khuyến mãi tự động.</p>
                                    </div>
                                    <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Right: preview */}
                    <div className="lg:col-span-4 lg:sticky lg:top-4 space-y-4">
                        <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">Xem trước (Preview)</h4>
                            <PromotionPreview name={name} type={type} actions={actions} conditions={conditions} endDate={endDate || ''} status={status} />
                        </section>
                        <div className="flex justify-end gap-3">
                            {promotionToEdit && promotionToEdit.codes_count > 0 && (
                                <button type="button" onClick={handleExport} disabled={exporting}
                                    className="px-4 py-2 text-sm font-medium text-sky-600 dark:text-sky-400 border border-sky-300 dark:border-sky-700 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 flex items-center gap-1.5">
                                    <Download className="w-4 h-4 stroke-[1.5]" />
                                    <span>{exporting ? 'Đang xuất...' : 'Export Excel'}</span>
                                </button>
                            )}
                            <button type="button" onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700">Hủy bỏ</button>
                            <button type="submit" disabled={submitting}
                                className="px-5 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50">
                                {submitting ? 'Đang lưu...' : 'Lưu & Kích hoạt'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
