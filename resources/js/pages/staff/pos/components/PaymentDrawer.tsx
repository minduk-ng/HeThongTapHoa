import React, { useState, useEffect } from 'react';
import { Banknote, QrCode, X, Printer, CalendarClock, Tag, Ticket, ChevronDown, Check } from 'lucide-react';
import { POSTableData, CartItem, ReservationDraft, PromotionCandidate } from '../types/pos.types';
import { useSubmitGuard } from '../../../../hooks/useSubmitGuard';

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    selectedTable: POSTableData | null;
    cartItems: CartItem[];
    mode: 'payment' | 'deposit' | 'reservation';
    orderCodes?: string[];
    depositTotal?: number;
    reservationDraft?: ReservationDraft | null;
    promotions: PromotionCandidate[];
    selectedAutoId: number | null;
    onSelectAuto: (id: number | null) => void;
    appliedPromotions: { id: number; name: string; code: string | null; discount_amount: number }[];
    totalDiscount: number;
    onApplyPromotion?: (code: string, subtotal: number, items: { menu_item_id: number; quantity: number; unit_price: number }[]) => Promise<{ ok: boolean; discount_amount?: number; total?: number; error?: string }>;
    onClearPromotion?: () => void;
    onConfirmPayment: (paymentMethod: 'cash' | 'bank_transfer', amountReceived: number, changeAmount: number, shouldPrint: boolean) => void;
    onConfirmDeposit?: (amount: number, method: 'cash' | 'bank_transfer') => Promise<void> | void;
    onConfirmReservation?: (deposit: { amount: number; method: 'cash' | 'bank_transfer' } | null) => Promise<void> | void;
    submitting: boolean;
}

