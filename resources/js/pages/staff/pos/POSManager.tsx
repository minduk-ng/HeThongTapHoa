import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import { Armchair, UtensilsCrossed, Activity } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import POSTableTab from './components/POSTableTab';
import POSMenuTab from './components/POSMenuTab';
import POSCartPanel from './components/POSCartPanel';
import POSLogTab, { SystemLogEntry } from './components/POSLogTab';
import PaymentDrawer from './components/PaymentDrawer';
import ReceiptPrintModal from './components/ReceiptPrintModal';
import ReservationConfirmModal from './components/ReservationConfirmModal';

import { POSManagerProps } from './types/pos.types';
import { usePOSTables } from './hooks/usePOSTables';
import { usePOSCart } from './hooks/usePOSCart';
import { usePOSCheckout } from './hooks/usePOSCheckout';

export default function POSManager({ tables, categories, products }: POSManagerProps) {
    const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'log'>('tables');
    const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
    const [unreadErrorCount, setUnreadErrorCount] = useState<number>(0);

    const addLogEntry = useCallback((type: 'sent' | 'received' | 'error', message: string, details?: string) => {
        const d = new Date();
        const timestamp = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const newEntry: SystemLogEntry = {
            id: `${Date.now()}_${Math.random()}`,
            timestamp,
            type,
            source: 'POS',
            message,
            details,
        };
        setSystemLogs((prev) => [newEntry, ...prev.slice(0, 99)]);
        if (type === 'error') {
            setUnreadErrorCount((prev) => prev + 1);
        }
    }, []);

    // Silent background reload for ingredient stock updates
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const channel = window.Echo.private('inventory-channel');
            channel.listen('.IngredientStockUpdated', () => {
                router.reload({
                    only: ['products'],
                    onError: () => {},
                });
            });

            return () => {
                window.Echo.leave('inventory-channel');
            };
        }
    }, []);

    const {
        selectedTable,
        pendingReservationTable,
        handleSelectTable,
        handleConfirmReservationPrompt,
        setPendingReservationTable,
        draftTableCounts,
    } = usePOSTables(tables);

    const {
        tableCarts,
        currentCart,
        activeInvoiceId,
        setActiveInvoiceId,
        addNewDraftInvoice,
        removeDraftInvoice,
        handleToggleProduct,
        handleUpdateQuantity,
        handleStageReduction,
        handleRemoveItem,
        handleUpdateNote,
        clearTableCart,
        clearUnconfirmedDraft,
    } = usePOSCart(selectedTable, tables, products);

    const lastEventRef = useRef<{ key: string; time: number }>({ key: '', time: 0 });

    const isDuplicateEvent = useCallback((eventKey: string) => {
        const now = Date.now();
        if (lastEventRef.current.key === eventKey && now - lastEventRef.current.time < 1000) {
            return true;
        }
        lastEventRef.current = { key: eventKey, time: now };
        return false;
    }, []);

    // Realtime WebSocket Listener via Reverb for POS tables & orders updates
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Echo) {
            const channel = window.Echo.channel('pos-channel');

            const handleTableReload = (eventName: string, payload?: any) => {
                const eventKey = `${eventName}_${payload?.order_id || payload?.table_id || ''}`;
                if (isDuplicateEvent(eventKey)) return;

                if (eventName === 'OrderCompleted') {
                    addLogEntry('received', 'Bếp vừa chế biến hoàn thành đơn hàng', 'Món ăn đã sẵn sàng phục vụ');
                } else if (eventName === 'TableTransferred') {
                    const sourceStr = payload?.source_table_number ? `Bàn ${payload.source_table_number}` : 'Bàn';
                    const targetStr = payload?.target_table_number ? `Bàn ${payload.target_table_number}` : 'Bàn';
                    addLogEntry('received', `Đã chuyển / gộp ${sourceStr} sang ${targetStr}`, 'Cập nhật sơ đồ bàn');
                } else {
                    addLogEntry('received', 'Cập nhật trạng thái bàn phục vụ', 'Đồng bộ hệ thống');
                }

                router.reload({
                    only: ['tables'],
                    onError: () => {},
                });
            };

            const handleOrderSent = (payload?: any) => {
                const eventKey = `OrderSentToKitchen_${payload?.order_id || ''}_${payload?.action_type || ''}`;
                if (isDuplicateEvent(eventKey)) return;

                if (selectedTable) {
                    clearUnconfirmedDraft(selectedTable.id);
                }

                if (payload?.action_type === 'cancel_order') {
                    const tableStr = payload?.table_number ? `Bàn #${payload.table_number}` : 'đơn hàng';
                    addLogEntry('received', `Đã hủy toàn bộ đơn hàng tại ${tableStr}`, payload?.log_message || 'Giải phóng bàn');
                } else if (payload?.action_type === 'cancel_item') {
                    const tableStr = payload?.table_number ? `Bàn #${payload.table_number}` : 'đơn hàng';
                    addLogEntry('received', `Bếp vừa hủy 1 món tại ${tableStr}`, payload?.log_message || 'Cập nhật lại đơn hàng');
                } else {
                    addLogEntry('received', 'Bếp đã xác nhận nhận vé order chế biến', 'Đơn hàng đang chuẩn bị');
                }

                router.reload({
                    only: ['tables'],
                    onError: () => {},
                });
            };

            channel
                .listen('.OrderSentToKitchen', handleOrderSent)
                .listen('.OrderCompleted', (data: any) => handleTableReload('OrderCompleted', data))
                .listen('.TableStatusUpdated', (data: any) => handleTableReload('TableStatusUpdated', data))
                .listen('.TableTransferred', (data: any) => handleTableReload('TableTransferred', data));

            return () => {
                window.Echo.leave('pos-channel');
            };
        }
    }, [selectedTable, clearUnconfirmedDraft, addLogEntry, isDuplicateEvent]);

    const {
        submitting,
        isPaymentDrawerOpen,
        setIsPaymentDrawerOpen,
        lockedCheckoutTables,
        receiptModal,
        setReceiptModal,
        handleSendToKitchen,
        handleConfirmPayment,
    } = usePOSCheckout(selectedTable, tables);

    const isCurrentTableCheckoutLocked = useMemo(() => {
        if (!selectedTable) return false;
        const groupId = selectedTable.merged_into_table_id || selectedTable.id;
        const groupTableIds = tables
            .filter((t) => t.id === groupId || t.merged_into_table_id === groupId)
            .map((t) => t.id);

        return groupTableIds.some((id) => !!lockedCheckoutTables[id]);
    }, [selectedTable, tables, lockedCheckoutTables]);

    const currentTableLockedBy = useMemo(() => {
        if (!selectedTable) return '';
        const groupId = selectedTable.merged_into_table_id || selectedTable.id;
        const groupTableIds = tables
            .filter((t) => t.id === groupId || t.merged_into_table_id === groupId)
            .map((t) => t.id);

        const lockedId = groupTableIds.find((id) => !!lockedCheckoutTables[id]);
        return lockedId ? lockedCheckoutTables[lockedId].employeeName : '';
    }, [selectedTable, tables, lockedCheckoutTables]);

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Đặt hàng POS & Quản lý bàn bán hàng" />

            {/* Full Width & Height Split Screen Container */}
            <div className="h-full w-full min-h-0 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-h-0">
                    {/* Left Panel (7 columns): Standalone Card for Tabs */}
                    <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col h-full min-h-0 shadow-xs">
                        {/* Top Fixed Tab Selector */}
                        <div className="shrink-0 flex items-center space-x-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-3">
                            <button
                                type="button"
                                onClick={() => setActiveTab('tables')}
                                className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center space-x-1.5 ${
                                    activeTab === 'tables'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                            >
                                <Armchair className="w-4 h-4 stroke-[1.5]" />
                                <span>Chọn bàn</span>
                                {selectedTable && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                                        {selectedTable.table_number}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('menu')}
                                className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center space-x-1.5 ${
                                    activeTab === 'menu'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                            >
                                <UtensilsCrossed className="w-4 h-4 stroke-[1.5]" />
                                <span>Chọn món</span>
                                {currentCart.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 font-bold text-[10px]">
                                        {currentCart.reduce((s, i) => s + i.quantity, 0)}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTab('log');
                                    setUnreadErrorCount(0);
                                }}
                                className={`p-2.5 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center relative ${
                                    activeTab === 'log'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                                title="Nhật ký hoạt động hệ thống"
                            >
                                <Activity className="w-4 h-4 stroke-[1.5]" />
                                {unreadErrorCount > 0 && (
                                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] tabular-nums animate-pulse border border-white dark:border-zinc-900 shadow-xs">
                                        {unreadErrorCount}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Content Area with Independent Scroll */}
                        <div className="flex-1 overflow-hidden min-h-0">
                            {activeTab === 'tables' ? (
                                <POSTableTab
                                    tables={tables}
                                    selectedTable={selectedTable}
                                    onSelectTable={handleSelectTable}
                                    lockedCheckoutTables={lockedCheckoutTables}
                                    draftTableCounts={draftTableCounts}
                                />
                            ) : activeTab === 'menu' ? (
                                <POSMenuTab
                                    products={products}
                                    categories={categories}
                                    cartItems={currentCart}
                                    onToggleProduct={handleToggleProduct}
                                />
                            ) : (
                                <POSLogTab
                                    logs={systemLogs}
                                    onClearLogs={() => setSystemLogs([])}
                                />
                            )}
                        </div>
                    </div>

                    {/* Right Panel (5 columns): Standalone Cart Panel Card */}
                    <div className="lg:col-span-5 h-full min-h-0">
                        <POSCartPanel
                            selectedTable={selectedTable}
                            tables={tables}
                            cartItems={currentCart}
                            activeInvoiceId={selectedTable ? (activeInvoiceId[selectedTable.id] || 'draft_default') : 'draft_default'}
                            tableCarts={selectedTable ? (tableCarts[selectedTable.id] || {}) : {}}
                            onSelectInvoice={(invId) => selectedTable && setActiveInvoiceId(prev => ({ ...prev, [selectedTable.id]: invId }))}
                            onAddInvoice={() => selectedTable && addNewDraftInvoice(selectedTable.id)}
                            onRemoveInvoice={(invId) => selectedTable && removeDraftInvoice(selectedTable.id, invId)}
                            onUpdateQuantity={handleUpdateQuantity}
                            onStageReduction={handleStageReduction}
                            onRemoveItem={handleRemoveItem}
                            onUpdateNote={handleUpdateNote}
                            onSendToKitchen={() => {
                                if (selectedTable) {
                                    const activeId = activeInvoiceId[selectedTable.id] || 'draft_default';
                                    handleSendToKitchen(selectedTable, currentCart, activeId, () => {
                                        clearUnconfirmedDraft(selectedTable.id);
                                    });
                                }
                            }}
                            onOpenPayment={() => setIsPaymentDrawerOpen(true)}
                            submitting={submitting}
                            isCheckoutLocked={isCurrentTableCheckoutLocked}
                            checkoutLockedBy={currentTableLockedBy}
                        />
                    </div>
                </div>
            </div>

            {/* Reservation Confirmation Modal Popup */}
            <ReservationConfirmModal
                isOpen={!!pendingReservationTable}
                onClose={() => setPendingReservationTable(null)}
                table={pendingReservationTable}
                onConfirm={handleConfirmReservationPrompt}
            />

            {/* Payment Sliding Drawer Overlay */}
            <PaymentDrawer
                isOpen={isPaymentDrawerOpen}
                onClose={() => setIsPaymentDrawerOpen(false)}
                selectedTable={selectedTable}
                cartItems={currentCart}
                onConfirmPayment={(paymentMethod, amountReceived, changeAmount, shouldPrint) => {
                    if (selectedTable) {
                        const activeId = activeInvoiceId[selectedTable.id] || 'draft_default';
                        handleConfirmPayment(
                            selectedTable,
                            currentCart,
                            activeId,
                            paymentMethod,
                            amountReceived,
                            changeAmount,
                            shouldPrint,
                            () => clearTableCart(selectedTable.id)
                        );
                    }
                }}
                submitting={submitting}
            />

            {/* K80 Thermal Receipt Printable Modal */}
            <ReceiptPrintModal
                isOpen={receiptModal.isOpen}
                onClose={() => setReceiptModal((prev: import('./types/pos.types').ReceiptModalState) => ({ ...prev, isOpen: false }))}
                selectedTable={receiptModal.table}
                cartItems={receiptModal.cartItems}
                paymentMethod={receiptModal.paymentMethod}
                amountReceived={receiptModal.amountReceived}
                changeAmount={receiptModal.changeAmount}
                invoiceCode={receiptModal.invoiceCode}
            />
        </DashboardLayout>
    );
}
