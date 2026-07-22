import React, { useState } from 'react';
import { Banknote, QrCode, X } from 'lucide-react';
import { POSTableData, CartItem } from '../types/pos.types';

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    selectedTable: POSTableData | null;
    cartItems: CartItem[];
    onConfirmPayment: (paymentMethod: 'cash' | 'bank_transfer', amountReceived: number, changeAmount: number, shouldPrint: boolean) => void;
    submitting: boolean;
}

export default function PaymentDrawer({
    isOpen,
    onClose,
    selectedTable,
    cartItems,
    onConfirmPayment,
    submitting,
}: PaymentDrawerProps) {
    if (!isOpen || !selectedTable) return null;

    const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const vatTotal = cartItems.reduce((sum, item) => {
        const itemSubtotal = item.quantity * item.unit_price;
        return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
    }, 0);
    const totalAmount = subtotal + vatTotal;

    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');

    // Quick Cash Presets based on totalAmount
    const calculatePresets = (total: number) => {
        const presets = [total]; // Option 1: Exact amount

        // Option 2: Next rounded 50k / 100k
        let nextRound = Math.ceil(total / 50000) * 50000;
        if (nextRound === total) nextRound += 50000;
        if (!presets.includes(nextRound)) presets.push(nextRound);

        // Option 3 & 4: Next 100k / 200k / 500k
        const bigRound1 = Math.ceil(total / 100000) * 100000;
        if (!presets.includes(bigRound1) && bigRound1 > total) presets.push(bigRound1);

        const bigRound2 = 200000;
        if (!presets.includes(bigRound2) && bigRound2 > total) presets.push(bigRound2);

        const bigRound3 = 500000;
        if (!presets.includes(bigRound3) && bigRound3 > total) presets.push(bigRound3);

        return presets.slice(0, 4);
    };

    const cashPresets = calculatePresets(totalAmount);
    const [amountReceived, setAmountReceived] = useState<number>(totalAmount);

    const changeAmount = Math.max(0, amountReceived - totalAmount);

    const handleConfirm = (shouldPrint: boolean) => {
        const finalReceived = paymentMethod === 'bank_transfer' ? totalAmount : amountReceived;
        const finalChange = paymentMethod === 'bank_transfer' ? 0 : changeAmount;
        onConfirmPayment(paymentMethod, finalReceived, finalChange, shouldPrint);
    };

    return (
        <div className="fixed inset-0 z-[100] overflow-hidden flex justify-end">
            {/* Backdrop Overlay */}
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-150"
                onClick={onClose}
            />

            {/* Sliding Drawer */}
            <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 h-full border-l border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl flex flex-col justify-between z-10">
                {/* Header */}
                <div className="p-5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between">
                    <div>
                        <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 block">
                            Thanh toán đơn hàng
                        </span>
                        <h2 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                            {selectedTable.table_number} ({selectedTable.area || 'Trong nhà'})
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
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Financial Overview Card */}
                    <div className="bg-sky-50/60 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-900/60 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-sky-900 dark:text-sky-200 border-b border-sky-200/60 dark:border-sky-800/60 pb-2 mb-1">
                            <span>Vị trí phục vụ:</span>
                            <span className="px-2.5 py-0.5 rounded-md bg-sky-600 text-white font-semibold text-xs">
                                {selectedTable.table_number} ({selectedTable.area || 'Trong nhà'})
                            </span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                            <span>Tổng tiền món ({cartItems.reduce((s, i) => s + i.quantity, 0)} món):</span>
                            <span className="font-semibold">{subtotal.toLocaleString('vi-VN')} đ</span>
                        </div>
                        <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                            <span>Thuế VAT:</span>
                            <span className="font-semibold">{vatTotal.toLocaleString('vi-VN')} đ</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-zinc-900 dark:text-zinc-100 pt-2 border-t border-sky-200/60 dark:border-sky-800/60">
                            <span>TỔNG CỘNG:</span>
                            <span className="text-xl font-bold text-sky-600 dark:text-sky-400">
                                {totalAmount.toLocaleString('vi-VN')} đ
                            </span>
                        </div>
                    </div>

                    {/* Payment Method Tabs */}
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block">
                            Phương thức thanh toán
                        </label>
                        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                            <button
                                type="button"
                                onClick={() => {
                                    setPaymentMethod('cash');
                                    setAmountReceived(totalAmount);
                                }}
                                className={`py-2.5 px-3 text-xs font-semibold rounded-lg transition-colors duration-150 flex items-center justify-center space-x-2 ${
                                    paymentMethod === 'cash'
                                        ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 border border-zinc-200/60 dark:border-zinc-700/60'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                }`}
                            >
                                <Banknote className="w-4 h-4" />
                                <span>Tiền mặt</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setPaymentMethod('bank_transfer')}
                                className={`py-2.5 px-3 text-xs font-semibold rounded-lg transition-colors duration-150 flex items-center justify-center space-x-2 ${
                                    paymentMethod === 'bank_transfer'
                                        ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 border border-zinc-200/60 dark:border-zinc-700/60'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                }`}
                            >
                                <QrCode className="w-4 h-4" />
                                <span>Chuyển khoản</span>
                            </button>
                        </div>
                    </div>

                    {/* Tab 1 Content: Cash */}
                    {paymentMethod === 'cash' && (
                        <div className="space-y-4 animate-in fade-in duration-150">
                            {/* Quick Presets */}
                            <div>
                                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2 block">
                                    Chọn nhanh tiền khách đưa:
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {cashPresets.map((preset, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setAmountReceived(preset)}
                                            className={`py-2.5 px-3 border rounded-xl text-xs font-bold transition-all text-center ${
                                                amountReceived === preset
                                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/40'
                                                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:border-zinc-300'
                                            }`}
                                        >
                                            {preset.toLocaleString('vi-VN')} đ
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom Amount Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block">
                                    Hoặc nhập số tiền trực tiếp (đ):
                                </label>
                                <input
                                    type="number"
                                    value={amountReceived || ''}
                                    onChange={(e) => setAmountReceived(Number(e.target.value))}
                                    placeholder="Nhập số tiền..."
                                    className="w-full px-3.5 py-2.5 text-base font-bold border rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            {/* Change Returned Highlight */}
                            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex justify-between items-center">
                                <div>
                                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                                        Tiền thừa trả lại khách:
                                    </span>
                                    <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                        (Tiền khách đưa - Tổng thanh toán)
                                    </span>
                                </div>
                                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                                    {changeAmount.toLocaleString('vi-VN')} đ
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Tab 2 Content: Bank Transfer QR */}
                    {paymentMethod === 'bank_transfer' && (
                        <div className="space-y-4 animate-in fade-in duration-150 text-center">
                            <div className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 flex flex-col items-center">
                                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">
                                    Quét mã QR Ngân hàng để thanh toán
                                </span>
                                <div className="p-2 bg-white rounded-xl shadow-md border border-zinc-200">
                                    <img
                                        src="/QR_chuyen_khoan/stk_duc.jpg"
                                        alt="Mã QR Chuyển khoản"
                                        className="w-48 h-48 object-contain rounded-lg"
                                        onError={(e) => {
                                            (e.target as HTMLElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                                <div className="mt-3 text-xs space-y-1 text-zinc-700 dark:text-zinc-300 font-medium">
                                    <p><span className="font-bold">Chủ TK:</span> NGUYEN MINH DUC</p>
                                    <p><span className="font-bold">Số tiền:</span> <span className="font-black text-blue-600 dark:text-blue-400">{totalAmount.toLocaleString('vi-VN')} đ</span></p>
                                    <p><span className="font-bold">Nội dung:</span> Thanh toán {selectedTable.table_number}</p>
                                </div>
                            </div>
                            <p className="text-[11px] text-zinc-400 italic">
                                * Nhân viên vui lòng kiểm tra thông báo biến động số dư trên điện thoại trước khi xác nhận.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Action Buttons */}
                <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 space-y-2.5">
                    <button
                        type="button"
                        disabled={submitting || (paymentMethod === 'cash' && amountReceived < totalAmount)}
                        onClick={() => handleConfirm(true)}
                        className="w-full py-3 px-4 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        <span>{submitting ? 'Đang lưu...' : 'Xác nhận & In hóa đơn K80'}</span>
                    </button>

                    <button
                        type="button"
                        disabled={submitting || (paymentMethod === 'cash' && amountReceived < totalAmount)}
                        onClick={() => handleConfirm(false)}
                        className="w-full py-2.5 px-4 text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 rounded-xl shadow-xs disabled:opacity-50 transition-colors"
                    >
                        <span>Xác nhận thanh toán (Không in)</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
