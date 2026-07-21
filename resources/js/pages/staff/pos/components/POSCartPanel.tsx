import React, { useState } from 'react';
import { POSTableData } from './POSTableTab';

export interface CartItem {
    menu_item_id: number;
    name: string;
    quantity: number;
    initialQuantity?: number;
    unit_price: number;
    vat_rate: number;
    note?: string;
    isConfirmed?: boolean;
    orderStatus?: string;
}

interface POSCartPanelProps {
    selectedTable: POSTableData | null;
    cartItems: CartItem[];
    onUpdateQuantity: (menuItemId: number, delta: number) => void;
    onRemoveItem: (menuItemId: number) => void;
    onUpdateNote: (menuItemId: number, note: string) => void;
    onSendToKitchen: () => void;
    onOpenPayment: () => void;
    submitting: boolean;
}

export default function POSCartPanel({
    selectedTable,
    cartItems,
    onUpdateQuantity,
    onRemoveItem,
    onUpdateNote,
    onSendToKitchen,
    onOpenPayment,
    submitting,
}: POSCartPanelProps) {
    const [managerBypass, setManagerBypass] = useState(false);

    if (!selectedTable) {
        return (
            <div className="h-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-zinc-400">
                <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-2xl mb-3">
                    🪑
                </div>
                <h3 className="font-bold text-zinc-700 dark:text-zinc-300 mb-1">Chưa chọn bàn</h3>
                <p className="text-xs text-zinc-400 max-w-xs">
                    Vui lòng chọn một bàn ở danh sách bên trái để xem giỏ hàng và đặt đồ.
                </p>
            </div>
        );
    }

    // Calculations
    const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const vatTotal = cartItems.reduce((sum, item) => {
        const itemSubtotal = item.quantity * item.unit_price;
        return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
    }, 0);
    const totalAmount = subtotal + vatTotal;

    // Check if table has active orders that are still pending/processing at kitchen
    const allSessionOrders = selectedTable.active_orders || (selectedTable.active_order ? [selectedTable.active_order] : []);
    const hasKitchenPendingOrders = allSessionOrders.some(
        (o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'processing'
    );

    // Unsent items (new additions not yet sent to kitchen)
    const hasUnsentItems = cartItems.some((i) => !i.isConfirmed || i.quantity > (i.initialQuantity || 0));

    // Payment button is blocked if kitchen is still processing, UNLESS manager bypass is toggled
    const isPaymentBlocked = (hasKitchenPendingOrders || hasUnsentItems) && !managerBypass;

    return (
        <div className="h-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between overflow-hidden shadow-xs">
            {/* Header (Fixed Top) */}
            <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/60 flex items-center justify-between">
                <div>
                    <div className="flex items-center space-x-2">
                        <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                            {selectedTable.table_number}
                        </h2>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            {selectedTable.area || 'Trong nhà'}
                        </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">Sức chứa: {selectedTable.capacity} ghế</p>
                </div>
                <div className="text-right">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        selectedTable.status === 'occupied'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}>
                        {selectedTable.status === 'occupied' ? 'Đang phục vụ' : 'Bàn trống'}
                    </span>
                </div>
            </div>

            {/* Cart Items List (Independent Scroll Area) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {cartItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 py-12">
                        <svg className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                        </svg>
                        <p className="text-xs font-medium">Chưa có món nào được chọn cho bàn này.</p>
                        <p className="text-[11px] text-zinc-400 mt-1">Chuyển sang tab "Chọn món" để thêm sản phẩm.</p>
                    </div>
                ) : (
                    cartItems.map((item) => {
                        const minQty = item.isConfirmed ? (item.initialQuantity || 1) : 0;
                        const isMinusDisabled = item.isConfirmed && item.quantity <= minQty;
                        const isDeleteDisabled = !!item.isConfirmed;

                        return (
                            <div
                                key={item.menu_item_id}
                                className={`p-3 border rounded-xl space-y-2 transition-colors ${
                                    item.isConfirmed
                                        ? 'bg-zinc-100/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700'
                                        : 'bg-zinc-50/50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                            <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                                                {item.name}
                                            </h4>
                                            {item.isConfirmed && (
                                                <span
                                                    className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded-md shrink-0 ${
                                                        hasKitchenPendingOrders
                                                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                                                            : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                                                    }`}
                                                >
                                                    {hasKitchenPendingOrders ? '⏳ Đang pha chế' : '✅ Đã chế biến xong'}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-zinc-500">
                                            {item.unit_price.toLocaleString('vi-VN')} đ/món
                                        </span>
                                    </div>
                                    <span className="font-black text-sm text-zinc-900 dark:text-zinc-100">
                                        {(item.quantity * item.unit_price).toLocaleString('vi-VN')} đ
                                    </span>
                                </div>

                                {/* Quantity Controls & Remove */}
                                <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60 gap-2">
                                    <input
                                        type="text"
                                        value={item.note || ''}
                                        onChange={(e) => onUpdateNote(item.menu_item_id, e.target.value)}
                                        placeholder="Ghi chú (ít đường, nhiều đá...)"
                                        className="flex-1 px-2 py-1 text-xs border rounded-md bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700"
                                    />

                                    <div className="flex items-center space-x-2 shrink-0">
                                        <div className="flex items-center border border-zinc-300 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-800">
                                            <button
                                                type="button"
                                                disabled={isMinusDisabled}
                                                onClick={() => onUpdateQuantity(item.menu_item_id, -1)}
                                                className="px-2 py-0.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                                title={isMinusDisabled ? 'Món đã gửi bếp không được giảm dưới số lượng đã đặt' : 'Giảm số lượng'}
                                            >
                                                -
                                            </button>
                                            <span className="px-2.5 py-0.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                                {item.quantity}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onUpdateQuantity(item.menu_item_id, 1)}
                                                className="px-2 py-0.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold"
                                                title="Gọi thêm món"
                                            >
                                                +
                                            </button>
                                        </div>

                                        {!isDeleteDisabled ? (
                                            <button
                                                type="button"
                                                onClick={() => onRemoveItem(item.menu_item_id)}
                                                className="p-1 text-zinc-400 hover:text-rose-600 rounded-md"
                                                title="Hủy chọn món"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        ) : (
                                            <span className="p-1 text-zinc-300 dark:text-zinc-600 cursor-not-allowed" title="Món đã gửi bếp không được xóa">
                                                🔒
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Financial Summary & Actions Footer (Fixed Bottom) */}
            <div className="shrink-0 p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/60 space-y-3">
                {/* Kitchen completion status notice */}
                {hasKitchenPendingOrders && (
                    <div className="p-2 border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-[11px] text-amber-800 dark:text-amber-200 flex items-center justify-between">
                        <span>⏳ Đang chờ Bếp hoàn thành đơn...</span>
                        <button
                            type="button"
                            onClick={() => setManagerBypass(!managerBypass)}
                            className="font-bold underline text-amber-700 dark:text-amber-300 hover:text-amber-900 ml-2"
                        >
                            {managerBypass ? 'Bắt buộc khóa' : 'Duyệt khẩn cấp'}
                        </button>
                    </div>
                )}

                <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                        <span>Tạm tính ({cartItems.reduce((s, i) => s + i.quantity, 0)} món):</span>
                        <span className="font-semibold">{subtotal.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                        <span>Thuế VAT:</span>
                        <span className="font-semibold">{vatTotal.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-zinc-900 dark:text-zinc-100 pt-1 border-t border-zinc-200 dark:border-zinc-700">
                        <span>Tổng thanh toán:</span>
                        <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                            {totalAmount.toLocaleString('vi-VN')} đ
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                        type="button"
                        disabled={submitting || cartItems.length === 0 || !hasUnsentItems}
                        onClick={onSendToKitchen}
                        className="py-2.5 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center justify-center space-x-1.5 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        <span>{submitting ? 'Đang gửi...' : 'Gửi bếp chế biến'}</span>
                    </button>

                    <button
                        type="button"
                        disabled={submitting || cartItems.length === 0 || isPaymentBlocked}
                        onClick={onOpenPayment}
                        className={`py-2.5 px-3 text-xs font-bold rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-colors ${
                            isPaymentBlocked
                                ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 border border-zinc-300 dark:border-zinc-700 cursor-not-allowed opacity-60'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                        title={isPaymentBlocked ? 'Cần gửi toàn bộ món xuống Bếp và chờ Bếp làm xong mới được thanh toán' : 'Thanh toán đơn hàng'}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span>Thanh toán</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