export default function PaymentDrawer({
    isOpen,
    onClose,
    selectedTable,
    cartItems,
    mode,
    orderCodes = [],
    depositTotal = 0,
    reservationDraft,
    promotions,
    selectedAutoId,
    onSelectAuto,
    appliedPromotions,
    totalDiscount,
    onApplyPromotion,
    onClearPromotion,
    onConfirmPayment,
    onConfirmDeposit,
    onConfirmReservation,
    submitting,
}: PaymentDrawerProps) {
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
    const [amountReceived, setAmountReceived] = useState<number>(0);
    const [promotionInput, setPromotionInput] = useState('');
    const [promotionError, setPromotionError] = useState<string | null>(null);
    const [promotionLoading, setPromotionLoading] = useState(false);
    const [showCouponInput, setShowCouponInput] = useState(false);
    const { isSubmitting, guard } = useSubmitGuard();

    const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    // VAT trong giá: thuế nằm trong line, không cộng thêm vào payable (giá đã gồm thuế).
    const vatInTotal = cartItems.reduce((sum, item) => {
        const line = item.quantity * item.unit_price;
        const rate = item.vat_rate || 0;

        if (rate <= 0) {
            return sum;
        }

        const net = Math.floor(line / (1 + rate / 100));

        return sum + (line - net);
    }, 0);
    const totalAmount = subtotal;

    const discountedTotal = Math.max(0, totalAmount - totalDiscount);
    const payable = Math.max(0, discountedTotal - depositTotal);
    const depositRefund = Math.max(0, depositTotal - discountedTotal);

    useEffect(() => {
        if (isOpen) {
            setPaymentMethod('cash');
            setPromotionInput('');
            setPromotionError(null);
            setShowCouponInput(false);
            if (mode === 'payment') {
                setAmountReceived(payable);
            } else if (mode === 'deposit') {
                setAmountReceived(totalAmount);
            } else if (mode === 'reservation') {
                setAmountReceived(0);
            }
        }
    }, [isOpen, mode, payable, totalAmount]);

    const calculatePresets = (total: number) => {
        if (total <= 0) return [0];
        const presets = [total];
        let nextRound = Math.ceil(total / 50000) * 50000;
        if (nextRound === total) nextRound += 50000;
        if (!presets.includes(nextRound)) presets.push(nextRound);
        const bigRound1 = Math.ceil(total / 100000) * 100000;
        if (!presets.includes(bigRound1) && bigRound1 > total) presets.push(bigRound1);
        const bigRound2 = 200000;
        if (!presets.includes(bigRound2) && bigRound2 > total) presets.push(bigRound2);
        const bigRound3 = 500000;
        if (!presets.includes(bigRound3) && bigRound3 > total) presets.push(bigRound3);
        return presets.slice(0, 4);
    };

    const cashPresets = mode === 'payment' ? calculatePresets(payable) : [100000, 200000, 500000, totalAmount];
    const changeAmount = mode === 'payment' ? Math.max(0, amountReceived - payable) + depositRefund : 0;
    const promotionApplied = appliedPromotions.some((ap) => ap.code !== null);

    const handlePromotion = async () => {
        const code = promotionInput.trim();
        if (!code || !onApplyPromotion || promotionLoading) return;

        setPromotionLoading(true);
        setPromotionError(null);
        const result = await onApplyPromotion(
            code,
            totalAmount,
            cartItems.map((item) => ({
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
            })),
        );
        if (!result.ok) {
            setPromotionError(result.error || 'Mã khuyến mãi không hợp lệ.');
        }
        setPromotionLoading(false);
    };

    const handleConfirm = async (shouldPrint: boolean) => {
        if (mode === 'payment') {
            const finalReceived = paymentMethod === 'bank_transfer' ? payable : amountReceived;
            const finalChange = paymentMethod === 'bank_transfer' ? depositRefund : changeAmount;
            onConfirmPayment(paymentMethod, finalReceived, finalChange, shouldPrint);
        } else if (mode === 'deposit') {
            if (onConfirmDeposit) {
                await guard(async () => {
                    await onConfirmDeposit(amountReceived, paymentMethod);
                });
            }
        } else if (mode === 'reservation') {
            if (onConfirmReservation) {
                const depositData = amountReceived > 0 ? { amount: amountReceived, method: paymentMethod } : null;
                await guard(async () => {
                    await onConfirmReservation(depositData);
                });
            }
        }
    };

    const itemsByOrder = cartItems.reduce((acc, item) => {
        const code = item.orderCode || 'Chưa gửi bếp';
        if (!acc[code]) acc[code] = [];
        acc[code].push(item);
        return acc;
    }, {} as Record<string, CartItem[]>);

    if (!isOpen || !selectedTable) return null;

    return (
        <div className="fixed inset-0 z-[100] overflow-hidden flex justify-end">
            {/* Backdrop Overlay */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Sliding Drawer - Expanded Width */}
            <div className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 h-full border-l border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between shrink-0">
                    <div>
                        <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider block">
                            {mode === 'payment' && 'Thanh toán đơn hàng'}
                            {mode === 'deposit' && 'Đặt cọc đơn hàng'}
                            {mode === 'reservation' && 'Đặt bàn mới'}
                        </span>
                        <h2 className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span>{selectedTable.table_number}</span>
                            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                ({selectedTable.area || 'Trong nhà'})
                            </span>
                            {orderCodes.length > 0 && mode !== 'reservation' && (
                                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">
                                    {orderCodes.join(', ')}
                                </span>
                            )}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <X className="w-5 h-5 stroke-[1.5]" />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden">
                    <div className="grid grid-cols-12 h-full">
                        {/* Cột trái: CHỈ HIỂN THỊ DANH SÁCH MÓN (Full Height - 6/12) */}
                        <div className="col-span-6 border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col min-h-0 bg-zinc-50/40 dark:bg-zinc-900/40">
                            {/* Column Subheader */}
                            <div className="px-5 py-2.5 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider shrink-0 bg-zinc-100/50 dark:bg-zinc-800/30">
                                <span>Món đã chọn ({cartItems.reduce((s, i) => s + i.quantity, 0)})</span>
                                <span>Thành tiền</span>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                                {cartItems.length === 0 ? (
                                    <div className="text-center text-sm text-zinc-400 dark:text-zinc-500 py-16">
                                        Chưa có món nào được chọn
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {Object.entries(itemsByOrder).map(([code, items]) => (
                                            <div key={code} className="space-y-2">
                                                {orderCodes.length > 1 && (
                                                    <div className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                                                        {code}
                                                    </div>
                                                )}
                                                <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 bg-white dark:bg-zinc-850 rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 overflow-hidden shadow-xs">
                                                    {items.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center px-4 py-3.5 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40">
                                                            <div className="flex-1 pr-3 min-w-0">
                                                                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                                                    {item.name}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-bold tabular-nums text-xs border border-sky-200/60 dark:border-sky-800/60">
                                                                        x{item.quantity}
                                                                    </span>
                                                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                                                                        {item.unit_price.toLocaleString('vi-VN')} đ
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tabular-nums shrink-0">
                                                                {(item.quantity * item.unit_price).toLocaleString('vi-VN')} đ
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Cột phải: Tài chính, Khuyến mãi/Voucher, Phương thức & Thanh toán (6/12) */}
                        <div className="col-span-6 px-6 py-4 flex flex-col justify-between overflow-y-auto space-y-4 bg-white dark:bg-zinc-900">
                            <div className="space-y-3.5">
                                {/* Reservation info if mode === reservation */}
                                {mode === 'reservation' && reservationDraft && (
                                    <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-xl p-3.5 space-y-1 text-xs">
                                        <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-bold mb-1">
                                            <CalendarClock className="w-4 h-4 stroke-[1.5]" />
                                            <span>Thông tin đặt trước</span>
                                        </div>
                                        <div className="text-zinc-700 dark:text-zinc-300">
                                            <span className="font-semibold">Khách:</span> {reservationDraft.name} ({reservationDraft.phone})
                                        </div>
                                        <div className="text-zinc-700 dark:text-zinc-300">
                                            <span className="font-semibold">Thời gian:</span> {reservationDraft.time.replace('T', ' ')}
                                        </div>
                                        {reservationDraft.note && (
                                            <div className="text-zinc-500 dark:text-zinc-400 italic">
                                                Ghi chú: {reservationDraft.note}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Financial Summary Card */}
                                {mode !== 'reservation' && (
                                    <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/40 dark:from-sky-950/40 dark:to-sky-900/20 border border-sky-200/80 dark:border-sky-800/60 space-y-2.5">
                                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                                            <div className="flex justify-between">
                                                <span>Tiền món:</span>
                                                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                                                    {subtotal.toLocaleString('vi-VN')} đ
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>VAT (gồm):</span>
                                                <span className="tabular-nums font-medium">
                                                    {vatInTotal.toLocaleString('vi-VN')} đ
                                                </span>
                                            </div>
                                            {mode === 'payment' && totalDiscount > 0 && (
                                                <div className="flex justify-between text-rose-600 dark:text-rose-400 col-span-2">
                                                    <span>Giảm giá khuyến mãi:</span>
                                                    <span className="font-bold tabular-nums">
                                                        −{totalDiscount.toLocaleString('vi-VN')} đ
                                                    </span>
                                                </div>
                                            )}
                                            {mode === 'payment' && depositTotal > 0 && (
                                                <div className="flex justify-between text-purple-600 dark:text-purple-400 col-span-2">
                                                    <span>Đã đặt cọc trước:</span>
                                                    <span className="font-bold tabular-nums">
                                                        −{depositTotal.toLocaleString('vi-VN')} đ
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-2.5 border-t border-sky-200/60 dark:border-sky-800/50 flex items-baseline justify-between">
                                            <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                                                Khách cần trả:
                                            </span>
                                            <span className="font-display text-3xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                                                {payable.toLocaleString('vi-VN')} đ
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {mode === 'payment' && depositRefund > 0 && (
                                    <div className="flex justify-between items-center py-2.5 px-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-xl text-xs">
                                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                            Hoàn tiền cọc thừa:
                                        </span>
                                        <span className="font-display text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                            {depositRefund.toLocaleString('vi-VN')} đ
                                        </span>
                                    </div>
                                )}

                                {/* Khuyến mãi & Voucher ở Cột Phải */}
                                {mode === 'payment' && onApplyPromotion && (
                                    <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                                <Ticket className="h-3.5 w-3.5 text-sky-600 stroke-[1.5]" />
                                                <span>Chương trình khuyến mãi</span>
                                            </label>
                                            {!showCouponInput && !promotionApplied && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCouponInput(true)}
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 transition-colors"
                                                >
                                                    <Tag className="w-3 h-3 stroke-[1.5]" />
                                                    <span>+ Thêm mã coupon/voucher</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Dropdown chương trình khuyến mãi tự động (Mặc định hiển thị) */}
                                        <div className="relative">
                                            <select
                                                value={selectedAutoId ?? 0}
                                                onChange={(e) => onSelectAuto(e.target.value ? Number(e.target.value) : 0)}
                                                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs appearance-none focus:border-sky-500 outline-none text-zinc-900 dark:text-zinc-100 transition-colors"
                                            >
                                                <option value={0}>Không áp dụng chương trình</option>
                                                {promotions.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.name} {p.estimated_discount > 0 ? `(−${p.estimated_discount.toLocaleString('vi-VN')}đ)` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                                                <ChevronDown className="w-4 h-4 stroke-[1.5]" />
                                            </span>
                                        </div>

                                        {/* Ô nhập mã Voucher khi mở rộng hoặc khi đã áp dụng */}
                                        {(showCouponInput || promotionApplied) && (
                                            <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                                                <div className="flex gap-2">
                                                    <input
                                                        value={promotionInput}
                                                        onChange={(e) => setPromotionInput(e.target.value.toUpperCase())}
                                                        disabled={promotionApplied}
                                                        placeholder="NHẬP MÃ VOUCHER..."
                                                        className="min-w-0 flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-semibold uppercase placeholder:normal-case placeholder:font-normal outline-none focus:border-sky-500 text-zinc-900 dark:text-zinc-100"
                                                    />
                                                    {promotionApplied ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onClearPromotion?.();
                                                                setPromotionInput('');
                                                                setPromotionError(null);
                                                                setShowCouponInput(false);
                                                            }}
                                                            className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                                                        >
                                                            Hủy mã
                                                        </button>
                                                    ) : (
                                                        <div className="flex gap-1.5 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={handlePromotion}
                                                                disabled={promotionLoading || promotionInput.trim() === ''}
                                                                className="rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-sky-700 transition-colors"
                                                            >
                                                                {promotionLoading ? '...' : 'Áp dụng'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setShowCouponInput(false);
                                                                    setPromotionError(null);
                                                                }}
                                                                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/60 dark:hover:bg-zinc-700 transition-colors"
                                                                title="Đóng ô nhập mã"
                                                            >
                                                                <X className="w-3.5 h-3.5 stroke-[1.5]" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                {promotionError && (
                                                    <p className="text-xs text-rose-500">{promotionError}</p>
                                                )}
                                            </div>
                                        )}

                                        {appliedPromotions.length > 0 && (
                                            <div className="space-y-1 pt-1.5 border-t border-zinc-200/60 dark:border-zinc-700/60">
                                                {appliedPromotions.map((ap, i) => (
                                                    <div key={i} className="flex justify-between text-xs text-rose-600 dark:text-rose-400">
                                                        <span className="truncate pr-1">{ap.name}</span>
                                                        <span className="tabular-nums font-semibold shrink-0">−{ap.discount_amount.toLocaleString('vi-VN')} đ</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Payment Method Segmented Buttons */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 block uppercase tracking-wider">
                                        Phương thức thanh toán
                                    </label>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPaymentMethod('cash');
                                                if (mode === 'payment') setAmountReceived(payable);
                                                else if (mode === 'deposit') setAmountReceived(totalAmount);
                                            }}
                                            className={`py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                                                paymentMethod === 'cash'
                                                    ? 'border-sky-600 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 shadow-xs ring-1 ring-sky-600'
                                                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            <Banknote className="w-4 h-4 stroke-[1.5]" />
                                            <span>Tiền mặt</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setPaymentMethod('bank_transfer')}
                                            className={`py-2.5 px-4 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                                                paymentMethod === 'bank_transfer'
                                                    ? 'border-sky-600 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 shadow-xs ring-1 ring-sky-600'
                                                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            <QrCode className="w-4 h-4 stroke-[1.5]" />
                                            <span>Chuyển khoản</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Content: Cash */}
                                {paymentMethod === 'cash' && (
                                    <div className="space-y-3 animate-in fade-in duration-150">
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block">
                                                {mode === 'reservation' ? 'Tiền cọc giữ bàn (đ):' : 'Số tiền khách đưa (đ):'}
                                            </label>
                                            <input
                                                type="number"
                                                value={amountReceived || ''}
                                                onChange={(e) => setAmountReceived(Number(e.target.value))}
                                                placeholder="Nhập số tiền..."
                                                className="w-full px-3.5 py-2.5 text-lg font-bold text-center border rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:border-sky-500 outline-none tabular-nums"
                                            />
                                        </div>

                                        {(mode === 'payment' || mode === 'deposit') && (
                                            <div className="grid grid-cols-4 gap-2">
                                                {cashPresets.map((preset, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setAmountReceived(preset)}
                                                        className={`py-2 px-1 border rounded-xl text-xs font-bold transition-all text-center tabular-nums ${
                                                            amountReceived === preset
                                                                ? 'border-sky-600 bg-sky-600 text-white shadow-xs'
                                                                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                                        }`}
                                                    >
                                                        {(preset / 1000).toFixed(0)}k
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {mode === 'payment' && (
                                            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex justify-between items-center text-xs font-semibold">
                                                <span className="text-emerald-800 dark:text-emerald-300">
                                                    Tiền thừa trả khách:
                                                </span>
                                                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums font-display">
                                                    {changeAmount.toLocaleString('vi-VN')} đ
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Content: Bank Transfer */}
                                {paymentMethod === 'bank_transfer' && (
                                    <div className="space-y-3 animate-in fade-in duration-150 text-center">
                                        {mode === 'reservation' && (
                                            <div className="space-y-1 text-left mb-2">
                                                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block">
                                                    Tiền cọc chuyển khoản (đ):
                                                </label>
                                                <input
                                                    type="number"
                                                    value={amountReceived || ''}
                                                    onChange={(e) => setAmountReceived(Number(e.target.value))}
                                                    placeholder="Nhập số tiền cọc..."
                                                    className="w-full px-3 py-2 text-sm font-bold border rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700 focus:border-sky-500 outline-none tabular-nums"
                                                />
                                            </div>
                                        )}

                                        {((mode === 'reservation' && amountReceived > 0) || mode !== 'reservation') && (() => {
                                            const qrAmount = Math.max(0, Math.round(mode === 'payment' ? payable : amountReceived));
                                            const tableLabel = selectedTable ? selectedTable.table_number : '';
                                            const addInfo = `${mode === 'payment' ? 'Thanh toan' : 'Dat coc'} ${tableLabel}`.trim();
                                            const vietQrUrl = `https://img.vietqr.io/image/970422-0368192905-qr_only.png?amount=${qrAmount}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent('NGUYEN MINH DUC')}`;

                                            return (
                                                <div className="p-3.5 border border-zinc-200/80 dark:border-zinc-700/80 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 flex flex-col items-center">
                                                    <div className="p-2 bg-white rounded-xl shadow-xs border border-zinc-200 mb-2">
                                                        <img
                                                            key={vietQrUrl}
                                                            src={vietQrUrl}
                                                            alt="Mã VietQR"
                                                            className="w-44 h-44 object-contain rounded-lg"
                                                            onError={(e) => {
                                                                (e.target as HTMLElement).style.display = 'none';
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="text-xs space-y-1 text-zinc-600 dark:text-zinc-300 font-medium text-center">
                                                        <p><span className="text-zinc-400">MBBank:</span> <strong className="tabular-nums">0368192905</strong> — NGUYEN MINH DUC</p>
                                                        <p><span className="text-zinc-400">Số tiền:</span> <strong className="text-sky-600 dark:text-sky-400 tabular-nums">{qrAmount.toLocaleString('vi-VN')} đ</strong></p>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="px-6 py-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40 shrink-0">
                    {mode === 'payment' && (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                disabled={submitting || isSubmitting || (paymentMethod === 'cash' && amountReceived < payable)}
                                onClick={() => handleConfirm(true)}
                                className="py-3 px-4 text-xs font-bold text-sky-600 dark:text-sky-400 bg-white dark:bg-zinc-800 border border-sky-300 dark:border-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center space-x-1.5 active:scale-95"
                            >
                                <Printer className="w-4 h-4 stroke-[1.5]" />
                                <span>{submitting ? 'Đang lưu...' : 'In phiếu K80'}</span>
                            </button>
                            <button
                                type="button"
                                disabled={submitting || isSubmitting || (paymentMethod === 'cash' && amountReceived < payable)}
                                onClick={() => handleConfirm(false)}
                                className="py-3 px-4 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs disabled:opacity-40 transition-colors flex items-center justify-center space-x-1.5 active:scale-95"
                            >
                                <Check className="w-4 h-4 stroke-2" />
                                <span>{submitting ? 'Đang lưu...' : 'Xác nhận thanh toán'}</span>
                            </button>
                        </div>
                    )}

                    {mode === 'deposit' && (
                        <button
                            type="button"
                            disabled={submitting || isSubmitting || amountReceived <= 0}
                            onClick={() => handleConfirm(false)}
                            className="w-full py-3 px-4 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs disabled:opacity-40 transition-colors flex items-center justify-center space-x-1.5 active:scale-95"
                        >
                            <Banknote className="w-4 h-4 stroke-[1.5]" />
                            <span>{submitting ? 'Đang lưu...' : 'Xác nhận đặt cọc'}</span>
                        </button>
                    )}

                    {mode === 'reservation' && (
                        <button
                            type="button"
                            disabled={submitting || isSubmitting}
                            onClick={() => handleConfirm(false)}
                            className="w-full py-3 px-4 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs disabled:opacity-40 transition-colors flex items-center justify-center space-x-1.5 active:scale-95"
                        >
                            <CalendarClock className="w-4 h-4 stroke-[1.5]" />
                            <span>{submitting ? 'Đang lưu...' : 'Hoàn tất đặt bàn'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
