import React, { useState } from 'react';
import { usePage } from '@inertiajs/react';
import {
    Armchair,
    ShoppingBag,
    Lock,
    Trash2,
    Send,
    CreditCard,
    ArrowRightLeft,
    Plus,
    X,
    Menu,
    StickyNote,
} from 'lucide-react';
import { POSTableData, CartItem } from '../types/pos.types';
import TransferMergeModal from './TransferMergeModal';
import ReduceItemModal from './ReduceItemModal';

import VoidItemModal from '@/pages/staff/kitchen/components/VoidItemModal';
import NotePopupModal from './NotePopupModal';

interface POSCartPanelProps {
    selectedTable: POSTableData | null;
    tables?: POSTableData[];
    cartItems: CartItem[];
    activeInvoiceId: string;
    tableCarts: Record<string, CartItem[]>;
    onSelectInvoice: (invoiceId: string) => void;
    onAddInvoice: () => void;
    onRemoveInvoice: (invoiceId: string) => void;
    onUpdateQuantity: (menuItemId: number, delta: number) => void;
    onStageReduction: (
        orderItemId: number,
        reduceQty: number,
        reason: string,
        note?: string,
    ) => void;
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
    activeInvoiceId,
    tableCarts,
    onSelectInvoice,
    onAddInvoice,
    onRemoveInvoice,
    onUpdateQuantity,
    onStageReduction,
    onRemoveItem,
    onUpdateNote,
    onSendToKitchen,
    onOpenPayment,
    submitting,
    isCheckoutLocked = false,
    checkoutLockedBy = '',
}: POSCartPanelProps) {
    const { auth } = usePage<any>().props;
    const canBypassKitchen = !!(
        auth?.is_admin || auth?.permissions?.includes('pos.bypass_kitchen_lock')
    );
    const canCancel = !!(
        auth?.is_admin ||
        auth?.permissions?.includes('pos.cancel_item') ||
        auth?.permissions?.includes('kitchen.cancel_item')
    );
    const [managerBypass, setManagerBypass] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

    // Reduce Item Modal State (staged reduction before sending to kitchen)
    const [reduceModalState, setReduceModalState] = useState<{
        isOpen: boolean;
        item: CartItem | null;
    }>({
        isOpen: false,
        item: null,
    });

    // Note Popup Modal State
    const [noteModalState, setNoteModalState] = useState<{
        isOpen: boolean;
        item: CartItem | null;
    }>({
        isOpen: false,
        item: null,
    });

    // Cancel Modal State (direct full order/item cancel)
    const [cancelModalState, setCancelModalState] = useState<{
        isOpen: boolean;
        mode: 'item' | 'order';
        orderItemId?: number | null;
        tableId?: number | null;
        menuItemName: string;
    }>({
        isOpen: false,
        mode: 'order',
        orderItemId: null,
        tableId: null,
        menuItemName: '',
    });

    if (!selectedTable) {
        return (
            <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-6 dark:border-zinc-800/80 dark:bg-zinc-900">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200/60 bg-zinc-100 text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-800/80">
                        <Armchair className="h-6 w-6 stroke-[1.5]" />
                    </div>
                    <div>
                        <h3 className="font-display text-xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                            Chưa chọn bàn phục vụ
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                            Vui lòng nhấp chọn một bàn từ sơ đồ khu vực bên trái
                            để bắt đầu tạo giỏ hàng và gửi order xuống Bếp.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Calculations
    const subtotal = cartItems.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0,
    );
    const vatTotal = cartItems.reduce((sum, item) => {
        const itemSubtotal = item.quantity * item.unit_price;
        return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
    }, 0);
    const totalAmount = subtotal + vatTotal;

    const unconfirmedItems = cartItems.filter((i) => !i.isConfirmed);
    const hasStagedReductions = cartItems.some(
        (i) => (i.stagedReduceQty || 0) > 0,
    );
    const hasUnconfirmedChanges =
        unconfirmedItems.length > 0 || hasStagedReductions;

    const confirmedItems = cartItems.filter((i) => i.isConfirmed);
    const hasKitchenPendingOrders = confirmedItems.some(
        (i) => !i.isKitchenCompleted,
    );

    const isKitchenBlocked = hasKitchenPendingOrders && !managerBypass;
    const isPaymentBlocked =
        hasUnconfirmedChanges ||
        isKitchenBlocked ||
        activeInvoiceId.startsWith('draft_');

    return (
        <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
            <VoidItemModal
                isOpen={cancelModalState.isOpen}
                onClose={() =>
                    setCancelModalState({
                        isOpen: false,
                        mode: 'order',
                        orderItemId: null,
                        tableId: null,
                        menuItemName: '',
                    })
                }
                mode={cancelModalState.mode}
                orderItemId={cancelModalState.orderItemId}
                tableId={cancelModalState.tableId}
                menuItemName={cancelModalState.menuItemName}
            />

            <ReduceItemModal
                isOpen={reduceModalState.isOpen}
                onClose={() =>
                    setReduceModalState({ isOpen: false, item: null })
                }
                item={reduceModalState.item}
                onConfirm={(orderItemId, reduceQty, reason, note) => {
                    onStageReduction(orderItemId, reduceQty, reason, note);
                }}
            />

            <NotePopupModal
                isOpen={noteModalState.isOpen}
                item={noteModalState.item}
                onSave={(menuItemId, note) => onUpdateNote(menuItemId, note)}
                onClose={() => setNoteModalState({ isOpen: false, item: null })}
            />

            <TransferMergeModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                selectedTable={selectedTable}
                tables={tables}
            />
            {/* Header (Fixed Top) */}
            <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center space-x-2">
                        <h2 className="font-display text-2xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
                            {selectedTable.table_number}
                        </h2>
                        {(selectedTable.merged_into_table ||
                            selectedTable.merged_into_table_id) && (
                            <span className="shrink-0 rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                                Gộp với{' '}
                                {selectedTable.merged_into_table
                                    ?.table_number ||
                                    `Bàn #${selectedTable.merged_into_table_id}`}
                            </span>
                        )}
                        <span
                            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                                selectedTable.status === 'occupied'
                                    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                        >
                            {selectedTable.status === 'occupied'
                                ? 'Đang phục vụ'
                                : 'Bàn trống'}
                        </span>
                    </div>

                    {/* Actions Menu Dropdown */}
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() =>
                                setIsActionsMenuOpen(!isActionsMenuOpen)
                            }
                            className="flex items-center justify-center rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            title="Thao tác khác"
                        >
                            <Menu className="h-4 w-4 stroke-[1.5]" />
                        </button>

                        {isActionsMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsActionsMenuOpen(false)}
                                />
                                <div className="animate-in fade-in slide-in-from-top-1 absolute top-full right-0 z-50 mt-1 w-44 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg duration-100 dark:border-zinc-800 dark:bg-zinc-950">
                                    {confirmedItems.length > 0 &&
                                        canCancel &&
                                        confirmedItems.some(
                                            (i) => !i.isKitchenCompleted,
                                        ) && (
                                            <button
                                                type="button"
                                                disabled={
                                                    submitting ||
                                                    isCheckoutLocked
                                                }
                                                onClick={() => {
                                                    setIsActionsMenuOpen(false);
                                                    setCancelModalState({
                                                        isOpen: true,
                                                        mode: 'order',
                                                        tableId:
                                                            selectedTable.id,
                                                        menuItemName: `Toàn bộ đơn ${selectedTable.table_number}`,
                                                    });
                                                }}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:text-rose-300 dark:hover:bg-rose-950/50"
                                            >
                                                <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                                                <span>Hủy đơn</span>
                                            </button>
                                        )}
                                    <button
                                        type="button"
                                        disabled={
                                            submitting || isCheckoutLocked
                                        }
                                        onClick={() => {
                                            setIsActionsMenuOpen(false);
                                            setIsTransferModalOpen(true);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                    >
                                        <ArrowRightLeft className="h-3.5 w-3.5 stroke-[1.5]" />
                                        <span>Chuyển / Gộp</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Tabs bar: Dòng 2 chứa danh sách các hóa đơn */}
                <div className="mt-3 flex shrink-0 scrollbar-none items-center space-x-1.5 overflow-x-auto border-t border-zinc-200/50 pt-2 select-none dark:border-zinc-800/50">
                    {Object.keys(tableCarts).map((invoiceId, idx) => {
                        const isDraft = invoiceId.startsWith('draft_');
                        const isActive = activeInvoiceId === invoiceId;
                        const invoiceCart = tableCarts[invoiceId] || [];
                        const isCompleted =
                            invoiceCart.length > 0 &&
                            invoiceCart.every((i) => i.isKitchenCompleted);

                        let label = invoiceId;
                        if (isDraft) {
                            label = `Đơn mới #${idx + 1}`;
                        }

                        return (
                            <div
                                key={invoiceId}
                                onClick={() => onSelectInvoice(invoiceId)}
                                className={`group flex shrink-0 cursor-pointer items-center space-x-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                                    isActive
                                        ? isDraft
                                            ? 'border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
                                            : isCompleted
                                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
                                        : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50'
                                } ${isDraft ? 'border-dashed' : ''}`}
                            >
                                <span>{label}</span>
                                {isDraft && invoiceCart.length === 0 && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveInvoice(invoiceId);
                                        }}
                                        className="rounded-full p-0.5 text-zinc-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                                        title="Xóa hóa đơn nháp này"
                                    >
                                        <X className="h-3 w-3 stroke-[1.5]" />
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={onAddInvoice}
                        className="shrink-0 rounded-lg border border-zinc-200 p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        title="Thêm hóa đơn mới"
                    >
                        <Plus className="h-3.5 w-3.5 stroke-2" />
                    </button>
                </div>
            </div>

            {/* Cart Items List (Independent Scroll Area) */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {cartItems.length === 0 ? (
                    <div className="flex h-full flex-col justify-center p-4">
                        <div className="flex items-start space-x-3 text-zinc-400">
                            <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 stroke-[1.5] text-zinc-400" />
                            <div>
                                <h4 className="font-display text-lg text-zinc-700 dark:text-zinc-300">
                                    Giỏ hàng trống
                                </h4>
                                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                                    Chưa có món nào được chọn cho bàn này. Bạn
                                    có thể chuyển sang tab “Chọn món” để thêm
                                    sản phẩm.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    cartItems.map((item) => {
                        const isMinusDisabled = !!(
                            item.isConfirmed &&
                            (item.isKitchenCompleted || item.quantity <= 0)
                        );
                        const isDeleteDisabled = !!item.isConfirmed;
                        const itemKey = `${item.menu_item_id}_${item.isConfirmed ? (item.isKitchenCompleted ? 'completed' : 'pending') : 'draft'}`;

                        return (
                            <div
                                key={itemKey}
                                className={`group space-y-1.5 rounded-xl border p-3 transition-colors duration-150 ${
                                    item.isConfirmed
                                        ? 'border-zinc-200/80 bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-800/60'
                                        : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                                }`}
                            >
                                {/* Row 1: Name + Status | Total */}
                                <div className="flex items-start justify-between">
                                    <div className="flex min-w-0 flex-wrap items-center space-x-2 gap-y-1">
                                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            {item.name}
                                        </h4>
                                        {item.isConfirmed && (
                                            <span
                                                className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                                                    item.isKitchenCompleted
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                        : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300'
                                                }`}
                                            >
                                                {item.isKitchenCompleted
                                                    ? 'Đã chế biến'
                                                    : 'Đang chế biến'}
                                            </span>
                                        )}
                                        {(item.stagedReduceQty || 0) > 0 && (
                                            <span className="shrink-0 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                                Giảm {item.stagedReduceQty}
                                            </span>
                                        )}
                                    </div>
                                    <span className="ml-2 shrink-0 text-sm font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                                        {(
                                            item.quantity * item.unit_price
                                        ).toLocaleString('vi-VN')}{' '}
                                        đ
                                    </span>
                                </div>

                                {/* Row 2: Note preview (click popup) */}
                                <div
                                    onClick={() =>
                                        setNoteModalState({
                                            isOpen: true,
                                            item,
                                        })
                                    }
                                    className="cursor-pointer rounded-md border border-dashed border-transparent px-1 py-0.5 text-[11px] text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600 dark:hover:border-zinc-600 dark:hover:text-zinc-300"
                                >
                                    {item.note ? (
                                        <span className="line-clamp-1">
                                            {item.note}
                                        </span>
                                    ) : (
                                        <span className="italic">
                                            Thêm ghi chú…
                                        </span>
                                    )}
                                </div>

                                {/* Row 3: Quantity Controls + Hidden Delete */}
                                <div className="flex items-center justify-between pt-0.5">
                                    <div className="flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
                                        <button
                                            type="button"
                                            disabled={isMinusDisabled}
                                            onClick={() => {
                                                if (!item.isConfirmed) {
                                                    onUpdateQuantity(
                                                        item.menu_item_id,
                                                        -1,
                                                    );
                                                } else if (
                                                    !item.isKitchenCompleted &&
                                                    item.quantity > 0
                                                ) {
                                                    setReduceModalState({
                                                        isOpen: true,
                                                        item,
                                                    });
                                                }
                                            }}
                                            className="px-3 py-1.5 text-sm font-bold text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                            title={
                                                item.isConfirmed
                                                    ? 'Giảm số lượng món đang chế biến (kèm lý do)'
                                                    : 'Giảm số lượng món nháp'
                                            }
                                        >
                                            -
                                        </button>
                                        <span className="border-x border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-900 tabular-nums dark:border-zinc-700 dark:text-zinc-100">
                                            {item.quantity}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onUpdateQuantity(
                                                    item.menu_item_id,
                                                    1,
                                                )
                                            }
                                            className="px-3 py-1.5 text-sm font-bold text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                            title="Gọi thêm món"
                                        >
                                            +
                                        </button>
                                    </div>

                                    <div className="flex items-center space-x-1">
                                        {!isDeleteDisabled ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onRemoveItem(
                                                        item.menu_item_id,
                                                    )
                                                }
                                                className="rounded-md p-1.5 text-zinc-400 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:text-rose-600"
                                                title="Hủy chọn món nháp"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        ) : canCancel &&
                                          item.orderItemId &&
                                          !item.isKitchenCompleted &&
                                          (item.stagedReduceQty || 0) <
                                              item.quantity ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setReduceModalState({
                                                        isOpen: true,
                                                        item,
                                                    })
                                                }
                                                className="rounded-md p-1.5 text-rose-500 transition-colors duration-150 hover:text-rose-700 dark:hover:text-rose-300"
                                                title="Giảm / Hủy món đang chế biến kèm lý do"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        ) : (item.stagedReduceQty || 0) >=
                                          item.quantity ? (
                                            <span
                                                className="cursor-not-allowed p-1.5 text-amber-500 dark:text-amber-400"
                                                title="Món đã được giảm về 0, ấn 'Gửi bếp chế biến' để xác nhận"
                                            >
                                                <Lock className="h-3.5 w-3.5" />
                                            </span>
                                        ) : (
                                            <span
                                                className="cursor-not-allowed p-1.5 text-zinc-300 opacity-0 transition-all duration-150 group-hover:opacity-100 dark:text-zinc-600"
                                                title={
                                                    item.isKitchenCompleted
                                                        ? 'Món đã hoàn thành chế biến, không thể hủy'
                                                        : 'Món đã gửi bếp không được xóa'
                                                }
                                            >
                                                <Lock className="h-3.5 w-3.5 text-zinc-400" />
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
            <div className="shrink-0 space-y-3 border-t border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800/80 dark:bg-zinc-800/40">
                {/* Kitchen completion status notice */}
                {hasKitchenPendingOrders && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <span>Đang chờ Bếp hoàn tất món ăn...</span>
                        {canBypassKitchen && (
                            <button
                                type="button"
                                onClick={() => setManagerBypass(!managerBypass)}
                                className="ml-2 font-semibold text-amber-700 hover:underline dark:text-amber-300"
                            >
                                {managerBypass
                                    ? 'Bắt buộc khóa'
                                    : 'Duyệt khẩn cấp'}
                            </button>
                        )}
                    </div>
                )}

                <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                        <span>
                            Tạm tính (
                            {cartItems.reduce((s, i) => s + i.quantity, 0)}{' '}
                            món):
                        </span>
                        <span className="font-semibold text-zinc-800 tabular-nums dark:text-zinc-200">
                            {subtotal.toLocaleString('vi-VN')} đ
                        </span>
                    </div>
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                        <span>Thuế VAT:</span>
                        <span className="font-semibold text-zinc-800 tabular-nums dark:text-zinc-200">
                            {vatTotal.toLocaleString('vi-VN')} đ
                        </span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200/80 pt-1.5 text-sm font-bold text-zinc-900 dark:border-zinc-700/80 dark:text-zinc-100">
                        <span>Tổng thanh toán:</span>
                        <span className="text-base font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                            {totalAmount.toLocaleString('vi-VN')} đ
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                        type="button"
                        disabled={
                            submitting ||
                            cartItems.length === 0 ||
                            !hasUnconfirmedChanges ||
                            isCheckoutLocked
                        }
                        onClick={onSendToKitchen}
                        className={`flex items-center justify-center space-x-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors duration-150 ${
                            isCheckoutLocked
                                ? 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 opacity-50 dark:border-zinc-700 dark:bg-zinc-800'
                                : 'bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50'
                        }`}
                        title={
                            isCheckoutLocked
                                ? `Bàn này đang được thanh toán bởi ${checkoutLockedBy}`
                                : 'Gửi món vừa chọn hoặc thay đổi xuống Bếp'
                        }
                    >
                        <Send className="h-3.5 w-3.5" />
                        <span>
                            {submitting ? 'Đang gửi...' : 'Gửi bếp chế biến'}
                        </span>
                    </button>

                    <button
                        type="button"
                        disabled={
                            submitting ||
                            cartItems.length === 0 ||
                            isPaymentBlocked ||
                            isCheckoutLocked
                        }
                        onClick={onOpenPayment}
                        className={`flex items-center justify-center space-x-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors duration-150 ${
                            isCheckoutLocked
                                ? 'cursor-not-allowed border border-rose-300 bg-rose-100 font-bold text-rose-700 opacity-90 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : isPaymentBlocked
                                  ? 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 opacity-60 dark:border-zinc-700 dark:bg-zinc-800'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                        title={
                            isCheckoutLocked
                                ? `Bàn này đang được thanh toán bởi ${checkoutLockedBy}`
                                : hasUnconfirmedChanges
                                  ? 'Vui lòng bấm “Gửi bếp chế biến” để lưu giỏ hàng trước khi thanh toán'
                                  : isKitchenBlocked
                                    ? 'Cần gửi toàn bộ món xuống Bếp và chờ Bếp làm xong mới được thanh toán'
                                    : 'Thanh toán đơn hàng'
                        }
                    >
                        {isCheckoutLocked ? (
                            <Lock className="h-3.5 w-3.5" />
                        ) : (
                            <CreditCard className="h-3.5 w-3.5" />
                        )}
                        <span>
                            {isCheckoutLocked
                                ? `Đang thanh toán: ${checkoutLockedBy}`
                                : 'Thanh toán'}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
