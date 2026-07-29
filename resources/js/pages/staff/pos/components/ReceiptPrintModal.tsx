import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { POSTableData, CartItem } from '../types/pos.types';


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
}

export default function ReceiptPrintModal({
    isOpen,
    onClose,
    selectedTable,
    cartItems,
    paymentMethod,
    amountReceived,
    changeAmount,
    invoiceCode = 'INV-' + Math.floor(100000 + Math.random() * 900000),
    depositAmount = 0,
}: ReceiptPrintModalProps) {
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                window.print();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isOpen || !selectedTable) return null;

    const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const vatTotal = cartItems.reduce((sum, item) => {
        const itemSubtotal = item.quantity * item.unit_price;
        return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
    }, 0);
    const totalAmount = subtotal + vatTotal;

    const todayStr = new Date().toLocaleDateString('vi-VN');
    const timeNowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
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

            <div className="bg-white text-zinc-900 rounded-2xl shadow-2xl overflow-hidden max-w-md w-full max-h-[90vh] flex flex-col relative animate-in zoom-in-95 duration-150">
                {/* Fixed Action Bar at Top */}
                <div className="no-print shrink-0 p-4 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex justify-between items-center z-10">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center space-x-1.5">
                        <Printer className="w-4 h-4 text-zinc-500 stroke-[1.5]" />
                        <span>Mẫu Hóa đơn K80 (Khổ 80mm)</span>
                    </span>
                    <div className="flex space-x-2">
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center space-x-1"
                        >
                            <span>In lại</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
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
                                ĐỨC'S COFFEE & CÀ PHÊ
                            </h2>
                            <p className="text-[11px] italic">Nhà hàng — Cafe — Lounge</p>
                            <p className="text-[10px] text-zinc-600">
                                Địa chỉ: Hà Nội | Hotline: 0988 xxx xxx | Wi-Fi: duc_coffee
                            </p>
                        </div>

                        {/* Bill Title & Metadata */}
                        <div className="py-2 space-y-1">
                            <div className="text-center">
                                <h3 className="text-sm font-black uppercase tracking-wider">
                                    PHIẾU THANH TOÁN
                                </h3>
                                <p className="text-[10px] font-mono text-zinc-600 tabular-nums">Số: {invoiceCode}</p>
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
                                    <p><span className="font-bold">NV:</span> Admin</p>
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
                                    <th className="py-1 text-right">Đơn giá</th>
                                    <th className="py-1 text-right">T.Tiền</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dashed divide-zinc-300">
                                {cartItems.map((item, idx) => (
                                    <tr key={idx} className="align-top">
                                        <td className="py-1 font-mono text-[10px] tabular-nums">{idx + 1}</td>
                                        <td className="py-1 font-semibold pr-1">
                                            {item.name}
                                            {item.note && (
                                                <span className="block text-[9px] font-normal italic text-zinc-500">
                                                    ({item.note})
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-1 text-center font-bold tabular-nums">{item.quantity}</td>
                                        <td className="py-1 text-right font-mono tabular-nums">{item.unit_price.toLocaleString('vi-VN')}</td>
                                        <td className="py-1 text-right font-bold font-mono tabular-nums">
                                            {(item.quantity * item.unit_price).toLocaleString('vi-VN')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Financial Summary */}
                        <div className="space-y-1 text-[11px] py-1 border-b border-dashed border-black">
                            <div className="flex justify-between">
                                <span>Cộng tiền món:</span>
                                <span className="font-mono font-bold tabular-nums">{subtotal.toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="flex justify-between text-zinc-600">
                                <span>Phí dịch vụ (0%):</span>
                                <span className="font-mono tabular-nums">0</span>
                            </div>
                            <div className="flex justify-between text-zinc-600">
                                <span>Thuế GTGT ({vatTotal > 0 ? '8%' : '0%'}):</span>
                                <span className="font-mono tabular-nums">{vatTotal.toLocaleString('vi-VN')}</span>
                            </div>
                            <div className="flex justify-between font-bold text-zinc-900 border-t border-dotted border-zinc-400 pt-1">
                                <span>Vị trí / Bàn thực hiện:</span>
                                <span>{selectedTable.table_number} ({selectedTable.area || 'Trong nhà'})</span>
                            </div>
                            {depositAmount > 0 && (
                                <div className="flex justify-between font-bold text-zinc-900">
                                    <span>Đã cọc:</span>
                                    <span className="font-mono tabular-nums">-{depositAmount.toLocaleString('vi-VN')} đ</span>
                                </div>
                            )}
                            <div className="flex justify-between text-xs font-black pt-1 border-t border-black">
                                <span>TỔNG THANH TOÁN:</span>
                                <span className="font-mono text-sm tabular-nums">{Math.max(0, totalAmount - depositAmount).toLocaleString('vi-VN')} đ</span>
                            </div>
                        </div>

                        {/* Payment Info */}
                        <div className="py-2 space-y-1 text-[11px] border-b border-dashed border-black">
                            <div className="flex justify-between">
                                <span>Thanh toán:</span>
                                <span className="font-bold">
                                    {paymentMethod === 'cash' ? '[X] Tiền mặt' : '[X] Chuyển khoản QR'}
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
