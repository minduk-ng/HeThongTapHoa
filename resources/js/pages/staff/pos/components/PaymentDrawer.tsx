import React, { useState, useEffect } from 'react';
import { Banknote, QrCode, X, Printer, CalendarClock } from 'lucide-react';
import { POSTableData, CartItem, ReservationDraft } from '../types/pos.types';

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    selectedTable: POSTableData | null;
    cartItems: CartItem[];
    mode: 'payment' | 'deposit' | 'reservation';
    orderCodes?: string[];
    depositTotal?: number;
    reservationDraft?: ReservationDraft | null;
    onConfirmPayment: (paymentMethod: 'cash' | 'bank_transfer', amountReceived: number, changeAmount: number, shouldPrint: boolean) => void;
    onConfirmDeposit?: (amount: number, method: 'cash' | 'bank_transfer') => void;
    onConfirmReservation?: (deposit: { amount: number; method: 'cash' | 'bank_transfer' } | null) => void;
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
    onConfirmPayment,
    onConfirmDeposit,
    onConfirmReservation,
    submitting,
}: PaymentDrawerProps) {
    if (!isOpen || !selectedTable) return null;

    const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const vatTotal = cartItems.reduce((sum, item) => {
        const itemSubtotal = item.quantity * item.unit_price;
        return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
    }, 0);
    const totalAmount = subtotal + vatTotal;

    const payable = Math.max(0, totalAmount - depositTotal);
    const depositRefund = Math.max(0, depositTotal - totalAmount);

    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
    const [amountReceived, setAmountReceived] = useState<number>(mode === 'payment' ? payable : (mode === 'deposit' ? totalAmount : 0));

    useEffect(() => {
        if (isOpen) {
            setPaymentMethod('cash');
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
    const changeAmount = mode === 'payment' ? Math.max(0, amountReceived - payable) : 0;

    const handleConfirm = (shouldPrint: boolean) => {
        if (mode === 'payment') {
            const finalReceived = paymentMethod === 'bank_transfer' ? payable : amountReceived;
            const finalChange = paymentMethod === 'bank_transfer' ? 0 : changeAmount;
            onConfirmPayment(paymentMethod, finalReceived, finalChange, shouldPrint);
        } else if (mode === 'deposit') {
            if (onConfirmDeposit) onConfirmDeposit(amountReceived, paymentMethod);
        } else if (mode === 'reservation') {
            if (onConfirmReservation) {
                const depositData = amountReceived > 0 ? { amount: amountReceived, method: paymentMethod } : null;
                onConfirmReservation(depositData);
            }
        }
    };

    const itemsByOrder = cartItems.reduce((acc, item) => {
        const code = item.orderCode || 'Chưa gửi bếp';
        if (!acc[code]) acc[code] = [];
        acc[code].push(item);
        return acc;
    }, {} as Record<string, CartItem[]>);

    return (
        <div className="fixed inset-0 z-[100] overflow-hidden flex justify-end">
            {/* Backdrop Overlay */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Sliding Drawer */}
            <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 h-full border-l border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="p-5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 block">
                            {mode === 'payment' && 'Thanh toán đơn hàng'}
                            {mode === 'deposit' && 'Đặt cọc đơn hàng'}
                            {mode === 'reservation' && 'Đặt bàn mới'}
                        </span>
                        <h2 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            {selectedTable.table_number} ({selectedTable.area || 'Trong nhà'})
                            {orderCodes.length > 0 && mode !== 'reservation' && (
                                <span className="text-sm font-semibold text-zinc-500">
                                    — {orderCodes.join(', ')}
                                </span>
                            )}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-colors duration-150"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden">
                    <div className="grid grid-cols-2 h-full">
                        {/* Cột trái: Danh sách món */}
                        <div className="border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Chi tiết món</h3>
                            {cartItems.length === 0 ? (
                                <div className="text-center text-sm text-zinc-500 dark:text-zinc-400 py-10">
                                    Chưa chọn món
                                </div>
                            ) : (
                                Object.entries(itemsByOrder).map(([code, items]) => (
                                    <div key={code} className="space-y-1.5">
                                        {orderCodes.length > 1 && (
                                            <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase pt-2">
                                                {code}
                                            </div>
                                        )}
                                        <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                                            {items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-start text-sm py-2.5">
                                                    <div className="flex-1 pr-2">
                                                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">{item.name}</div>
                                                        <div className="text-xs text-zinc-500 tabular-nums">
                                                            {item.quantity} × {item.unit_price.toLocaleString('vi-VN')} đ
                                                        </div>
                                                    </div>
                                                    <div className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                                        {(item.quantity * item.unit_price).toLocaleString('vi-VN')} đ
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Cột phải: Thông tin theo mode */}
                        <div className="p-5 flex flex-col space-y-5 overflow-y-auto">
                            {mode === 'reservation' && reservationDraft && (
                                <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 space-y-2">
                                    <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300 font-bold mb-2">
                                        <CalendarClock className="w-4 h-4" />
                                        <span>Thông tin người đặt</span>
                                    </div>
                                    <div className="text-sm text-zinc-800 dark:text-zinc-200">
                                        <span className="font-semibold">Khách hàng:</span> {reservationDraft.name}
                                    </div>
                                    <div className="text-sm text-zinc-800 dark:text-zinc-200">
                                        <span className="font-semibold">Số điện thoại:</span> {reservationDraft.phone}
                                    </div>
                                    <div className="text-sm text-zinc-800 dark:text-zinc-200">
                                        <span className="font-semibold">Thời gian:</span> {reservationDraft.time.replace('T', ' ')}
                                    </div>
                                    {reservationDraft.note && (
                                        <div className="text-sm text-zinc-800 dark:text-zinc-200">
                                            <span className="font-semibold">Ghi chú:</span> {reservationDraft.note}
                                        </div>
                                    )}
                                </div>
                            )}

                            {mode !== 'reservation' && (
                                <div className="bg-sky-50/60 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-900/60 rounded-2xl p-4 space-y-2">
                                    <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                                        <span>Tổng tiền món ({cartItems.reduce((s, i) => s + i.quantity, 0)} món):</span>
                                        <span className="font-semibold tabular-nums">{subtotal.toLocaleString('vi-VN')} đ</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                                        <span>Thuế VAT:</span>
                                        <span className="font-semibold tabular-nums">{vatTotal.toLocaleString('vi-VN')} đ</span>
                                    </div>
                                    {mode === 'payment' && depositTotal > 0 && (
                                        <div className="flex justify-between text-xs text-violet-600 dark:text-violet-400 font-semibold border-t border-sky-200/60 dark:border-sky-800/60 pt-2">
                                            <span>Đã đặt cọc:</span>
                                            <span className="tabular-nums">−{depositTotal.toLocaleString('vi-VN')} đ</span>
                                        </div>
                                    )}
                                    {mode === 'payment' && (
                                        <div className="flex justify-between text-sm font-bold text-zinc-900 dark:text-zinc-100 pt-2 border-t border-sky-200/60 dark:border-sky-800/60">
                                            <span>KHÁCH CẦN TRẢ:</span>
                                            <span className="text-xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                                                {payable.toLocaleString('vi-VN')} đ
                                            </span>
                                        </div>
                                    )}
                                    {mode === 'payment' && depositRefund > 0 && (
                                        <div className="flex justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400 pt-2">
                                            <span>Hoàn khách (cọc thừa):</span>
                                            <span className="text-lg tabular-nums">
                                                {depositRefund.toLocaleString('vi-VN')} đ
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Payment Method Tabs */}
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block">
                                    Phương thức thanh toán / cọc
                                </label>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPaymentMethod('cash');
                                            if (mode === 'payment') setAmountReceived(payable);
                                            else if (mode === 'deposit') setAmountReceived(totalAmount);
                                        }}
                                        className={`py-2.5 px-3 text-xs font-semibold rounded-lg transition-colors duration-150 flex items-center justify-center space-x-2 ${
                                            paymentMethod === 'cash'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <Banknote className="w-4 h-4 stroke-[1.5]" />
                                        <span>Tiền mặt</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod('bank_transfer')}
                                        className={`py-2.5 px-3 text-xs font-semibold rounded-lg transition-colors duration-150 flex items-center justify-center space-x-2 ${
                                            paymentMethod === 'bank_transfer'
                                                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                        }`}
                                    >
                                        <QrCode className="w-4 h-4 stroke-[1.5]" />
                                        <span>Chuyển khoản</span>
                                    </button>
                                </div>
                            </div>

                            {/* Tab 1 Content: Cash */}
                            {paymentMethod === 'cash' && (
                                <div className="space-y-4 animate-in fade-in duration-150">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block">
                                            {mode === 'reservation' ? 'Đặt cọc giữ bàn (đ) (Tùy chọn):' : 'Số tiền (đ):'}
                                        </label>
                                        <input
                                            type="number"
                                            value={amountReceived || ''}
                                            onChange={(e) => setAmountReceived(Number(e.target.value))}
                                            placeholder="Nhập số tiền..."
                                            className="w-full px-3.5 py-2.5 text-base font-bold border rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-sky-500 outline-none tabular-nums"
                                        />
                                    </div>

                                    {(mode === 'payment' || mode === 'deposit') && (
                                        <div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {cashPresets.map((preset, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setAmountReceived(preset)}
                                                        className={`py-2 px-2 border rounded-xl text-xs font-bold transition-all text-center tabular-nums ${
                                                            amountReceived === preset
                                                                ? 'border-sky-600 bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/40'
                                                                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300'
                                                        }`}
                                                    >
                                                        {preset.toLocaleString('vi-VN')} đ
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {mode === 'payment' && (
                                        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex justify-between items-center mt-4">
                                            <div>
                                                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                                                    Tiền thừa trả lại:
                                                </span>
                                            </div>
                                            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                {changeAmount.toLocaleString('vi-VN')} đ
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tab 2 Content: Bank Transfer QR */}
                            {paymentMethod === 'bank_transfer' && (
                                <div className="space-y-4 animate-in fade-in duration-150 text-center">
                                    {mode === 'reservation' && (
                                        <div className="space-y-1.5 text-left mb-4">
                                            <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block">
                                                Đặt cọc giữ bàn qua chuyển khoản (đ):
                                            </label>
                                            <input
                                                type="number"
                                                value={amountReceived || ''}
                                                onChange={(e) => setAmountReceived(Number(e.target.value))}
                                                placeholder="Nhập số tiền cọc..."
                                                className="w-full px-3.5 py-2.5 text-base font-bold border rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-sky-500 outline-none tabular-nums"
                                            />
                                        </div>
                                    )}
                                    
                                    {((mode === 'reservation' && amountReceived > 0) || mode !== 'reservation') && (
                                        <div className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 flex flex-col items-center">
                                            <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">
                                                Quét mã QR Ngân hàng
                                            </span>
                                            <div className="p-2 bg-white rounded-xl shadow-md border border-zinc-200">
                                                <img
                                                    src="/QR_chuyen_khoan/stk_duc.jpg"
                                                    alt="Mã QR"
                                                    className="w-40 h-40 object-contain rounded-lg"
                                                    onError={(e) => {
                                                        (e.target as HTMLElement).style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                            <div className="mt-3 text-xs space-y-1 text-zinc-700 dark:text-zinc-300 font-medium">
                                                <p><span className="font-bold">Chủ TK:</span> NGUYEN MINH DUC</p>
                                                <p><span className="font-bold">Số tiền:</span> <span className="font-black text-sky-600 dark:text-sky-400 tabular-nums">{(mode === 'payment' ? payable : amountReceived).toLocaleString('vi-VN')} đ</span></p>
                                                <p><span className="font-bold">Nội dung:</span> {mode === 'payment' ? 'Thanh toan' : 'Dat coc'} {selectedTable.table_number}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60">
                    {mode === 'payment' && (
                        <div className="grid grid-cols-2 gap-3">                            
                            <button
                                type="button"
                                disabled={submitting || (paymentMethod === 'cash' && amountReceived < payable)}
                                onClick={() => handleConfirm(true)}
                                className="py-2.5 px-4 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
                            >
                                <Printer className="w-4 h-4 stroke-[1.5]" />
                                <span>{submitting ? 'Đang lưu...' : 'In K80'}</span>
                            </button>
                            <button
                                type="button"
                                disabled={submitting || (paymentMethod === 'cash' && amountReceived < payable)}
                                onClick={() => handleConfirm(false)}
                                className="py-2.5 px-4 text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
                            >
                                Xác nhận (Không in)
                            </button>
                        </div>
                    )}

                    {mode === 'deposit' && (
                        <button
                            type="button"
                            disabled={submitting || amountReceived <= 0}
                            onClick={() => handleConfirm(false)}
                            className="w-full py-3 px-4 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-md disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
                        >
                            <Banknote className="w-4 h-4 stroke-[1.5]" />
                            <span>{submitting ? 'Đang lưu...' : 'Xác nhận đặt cọc'}</span>
                        </button>
                    )}

                    {mode === 'reservation' && (
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleConfirm(false)}
                            className="w-full py-3 px-4 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-md disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
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
