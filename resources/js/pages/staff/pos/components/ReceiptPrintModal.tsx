import { usePage } from '@inertiajs/react';
import { Printer, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { POSTableData, CartItem } from '../types/pos.types';

interface ReceiptPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedTable: POSTableData | null;
    cartItems: CartItem[];
    paymentMethod: 'cash' | 'bank_transfer';
    amountReceived: number;
    changeAmount: number;
    invoiceCode?: string;
    depositAmount?: number;
    depositRefund?: number;
    promotionDiscount?: number;
    storeName?: string;
    storeAddress?: string;
    storePhone?: string;
    storeWifi?: string;
    staffName?: string;
}

export default function ReceiptPrintModal({
    isOpen,
    onClose,
    selectedTable,
    cartItems,
    paymentMethod,
    amountReceived,
    changeAmount,
    invoiceCode,
    depositAmount = 0,
    depositRefund = 0,
    promotionDiscount = 0,
    storeName,
    storeAddress,
    storePhone,
    storeWifi,
    staffName,
}: ReceiptPrintModalProps) {
    const pageProps = usePage<{ auth?: { user?: { name?: string } }; store_info?: { name?: string; address?: string; phone?: string; wifi?: string } }>().props;
    const [fallbackInvoiceCode, setFallbackInvoiceCode] = useState('');

    const storeNameDisplay = storeName || pageProps?.store_info?.name || 'HỆ THỐNG TẠP HÓA';
    const storeAddressDisplay = storeAddress || pageProps?.store_info?.address || '';
    const storePhoneDisplay = storePhone || pageProps?.store_info?.phone || '';
    const storeWifiDisplay = storeWifi || pageProps?.store_info?.wifi || '';
    const staffNameDisplay = staffName || pageProps?.auth?.user?.name || 'Thu ngân';

    useEffect(() => {
        if (isOpen && !invoiceCode) {
            queueMicrotask(() => {
                setFallbackInvoiceCode(`INV-${Math.floor(100000 + Math.random() * 900000)}`);
            });
        }
    }, [isOpen, invoiceCode]);

    const displayInvoiceCode = invoiceCode || fallbackInvoiceCode;
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                window.print();
            }, 300);

            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isOpen || !selectedTable) {
        return null;
    }

    const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const vatInTotal = cartItems.reduce((sum, item) => {
        const line = item.quantity * item.unit_price;
        const rate = item.vat_rate || 0;

        if (rate <= 0) {
            return sum;
        }

        const net = Math.floor(line / (1 + rate / 100));

        return sum + (line - net);
    }, 0);

    const discountAmount = promotionDiscount > 0 ? promotionDiscount : 0;
    const finalTotal = Math.max(0, subtotal - discountAmount);

    const todayStr = new Date().toLocaleDateString('vi-VN');
    const timeNowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <style>{`
                @media print {
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                    html, body {
                        background: #fff !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        overflow: visible !important;
                    }
                    body * {
                        visibility: hidden !important;
                    }
                    #k80-receipt-print-area, #k80-receipt-print-area * {
                        visibility: visible !important;
                    }
                    #k80-receipt-print-area {
                        position: fixed !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 80mm !important;
                        max-width: 80mm !important;
                        padding: 2mm 4mm !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                        border: none !important;
                        background: white !important;
                        color: black !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Toolbar (Not printed) */}
                <div className="no-print flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80">
                    <div className="flex items-center space-x-2">
                        <Printer className="w-5 h-5 text-sky-600 dark:text-sky-400 stroke-[1.5]" />
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            Xem trước & In hóa đơn K80
                        </h3>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                        >
                            <span>In lại</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Đóng"
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                        >
                            <X className="w-3.5 h-3.5 stroke-[1.5]" />
                            <span>Đóng</span>
                        </button>
                    </div>
                </div>

                {/* Printable K80 Receipt Content (Scrollable if receipt is long) */}
                <div className="flex-1 overflow-y-auto p-4 bg-zinc-50 dark:bg-zinc-900/50">
                    <div
                        id="k80-receipt-print-area"
                        className="p-5 font-serif text-[12px] leading-tight text-black bg-white mx-auto w-[80mm] max-w-[80mm] shadow-sm rounded-lg"
                    >
                        {/* Header */}
                        <div className="text-center space-y-1 pb-3 border-b border-dashed border-black">
                            <h2 className="text-base font-black tracking-wide uppercase">
                                {storeNameDisplay}
                            </h2>
                            <p className="text-[11px] italic">Phiếu thanh toán dịch vụ</p>
                            {(storeAddressDisplay || storePhoneDisplay || storeWifiDisplay) && (
                                <p className="text-[10px] text-zinc-600">
                                    {[
                                        storeAddressDisplay ? `Đ/C: ${storeAddressDisplay}` : '',
                                        storePhoneDisplay ? `ĐT: ${storePhoneDisplay}` : '',
                                        storeWifiDisplay ? `Wi-Fi: ${storeWifiDisplay}` : '',
                                    ].filter(Boolean).join(' | ')}
                                </p>
                            )}
                        </div>

                        {/* Bill Title & Metadata */}
                        <div className="py-2 space-y-1">
                            <div className="text-center">
                                <h3 className="text-sm font-black uppercase tracking-wider">
                                    PHIẾU THANH TOÁN
                                </h3>
                                <p className="text-[10px] font-mono text-zinc-600 tabular-nums">Số: {displayInvoiceCode}</p>
                            </div>

                            <div className="grid grid-cols-2 text-[11px] pt-1 border-t border-dotted border-zinc-400">
                                <div>
                                    <p><span className="font-bold">Bàn số:</span> <span className="tabular-nums">{selectedTable.table_number}</span></p>
                                    <p><span className="font-bold">Giờ vào:</span> <span className="tabular-nums">{timeNowStr}</span></p>
                                    <p><span className="font-bold">Ngày:</span> <span className="tabular-nums">{todayStr}</span></p>
                                </div>
                                <div className="text-right">
                                    <p><span className="font-bold">Khu:</span> {selectedTable.area || 'Trong nhà'}</p>
                                    <p><span className="font-bold">Giờ ra:</span> <span className="tabular-nums">{timeNowStr}</span></p>
                                    <p><span className="font-bold">NV:</span> {staffNameDisplay}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <table className="w-full text-left text-[11px] border-collapse border-t border-b border-black my-2">
                            <thead>
                                <tr className="border-b border-black text-[10px] uppercase font-bold">
                                    <th className="py-1 w-6">STT</th>
                                    <th className="py-1">Món / Đồ uống</th>
                                    <th className="py-1 text-center w-6">SL</th>
                                    <th className="py-1 text-right">Đ.Giá</th>
                                    <th className="py-1 text-right">T.Tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cartItems.map((item, idx) => {
                                    const itemTotal = item.quantity * item.unit_price;

                                    return (
                                        <tr key={item.menu_item_id ?? idx} className="border-b border-dotted border-zinc-200">
                                            <td className="py-1.5 align-top font-mono tabular-nums">{idx + 1}</td>
                                            <td className="py-1.5 align-top pr-1">
                                                <div className="font-bold">{item.name}</div>
                                                {item.note && (
                                                    <div className="text-[10px] text-zinc-500 italic pl-1">
                                                        Ghi chú: {item.note}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-1.5 align-top text-center font-bold tabular-nums">
                                                {item.quantity}
                                            </td>
                                            <td className="py-1.5 align-top text-right font-mono tabular-nums">
                                                {item.unit_price.toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-1.5 align-top text-right font-mono font-bold tabular-nums">
                                                {itemTotal.toLocaleString('vi-VN')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Summary & Totals */}
                        <div className="py-1 space-y-1 text-[11px] border-b border-black">
                            <div className="flex justify-between">
                                <span>Cộng tiền hàng:</span>
                                <span className="font-mono tabular-nums">{subtotal.toLocaleString('vi-VN')} đ</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-rose-600 font-bold">
                                    <span>Chiết khấu khuyến mãi:</span>
                                    <span className="font-mono tabular-nums">-{discountAmount.toLocaleString('vi-VN')} đ</span>
                                </div>
                            )}
                            {depositAmount > 0 && (
                                <div className="flex justify-between text-amber-700">
                                    <span>Đã cọc trước:</span>
                                    <span className="font-mono tabular-nums">-{depositAmount.toLocaleString('vi-VN')} đ</span>
                                </div>
                            )}
                            {vatInTotal > 0 && (
                                <div className="flex justify-between text-[10px] text-zinc-600">
                                    <span>(Trong đó gồm VAT):</span>
                                    <span className="font-mono tabular-nums">{vatInTotal.toLocaleString('vi-VN')} đ</span>
                                </div>
                            )}
                            <div className="flex justify-between font-black text-sm pt-1 border-t border-dotted border-black">
                                <span>TỔNG THANH TOÁN:</span>
                                <span className="font-mono tabular-nums">{finalTotal.toLocaleString('vi-VN')} đ</span>
                            </div>
                            {depositRefund > 0 && (
                                <div className="flex justify-between font-bold text-zinc-900">
                                    <span>Hoàn khách:</span>
                                    <span className="font-mono tabular-nums">{depositRefund.toLocaleString('vi-VN')} đ</span>
                                </div>
                            )}
                        </div>

                        {/* Payment Info */}
                        <div className="py-2 space-y-1 text-[11px] border-b border-dashed border-black">
                            <div className="flex justify-between">
                                <span>Thanh toán:</span>
                                <span className="font-bold">
                                    {paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản QR'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tiền khách đưa:</span>
                                <span className="font-mono font-bold">{amountReceived.toLocaleString('vi-VN')} đ</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tiền thừa trả khách:</span>
                                <span className="font-mono font-bold">{changeAmount.toLocaleString('vi-VN')} đ</span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="text-center pt-3 space-y-3">
                            <p className="font-bold text-xs italic">Cảm ơn Quý khách đã ghé thăm!</p>

                            <div className="grid grid-cols-2 text-[10px] text-zinc-600 pt-1">
                                <div>
                                    <p className="font-bold">Khách hàng</p>
                                    <p className="italic text-[9px]">(Ký xác nhận)</p>
                                </div>
                                <div>
                                    <p className="font-bold">Thu ngân</p>
                                    <p className="italic text-[9px]">(Ký, ghi rõ họ tên)</p>
                                </div>
                            </div>

                            <p className="text-[9px] text-zinc-400 italic pt-3 border-t border-dotted border-zinc-300">
                                Vui lòng kiểm tra hóa đơn trước khi thanh toán — Mọi thắc mắc xin liên hệ quản lý
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
