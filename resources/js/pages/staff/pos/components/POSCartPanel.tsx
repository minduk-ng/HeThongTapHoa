import React, { useState } from 'react';
import { usePage } from '@inertiajs/react';
import { Armchair, ShoppingBag, Lock, Trash2, Send, CreditCard, ArrowRightLeft } from 'lucide-react';
import { POSTableData, CartItem } from '../types/pos.types';
import TransferMergeModal from './TransferMergeModal';

interface POSCartPanelProps {
    selectedTable: POSTableData | null;
    tables?: POSTableData[];
    cartItems: CartItem[];
    onUpdateQuantity: (menuItemId: number, delta: number) => void;
    onRemoveItem: (menuItemId: number) => void;
    onUpdateNote: (menuItemId: number, note: string) => void;
    onSendToKitchen: () => void;
    onOpenPayment: () => void;
    submitting: boolean;
    isCheckoutLocked?: boolean;
    checkoutLockedBy?: string;
}

export default function POSCartPanel({
    selectedTable,
    tables = [],
    cartItems,
    onUpdateQuantity,
    onRemoveItem,
    onUpdateNote,
    onSendToKitchen,
    onOpenPayment,
    submitting,
    isCheckoutLocked = false,
    checkoutLockedBy = '',
}: POSCartPanelProps) {
    const { auth } = usePage<any>().props;
    const canBypassKitchen = !!(auth?.is_admin || auth?.permissions?.includes('pos.bypass_kitchen_lock'));
    const [managerBypass, setManagerBypass] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

    if (!selectedTable) {
        return (
            <div className="h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center text-zinc-500 shrink-0 border border-zinc-200/60 dark:border-zinc-700/60">
                        <Armchair className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <div>
                        <h3 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">
                            Chưa chọn bàn phục vụ
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                            Vui lòng nhấp chọn một bàn từ sơ đồ khu vực bên trái để bắt đầu tạo giỏ hàng và gửi order xuống Bếp.
                        </p>
                    </div>
                </div>
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

    const unconfirmedItems = cartItems.filter((i) => !i.isConfirmed);
    const hasUnconfirmedItems = unconfirmedItems.length > 0;

    const confirmedItems = cartItems.filter((i) => i.isConfirmed);
    const hasKitchenPendingOrders = confirmedItems.some((i) => !i.isKitchenCompleted);

    const isPaymentBlocked = hasKitchenPendingOrders && !canBypassKitchen && !managerBypass;

    return (
        <div className="h-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl flex flex-col justify-between overflow-hidden">
            <TransferMergeModal 
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                selectedTable={selectedTable}
                tables={tables}
            />
            {/* Header (Fixed Top) */}
            <div className="shrink-0 p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between">
                <div>
                    <div className="flex items-center space-x-2">
                        <h2 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                            {selectedTable.table_number}
                        </h2>
                        {(selectedTable.merged_into_table || selectedTable.merged_into_table_id) && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                                Gộp với {selectedTable.merged_into_table?.table_number || `Bàn #${selectedTable.merged_into_table_id}`}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">Sức chứa: {selectedTable.capacity} ghế</p>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        type="button"
                        disabled={submitting || isCheckoutLocked}
                        onClick={() => setIsTransferModalOpen(true)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-md border bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800 flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={isCheckoutLocked ? 'Bàn đang thực hiện thanh toán, không thể chuyển/gộp' : 'Chuyển, Gộp hoặc Tách bàn'}
                    >
                        <ArrowRightLeft className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>Chuyển/Gộp</span>
                    </button>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                        selectedTable.status === 'occupied'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/60'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/60'
                    }`}>
                        {selectedTable.status === 'occupied' ? 'Đang phục vụ' : 'Bàn trống'}
                    </span>
                </div>
            </div>

            {/* Cart Items List (Independent Scroll Area) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {cartItems.length === 0 ? (
                    <div className="h-full flex flex-col justify-center p-4">
                        <div className="flex items-start space-x-3 text-zinc-400">
                            <ShoppingBag className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5 stroke-[1.5]" />
                            <div>
                                <h4 className="font-display text-lg text-zinc-700 dark:text-zinc-300">Giỏ hàng trống</h4>
                                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                                    Chưa có món nào được chọn cho bàn này. Bạn có thể chuyển sang tab “Chọn món” để thêm sản phẩm.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    cartItems.map((item) => {
                        const minQty = item.isConfirmed ? (item.initialQuantity || 1) : 0;
                        const isMinusDisabled = item.isConfirmed && item.quantity <= minQty;
                        const isDeleteDisabled = !!item.isConfirmed;
                        const itemKey = `${item.menu_item_id}_${item.isConfirmed ? (item.isKitchenCompleted ? 'completed' : 'pending') : 'draft'}`;

                        return (
                            <div
                                key={itemKey}
                                className={`p-3 border rounded-xl space-y-2 transition-colors duration-150 ${
                                    item.isConfirmed
                                        ? 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200/80 dark:border-zinc-700/80'
                                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                            <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                                                {item.name}
                                            </h4>
                                            {item.isConfirmed && (
                                                <span
                                                    className={`px-2 py-0.5 text-[10px] font-medium rounded-md border shrink-0 ${
                                                        item.isKitchenCompleted
                                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/60'
                                                            : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/60'
                                                    }`}
                                                >
                                                    {item.isKitchenCompleted ? 'Đã chế biến' : 'Đang chế biến'}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-zinc-500">
                                            {item.unit_price.toLocaleString('vi-VN')} đ/món
                                        </span>
                                    </div>
                                    <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
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
                                        className="flex-1 px-2.5 py-1 text-xs border rounded-lg bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-sky-500 transition-colors duration-150"
                                    />

                                    <div className="flex items-center space-x-2 shrink-0">
                                        <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-800">
                                            <button
                                                type="button"
                                                disabled={isMinusDisabled}
                                                onClick={() => onUpdateQuantity(item.menu_item_id, -1)}
                                                className="px-2 py-0.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
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
                                                className="px-2 py-0.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold transition-colors duration-150"
                                                title="Gọi thêm món"
                                            >
                                                +
                                            </button>
                                        </div>

                                        {!isDeleteDisabled ? (
                                            <button
                                                type="button"
                                                onClick={() => onRemoveItem(item.menu_item_id)}
                                                className="p-1 text-zinc-400 hover:text-rose-600 rounded-md transition-colors duration-150"
                                                title="Hủy chọn món"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <span className="p-1 text-zinc-300 dark:text-zinc-600 cursor-not-allowed" title="Món đã gửi bếp không được xóa">
                                                <Lock className="w-3.5 h-3.5 text-zinc-400" />
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
            <div className="shrink-0 p-4 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-800/40 space-y-3">
                {/* Kitchen completion status notice */}
                {hasKitchenPendingOrders && (
                    <div className="p-2.5 border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
                        <span>Đang chờ Bếp hoàn tất món ăn...</span>
                        {canBypassKitchen && (
                            <button
                                type="button"
                                onClick={() => setManagerBypass(!managerBypass)}
                                className="font-semibold text-amber-700 dark:text-amber-300 hover:underline ml-2"
                            >
                                {managerBypass ? 'Bắt buộc khóa' : 'Duyệt khẩn cấp'}
                            </button>
                        )}
                    </div>
                )}

                <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                        <span>Tạm tính ({cartItems.reduce((s, i) => s + i.quantity, 0)} món):</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{subtotal.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                        <span>Thuế VAT:</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{vatTotal.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-zinc-900 dark:text-zinc-100 pt-1.5 border-t border-zinc-200/80 dark:border-zinc-700/80">
                        <span>Tổng thanh toán:</span>
                        <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                            {totalAmount.toLocaleString('vi-VN')} đ
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                        type="button"
                        disabled={submitting || cartItems.length === 0 || !hasUnconfirmedItems}
                        onClick={onSendToKitchen}
                        className="py-2.5 px-3 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl disabled:opacity-50 flex items-center justify-center space-x-1.5 transition-colors duration-150"
                    >
                        <Send className="w-3.5 h-3.5" />
                        <span>{submitting ? 'Đang gửi...' : 'Gửi bếp chế biến'}</span>
                    </button>

                    <button
                        type="button"
                        disabled={submitting || cartItems.length === 0 || isPaymentBlocked || isCheckoutLocked}
                        onClick={onOpenPayment}
                        className={`py-2.5 px-3 text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-colors duration-150 ${
                            isCheckoutLocked
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 cursor-not-allowed opacity-90 font-bold'
                                : isPaymentBlocked
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700 cursor-not-allowed opacity-60'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                        title={
                            isCheckoutLocked
                                ? `Bàn này đang được thanh toán bởi ${checkoutLockedBy}`
                                : isPaymentBlocked
                                ? 'Cần gửi toàn bộ món xuống Bếp và chờ Bếp làm xong mới được thanh toán'
                                : 'Thanh toán đơn hàng'
                        }
                    >
                        {isCheckoutLocked ? <Lock className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                        <span>{isCheckoutLocked ? `Đang thanh toán: ${checkoutLockedBy}` : 'Thanh toán'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
