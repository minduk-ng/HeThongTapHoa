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
    ChevronUp,
    CalendarClock,
    Banknote,
    LogIn,
} from 'lucide-react';
import React, { useState } from 'react';
import VoidItemModal from '@/pages/staff/kitchen/components/VoidItemModal';
import type { POSTableData, CartItem, ReservationDraft} from '../types/pos.types';
import CancelReservationModal from './CancelReservationModal';
import NotePopupModal from './NotePopupModal';
import ReduceItemModal from './ReduceItemModal';

import TransferMergeModal from './TransferMergeModal';

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
    onOpenSinglePayment?: () => void;
    submitting: boolean;
    isCheckoutLocked?: boolean;
    checkoutLockedBy?: string;
    reservationDraft?: ReservationDraft | null;
    onOpenReservationForm?: () => void;
    onConfirmReservation?: () => void;
    onCheckIn?: (orderId: number) => void;
    onCancelReservation?: (orderId: number, resolution: 'refund' | 'forfeit', note: string) => void;
    onOpenDeposit?: () => void;
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
    onOpenSinglePayment,
    submitting,
    isCheckoutLocked = false,
    checkoutLockedBy = '',
    reservationDraft,
    onOpenReservationForm,
    onConfirmReservation,
    onCheckIn,
    onCancelReservation,
    onOpenDeposit,
}: POSCartPanelProps) {
    const { auth } = usePage<any>().props;
    const canCancel = !!(
        auth?.is_admin ||
        auth?.permissions?.includes('pos.cancel_item') ||
        auth?.permissions?.includes('kitchen.cancel_item')
    );
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
    const [isCheckoutDropUpOpen, setIsCheckoutDropUpOpen] = useState(false);

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

    const [isCancelReservationModalOpen, setIsCancelReservationModalOpen] = useState(false);

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

    const unconfirmedItems = cartItems.filter((i) => !i.isConfirmed);
    const hasStagedReductions = cartItems.some(
        (i) => (i.stagedReduceQty || 0) > 0,
    );
    const hasUnconfirmedChanges =
        unconfirmedItems.length > 0 || hasStagedReductions;

    const confirmedItems = cartItems.filter((i) => i.isConfirmed);
    const isPaymentBlocked =
        hasUnconfirmedChanges ||
        activeInvoiceId.startsWith('draft_');

    // Virtual "Mang đi" table (id = 0): orders belong to independent customers,
    // so the main button pays only the active order and bulk drop-up is hidden.
    const isTakeaway = selectedTable.id === 0;

    // Đơn đặt bàn (reserved) của TAB đang xem — orders là nguồn sự thật,
    // vì bàn occupied vẫn nhận đơn đặt chờ mà status bàn không đổi.
    const activeOrder =
        selectedTable.active_orders?.find(
            (o) => o.order_code === activeInvoiceId,
        ) || null;

    const reservedOrder =
        selectedTable.active_orders?.find(
            (o) => o.status === 'reserved' && o.order_code === activeInvoiceId,
        ) || null;

    const depositTotal = activeOrder?.deposit_total || 0;
    const netAmount = Math.max(0, totalAmount - depositTotal);

    // Fallback cho đặt bàn kiểu Manager (chỉ lưu trên tables, không có đơn)
    const reservationInfo = reservedOrder
        ? {
              name: reservedOrder.reservation_name,
              phone: reservedOrder.reservation_phone,
              time: reservedOrder.reservation_time,
              note: reservedOrder.reservation_note,
          }
        : selectedTable.status === 'reserved' && selectedTable.reservation_name && activeInvoiceId === 'draft_default'
          ? {
                name: selectedTable.reservation_name,
                phone: selectedTable.reservation_phone,
                time: selectedTable.reservation_time,
                note: selectedTable.reservation_note,
            }
          : null;

    return (
        <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900">
            <CancelReservationModal
                isOpen={isCancelReservationModalOpen}
                onClose={() => setIsCancelReservationModalOpen(false)}
                depositTotal={reservedOrder?.deposit_total || 0}
                onConfirm={(resolution, note) => {
                    if (reservedOrder && onCancelReservation) {
                        onCancelReservation(reservedOrder.id, resolution, note);
                    }

                    setIsCancelReservationModalOpen(false);
                }}
            />

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
            {/* Header (Fixed Top - Ultra Compact 1-Row) */}
            <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/70 px-3.5 py-2 select-none dark:border-zinc-800/80 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between gap-2">
                    {/* Left: Table Name & Subtle Status Dot */}
                    <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                        <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                selectedTable.status === 'occupied'
                                    ? 'bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900/50'
                                    : selectedTable.status === 'reserved'
                                    ? 'bg-purple-500 ring-2 ring-purple-200 dark:ring-purple-900/50'
                                    : 'bg-zinc-400'
                            }`}
                            title={
                                selectedTable.status === 'occupied'
                                    ? 'Đang phục vụ'
                                    : selectedTable.status === 'reserved'
                                    ? 'Đã đặt trước'
                                    : 'Bàn trống'
                            }
                        />
                        <h2 className="font-display text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
                            {selectedTable.table_number}
                        </h2>
                        {(selectedTable.merged_into_table ||
                            selectedTable.merged_into_table_id) && (
                            <span className="shrink-0 rounded-md bg-amber-100 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                                Gộp {selectedTable.merged_into_table?.table_number || `#${selectedTable.merged_into_table_id}`}
                            </span>
                        )}
                    </div>

                    {/* Middle: Compact Invoice Tabs */}
                    <div className="flex flex-1 items-center space-x-1 overflow-x-auto scrollbar-none min-w-0 px-1">
                        {Object.keys(tableCarts).map((invoiceId, idx) => {
                            const isDraft = invoiceId.startsWith('draft_');
                            const isActive = activeInvoiceId === invoiceId;
                            const invoiceCart = tableCarts[invoiceId] || [];
                            const isCompleted =
                                invoiceCart.length > 0 &&
                                invoiceCart.every((i) => i.isKitchenCompleted);

                            let label = invoiceId;

                            if (isDraft) {
                                label = `Đơn #${idx + 1}`;
                            }

                            return (
                                <button
                                    key={invoiceId}
                                    type="button"
                                    onClick={() => onSelectInvoice(invoiceId)}
                                    className={`group flex shrink-0 items-center space-x-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ${
                                        isActive
                                            ? isDraft
                                                ? 'bg-sky-600 text-white shadow-xs'
                                                : isCompleted
                                                  ? 'bg-emerald-600 text-white shadow-xs'
                                                  : 'bg-amber-600 text-white shadow-xs'
                                            : 'border border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
                                    } ${isDraft && !isActive ? 'border-dashed' : ''}`}
                                >
                                    <span className="truncate max-w-[90px]">{label}</span>
                                    {isDraft && invoiceCart.length === 0 && (
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveInvoice(invoiceId);
                                            }}
                                            className={`rounded p-0.5 transition-colors ${
                                                isActive
                                                    ? 'text-white/80 hover:bg-white/20 hover:text-white'
                                                    : 'text-zinc-400 hover:bg-zinc-200 hover:text-rose-600 dark:hover:bg-zinc-700'
                                            }`}
                                            role="button"
                                            aria-label="Xóa hóa đơn nháp này"
                                            title="Xóa hóa đơn nháp này"
                                        >
                                            <X className="h-3 w-3 stroke-[1.5]" />
                                        </span>
                                    )}
                                </button>
                            );
                        })}

                        <button
                            type="button"
                            onClick={onAddInvoice}
                            className="shrink-0 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-1 text-zinc-500 hover:border-sky-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                            title="Thêm hóa đơn mới"
                        >
                            <Plus className="h-3.5 w-3.5 stroke-2" />
                        </button>
                    </div>

                    {/* Right: Actions Menu Dropdown */}
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() =>
                                setIsActionsMenuOpen(!isActionsMenuOpen)
                            }
                            className="flex items-center justify-center rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
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
            </div>

            {/* Cart Items List (Independent Scroll Area) */}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {/* Reservation Banner */}
                {(reservationDraft || reservationInfo) && (
                    <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/80 p-3 dark:border-violet-900/40 dark:bg-violet-950/20">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="font-semibold text-violet-900 dark:text-violet-100">
                                    {reservationDraft?.name || reservationInfo?.name}
                                </h4>
                                <div className="mt-1 flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300">
                                    <span>{reservationDraft?.phone || reservationInfo?.phone}</span>
                                    <span className="h-1 w-1 rounded-full bg-violet-400"></span>
                                    <span>
                                        {(() => {
                                            const timeString = reservationDraft?.time || reservationInfo?.time;

                                            if (!timeString) {
return '';
}

                                            const d = new Date(timeString);
                                            const hh = String(d.getHours()).padStart(2, '0');
                                            const mm = String(d.getMinutes()).padStart(2, '0');
                                            const dd = String(d.getDate()).padStart(2, '0');
                                            const MM = String(d.getMonth() + 1).padStart(2, '0');

                                            return `${hh}:${mm} ${dd}/${MM}`;
                                        })()}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                {((reservedOrder?.deposit_total || 0) > 0) && (
                                    <span className="rounded-md border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300">
                                        Đã cọc {reservedOrder?.deposit_total?.toLocaleString('vi-VN')} đ
                                    </span>
                                )}
                                {reservedOrder && canCancel && (
                                    <button
                                        type="button"
                                        onClick={() => setIsCancelReservationModalOpen(true)}
                                        className="text-[10px] font-medium text-rose-600 hover:underline dark:text-rose-400"
                                    >
                                        Hủy đặt bàn
                                    </button>
                                )}
                            </div>
                        </div>
                        {(reservationDraft?.note || reservationInfo?.note) && (
                            <div className="mt-1 rounded-lg bg-white/60 px-2 py-1.5 text-xs text-violet-800 dark:bg-black/20 dark:text-violet-200">
                                {reservationDraft?.note || reservationInfo?.note}
                            </div>
                        )}
                    </div>
                )}
                
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
                                    có thể chuyển sang tab "Chọn món" để thêm
                                    sản phẩm.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    (() => {
                        const confirmedItems = cartItems.filter((i) => i.isConfirmed);
                        const draftItems = cartItems.filter((i) => !i.isConfirmed);

                        // Nhóm món đã gửi bếp theo "lần gọi": các món gửi cách nhau
                        // ≤ 60 giây thuộc cùng một lần gọi (cùng lượt "Gửi bếp").
                        const sortedConfirmed = [...confirmedItems].sort((a, b) => {
                            const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
                            const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;

                            return ta - tb || (a.orderItemId || 0) - (b.orderItemId || 0);
                        });
                        const callRounds: CartItem[][] = [];
                        let prevSentTime: number | null = null;
                        sortedConfirmed.forEach((item) => {
                            const t = item.sentAt ? new Date(item.sentAt).getTime() : null;

                            if (
                                callRounds.length === 0 ||
                                (t !== null && prevSentTime !== null && t - prevSentTime > 60_000)
                            ) {
                                callRounds.push([]);
                            }

                            callRounds[callRounds.length - 1].push(item);

                            if (t !== null) {
prevSentTime = t;
}
                        });
                        const hasMultipleRounds = callRounds.length > 1;
            
                        const renderItemRow = (item: CartItem) => {
                            const isMinusDisabled = !!(
                                item.isConfirmed &&
                                (item.isKitchenCompleted || item.quantity <= 0)
                            ) || selectedTable.status === 'reserved';
                            const isDeleteDisabled = !!item.isConfirmed || selectedTable.status === 'reserved';
                            const isPlusDisabled = selectedTable.status === 'reserved';
                            const itemKey = `${item.menu_item_id}_${item.isConfirmed ? (item.isKitchenCompleted ? (item.isServed ? 'served' : 'completed') : 'pending') : 'draft'}_${item.orderItemId || ''}`;
            
                            return (
                                <div
                                    key={itemKey}
                                    className={`group flex items-center gap-2 px-2.5 py-2.5 transition-colors duration-150 border-b border-zinc-100 dark:border-zinc-800 last:border-0 ${
                                        item.isConfirmed
                                            ? 'bg-zinc-50 dark:bg-zinc-800/60'
                                            : 'bg-sky-50/20 dark:bg-sky-950/10'
                                    }`}
                                >
                                    {/* Left: Name + Note */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                                {item.name}
                                            </h4>
                                            {item.isConfirmed && (
                                                <span
                                                    className={`shrink-0 rounded-md border px-1.5 py-px text-[10px] font-medium ${
                                                        item.isServed
                                                            ? 'border-emerald-250 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                            : item.isKitchenCompleted
                                                              ? 'border-sky-200 bg-sky-50 text-sky-850 dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-300'
                                                              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300'
                                                    }`}
                                                >
                                                    {item.isServed
                                                        ? 'Đã phục vụ'
                                                        : item.isKitchenCompleted
                                                          ? 'Bếp làm xong'
                                                          : 'Đang chế biến'}
                                                </span>
                                            )}
                                            {(item.stagedReduceQty || 0) > 0 && (
                                                <span className="shrink-0 rounded-md border border-amber-300 bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                                    Giảm {item.stagedReduceQty}
                                                </span>
                                            )}
                                        </div>
                                        <div
                                            onClick={() =>
                                                setNoteModalState({
                                                    isOpen: true,
                                                    item,
                                                })
                                            }
                                            className="mt-0.5 cursor-pointer text-[11px] text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
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
                                    </div>
            
                                    {/* Center: +/- controls */}
                                    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
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
                                            className="px-2.5 py-1.5 text-sm font-bold text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                            title={
                                                item.isConfirmed
                                                    ? 'Giảm số lượng món đang chế biến (kèm lý do)'
                                                    : 'Giảm số lượng món nháp'
                                            }
                                        >
                                            -
                                        </button>
                                        <span className="border-x border-zinc-200 px-3 py-1.5 text-sm font-bold text-zinc-900 tabular-nums dark:border-zinc-700 dark:text-zinc-100">
                                            {item.quantity}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={isPlusDisabled}
                                            onClick={() =>
                                                onUpdateQuantity(
                                                    item.menu_item_id,
                                                    1,
                                                )
                                            }
                                            className="px-2.5 py-1.5 text-sm font-bold text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                            title="Gọi thêm món"
                                        >
                                            +
                                        </button>
                                    </div>
            
                                    {/* Right: Price / Delete */}
                                    <div className="relative flex shrink-0 items-center justify-end" style={{ minWidth: '5rem' }}>
                                        <span className="text-sm font-bold text-zinc-900 tabular-nums transition-opacity duration-150 group-hover:opacity-0 dark:text-zinc-100">
                                            {(item.quantity * item.unit_price).toLocaleString('vi-VN')} đ
                                        </span>
                                        <div className="absolute inset-0 flex items-center justify-end opacity-60 transition-opacity duration-150 group-hover:opacity-100">
                                            {!isDeleteDisabled ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onRemoveItem(item.menu_item_id)
                                                    }
                                                    aria-label="Xóa món"
                                                    className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                                    title="Hủy chọn món nháp"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            ) : canCancel &&
                                              item.orderItemId &&
                                              !item.isKitchenCompleted &&
                                              (item.stagedReduceQty || 0) < item.quantity ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setReduceModalState({
                                                            isOpen: true,
                                                            item,
                                                        })
                                                    }
                                                    aria-label="Xóa món"
                                                    className="rounded-lg p-1.5 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                                                    title="Giảm / Hủy món đang chế biến kèm lý do"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            ) : (item.stagedReduceQty || 0) >= item.quantity ? (
                                                <span
                                                    className="cursor-not-allowed p-1.5 text-amber-500 dark:text-amber-400"
                                                    title="Món đã được giảm về 0, ấn ‘Gửi bếp chế biến’ để xác nhận"
                                                >
                                                    <Lock className="h-4 w-4" />
                                                </span>
                                            ) : (
                                                <span
                                                    className="cursor-not-allowed p-1.5 text-zinc-300 dark:text-zinc-600"
                                                    title={
                                                        item.isKitchenCompleted
                                                            ? 'Món đã hoàn thành chế biến, không thể hủy'
                                                            : 'Món đã gửi bếp không được xóa'
                                                    }
                                                >
                                                    <Lock className="h-4 w-4 text-zinc-400" />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        };
            
                        return (
                            <>
                                {/* Món đã gửi bếp, nhóm theo lần gọi. Lượt đầu tiên
                                    không hiển thị nhãn; khi có gọi thêm mới đánh số
                                    “Lần gọi 1”, “Lần gọi 2”... để dễ quan sát */}
                                {callRounds.map((roundItems, roundIdx) => (
                                    <div key={`round_${roundIdx}`} className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                                        {hasMultipleRounds && (
                                            <div className="border-b border-zinc-100 bg-zinc-50/80 px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-800/60">
                                                <span className="text-[10px] font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
                                                    Lần gọi {roundIdx + 1}
                                                </span>
                                                <span className="ml-1.5 text-[10px] text-zinc-400 tabular-nums dark:text-zinc-600">
                                                    ({roundItems.length} món)
                                                </span>
                                            </div>
                                        )}
                                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                            {roundItems.map(renderItemRow)}
                                        </div>
                                    </div>
                                ))}
            
                                {/* Draft items (not yet sent to kitchen) */}
                                {draftItems.length > 0 && (
                                    <div className="space-y-2">
                                        {draftItems.map(renderItemRow)}
                                    </div>
                                )}
                            </>
                        );
                    })()
                )}
            </div>

            {/* Financial Summary & Actions Footer (Fixed Bottom) */}
            <div className="shrink-0 space-y-3 border-t border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800/80 dark:bg-zinc-800/40">
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
                        <span>Trong đó VAT:</span>
                        <span className="font-semibold text-zinc-800 tabular-nums dark:text-zinc-200">
                            {vatInTotal.toLocaleString('vi-VN')} đ
                        </span>
                    </div>
                    {depositTotal > 0 && (
                        <div className="flex justify-between text-violet-600 dark:text-violet-400 font-medium">
                            <span>Đã đặt cọc:</span>
                            <span className="font-semibold tabular-nums">
                                −{depositTotal.toLocaleString('vi-VN')} đ
                            </span>
                        </div>
                    )}
                    <div className="flex justify-between border-t border-zinc-200/80 pt-1.5 text-sm font-bold text-zinc-900 dark:border-zinc-700/80 dark:text-zinc-100">
                        <span>Tổng thanh toán:</span>
                        <span className="text-base font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                            {netAmount.toLocaleString('vi-VN')} đ
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                    {reservedOrder || reservationDraft ? (
                        <>
                            {reservedOrder ? (
                                <>
                                    <div className="col-span-2">
                                        <button
                                            type="button"
                                            disabled={submitting}
                                            onClick={() => onCheckIn && onCheckIn(reservedOrder.id)}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            <LogIn className="h-4 w-4" />
                                            <span>Check-in (Khách đã đến)</span>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={onOpenReservationForm}
                                        className="flex items-center justify-center gap-2 rounded-xl border-2 border-violet-600 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-500 dark:text-violet-400 dark:hover:bg-violet-950/30"
                                    >
                                        Sửa thông tin
                                    </button>
                                    <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={onConfirmReservation}
                                        className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        <CalendarClock className="h-4 w-4" />
                                        <span>Xác nhận đặt bàn</span>
                                    </button>
                                </>
                            )}
                        </>
                    ) : (
                        <>
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
                        
                            {/* Split checkout button / Reservation button */}
                            <div className="relative flex">
                                {confirmedItems.length === 0 && !isTakeaway && activeInvoiceId.startsWith('draft_') ? (
                                    <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={onOpenReservationForm}
                                        className="flex flex-1 items-center justify-center space-x-1.5 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-violet-700 disabled:opacity-50"
                                        title="Đặt bàn cho khách (chưa gọi món)"
                                    >
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        <span>Đặt bàn</span>
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            disabled={
                                                submitting ||
                                                cartItems.length === 0 ||
                                                isPaymentBlocked ||
                                                isCheckoutLocked
                                            }
                                            onClick={onOpenPayment}
                                            className={`flex flex-1 items-center justify-center space-x-1.5 ${isTakeaway ? 'rounded-xl' : 'rounded-l-xl'} px-3 py-2.5 text-xs font-semibold transition-colors duration-150 ${
                                                isCheckoutLocked
                                                    ? 'cursor-not-allowed border border-rose-300 bg-rose-100 font-bold text-rose-700 opacity-90 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                                    : isPaymentBlocked
                                                    ? 'cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 opacity-60 dark:border-zinc-700 dark:bg-zinc-800'
                                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                                            }`}
                                            title={
                                                isCheckoutLocked
                                                    ? `Bàn này đang được thanh toán bởi ${checkoutLockedBy}`
                                                    : hasUnconfirmedChanges
                                                    ? 'Vui lòng bấm "Gửi bếp chế biến" để lưu giỏ hàng trước khi thanh toán'
                                                    : isTakeaway
                                                        ? 'Thanh toán đơn hiện tại'
                                                        : 'Thanh toán tất cả đơn'
                                            }
                                        >
                                            {isCheckoutLocked ? (
                                                <Lock className="h-3.5 w-3.5" />
                                            ) : (
                                                <CreditCard className="h-3.5 w-3.5" />
                                            )}
                                            <span>
                                                {isCheckoutLocked
                                                    ? `Đang TT: ${checkoutLockedBy}`
                                                    : 'Thanh toán'}
                                            </span>
                                        </button>
                                        {!isTakeaway && (
                                            <button
                                                type="button"
                                                disabled={isCheckoutLocked}
                                                onClick={() => setIsCheckoutDropUpOpen(!isCheckoutDropUpOpen)}
                                                title="Thanh toán riêng / Đặt cọc"
                                                className={`rounded-r-xl border-l border-emerald-500/30 px-1.5 py-2.5 text-white transition-colors disabled:opacity-50 ${
                                                    isCheckoutLocked
                                                        ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-700'
                                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                                }`}
                                            >
                                                <ChevronUp className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </>
                                )}
                
                                {/* Drop-up menu */}
                                {!isTakeaway && isCheckoutDropUpOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsCheckoutDropUpOpen(false)} />
                                        <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                                            <button
                                                type="button"
                                                disabled={isPaymentBlocked || isCheckoutLocked}
                                                onClick={() => {
                                                    setIsCheckoutDropUpOpen(false);

                                                    if (onOpenSinglePayment) {
onOpenSinglePayment();
}
                                                }}
                                                title={
                                                    isPaymentBlocked
                                                        ? 'Cần gửi hết món xuống Bếp và chờ Bếp hoàn tất mới thanh toán được'
                                                        : 'Thanh toán riêng đơn này'
                                                }
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                            >
                                                <CreditCard className="h-3.5 w-3.5 stroke-[1.5]" />
                                                <span>Thanh toán riêng đơn này</span>
                                            </button>
                                            {confirmedItems.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsCheckoutDropUpOpen(false);

                                                        if (onOpenDeposit) {
onOpenDeposit();
}
                                                    }}
                                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                >
                                                    <Banknote className="h-3.5 w-3.5 stroke-[1.5]" />
                                                    <span>Đặt cọc</span>
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
