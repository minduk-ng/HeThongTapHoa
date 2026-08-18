import { Head, router } from '@inertiajs/react';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import PaymentDrawer from './components/PaymentDrawer';
import POSCartPanel from './components/POSCartPanel';
import type { SystemLogEntry } from './components/POSLogTab';
import POSLogTab from './components/POSLogTab';
import POSMenuTab from './components/POSMenuTab';
import POSTableTab from './components/POSTableTab';
import POSToolbar from './components/POSToolbar';
import ReceiptPrintModal from './components/ReceiptPrintModal';
import ReservationFormDrawer from './components/ReservationFormDrawer';

import { usePOSCart } from './hooks/usePOSCart';
import { usePOSCheckout } from './hooks/usePOSCheckout';
import { usePOSReservation } from './hooks/usePOSReservation';
import { usePOSTables } from './hooks/usePOSTables';
import type { POSManagerProps } from './types/pos.types';
import type { POSTableData, POSProductData, CategoryData, PromotionCandidate, ReceiptModalState } from './types/pos.types';

export default function POSManager({ tables, categories, products, promotions }: POSManagerProps) {
    const safeTables = (Array.isArray(tables) ? tables : Object.values(tables || {})) as POSTableData[];
    const safeCategories = (Array.isArray(categories) ? categories : Object.values(categories || {})) as CategoryData[];
    const safeProducts = (Array.isArray(products) ? products : Object.values(products || {})) as POSProductData[];
    const safePromotions = (Array.isArray(promotions) ? promotions : Object.values(promotions || {})) as PromotionCandidate[];

    const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'log'>('tables');
    const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
    const [unreadErrorCount, setUnreadErrorCount] = useState<number>(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [autoSwitchToMenu, setAutoSwitchToMenu] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('pos_auto_switch_to_menu') === 'true';
        }

        return false;
    });

    const handleAutoSwitchChange = useCallback((value: boolean) => {
        setAutoSwitchToMenu(value);
        localStorage.setItem('pos_auto_switch_to_menu', String(value));
    }, []);

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
        draftTableCounts,
        handleSelectTable,
    } = usePOSTables(safeTables);

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
    } = usePOSCart(selectedTable, safeTables, safeProducts);

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
            const channel = window.Echo.private('pos-channel');

            const handleTableReload = (eventName: string, payload?: any) => {
                const eventKey = `${eventName}_${payload?.order_id || payload?.table_id || ''}`;

                if (isDuplicateEvent(eventKey)) {
return;
}

                if (eventName === 'OrderCompleted') {
                    addLogEntry('received', 'Bếp vừa chế biến hoàn thành đơn hàng', 'Món ăn đã sẵn sàng phục vụ');
                } else if (eventName === 'TableTransferred') {
                    const sourceStr = payload?.source_table_number ? `Bàn ${payload.source_table_number}` : 'Bàn';
                    const targetStr = payload?.target_table_number ? `Bàn ${payload.target_table_number}` : 'Bàn';
                    addLogEntry('received', `Đã chuyển / gộp ${sourceStr} sang ${targetStr}`, 'Cập nhật sơ đồ bàn');
                } else if (eventName === 'TableStatusUpdated' && payload?.action === 'checkout') {
                    const orderCode = payload.meta?.order_code ? `Hóa đơn #${payload.meta.order_code}` : 'Hóa đơn';
                    const tblNum = payload.table_number ? `Bàn ${payload.table_number}` : `Bàn #${payload.table_id}`;
                    addLogEntry('received', 'Thanh toán thành công', `${orderCode} tại ${tblNum} đã được thanh toán thành công`);
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

                if (isDuplicateEvent(eventKey)) {
return;
}

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


            const handleItemsServed = (payload: any) => {
                const eventKey = `ItemsServed_${payload?.order_ids?.join('_') || ''}`;

                if (isDuplicateEvent(eventKey)) {
return;
}

                const tableStr = payload?.table_number ? `Bàn ${payload.table_number}` : 'đơn hàng';
                addLogEntry('received', `Nhân viên đã phục vụ ${payload?.served_count || 0} món tại ${tableStr}`, 'Cập nhật trạng thái giỏ hàng');

                router.reload({ only: ['tables'], onError: () => {} });
            };

            channel
                .listen('.OrderSentToKitchen', handleOrderSent)
                .listen('.OrderCompleted', (data: any) => handleTableReload('OrderCompleted', data))
                .listen('.TableStatusUpdated', (data: any) => handleTableReload('TableStatusUpdated', data))
                .listen('.TableTransferred', (data: any) => handleTableReload('TableTransferred', data))
                .listen('.ItemsServed', handleItemsServed);

            return () => {
                window.Echo.leave('pos-channel');
            };
        }
    }, [selectedTable, clearUnconfirmedDraft, addLogEntry, isDuplicateEvent]);

    const {
        submitting: checkoutSubmitting,
        isPaymentDrawerOpen,
        setIsPaymentDrawerOpen,
        applyPromotion,
        clearPromotion,
        lockedCheckoutTables,
        receiptModal,
        setReceiptModal,
        handleSendToKitchen,
        handleConfirmPayment,
        handleBulkCheckout,
        selectedAutoId,
        setSelectedAutoId,
        appliedPromotions,
        totalDiscount,
        applyAutoPromotions,
        loadAvailablePromotions,
    } = usePOSCheckout(selectedTable, safeTables, safePromotions);

    const {
        getDraft,
        setDraft,
        clearDraft,
        submitReservation,
        checkInReservation,
        cancelReservation,
        submitDeposit,
        isLoading: reservationLoading
    } = usePOSReservation();

    const submitting = checkoutSubmitting || reservationLoading;

    const [paymentMode, setPaymentMode] = useState<'bulk' | 'single'>('bulk');
    const [drawerMode, setDrawerMode] = useState<'payment' | 'deposit' | 'reservation'>('payment');
    const [isReservationFormOpen, setIsReservationFormOpen] = useState(false);

    const activeInvoiceIdForTable = selectedTable ? (activeInvoiceId[selectedTable.id] || 'draft_default') : 'draft_default';
    const currentReservationDraft = selectedTable ? getDraft(selectedTable.id, activeInvoiceIdForTable) : null;
    
    // Calculate deposit total and order codes
    const activeOrderForDrawer = selectedTable?.active_orders?.find(
        (o) => o.order_code === activeInvoiceIdForTable || `order_${o.id}` === activeInvoiceIdForTable
    ) || selectedTable?.active_order;

    const singleDepositTotal = activeOrderForDrawer?.deposit_total || 0;
    const singleOrderCode = activeOrderForDrawer?.order_code ? [activeOrderForDrawer.order_code] : [];

    const bulkConfirmedOrders = selectedTable?.active_orders?.filter(o => o.status !== 'reserved' && o.status !== 'paid' && o.status !== 'cancelled') || [];
    const bulkDepositTotal = bulkConfirmedOrders.reduce((sum, o) => sum + (o.deposit_total || 0), 0);
    const bulkOrderCodes = bulkConfirmedOrders.map(o => o.order_code || '').filter(Boolean);

    const currentDepositTotal = paymentMode === 'bulk' ? bulkDepositTotal : singleDepositTotal;
    const currentOrderCodes = paymentMode === 'bulk' ? bulkOrderCodes : singleOrderCode;

    // Virtual "Mang đi" table (id = 0) holds orders of independent customers,
    // so bulk checkout across all of them is never valid there.
    const isTakeawayTable = selectedTable?.id === 0;

    // All confirmed items across every order of the table/merged group,
    // used by PaymentDrawer in bulk mode so totals cover all orders.
    const bulkCartItems = useMemo(() => {
        if (!selectedTable) {
return [];
}

        const carts = tableCarts[selectedTable.id] || {};
        const activeOrderCodes = safeTables.find(t => t.id === selectedTable.id)?.active_orders
            ?.filter(o => o.status !== 'reserved' && o.status !== 'paid' && o.status !== 'cancelled')
            ?.map(o => o.order_code)
            ?.filter(Boolean) || [];

        return Object.entries(carts)
            .filter(([invId]) => activeOrderCodes.includes(invId))
            .flatMap(([, items]) => items);
    }, [selectedTable, tableCarts, safeTables]);

    const paymentCart = paymentMode === 'bulk' && drawerMode === 'payment' ? bulkCartItems : currentCart;

    useEffect(() => {
        if (isPaymentDrawerOpen && drawerMode === 'payment' && paymentCart.length > 0) {
            const subtotal = paymentCart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
            const items = paymentCart.map((item) => ({
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
            }));
            // Load danh sách auto promotion + estimated_discount, tự pick best nếu chưa chọn
            loadAvailablePromotions(subtotal, items);
            applyAutoPromotions(subtotal, items);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPaymentDrawerOpen, drawerMode, selectedAutoId]);

    const isCurrentTableCheckoutLocked = useMemo(() => {
        if (!selectedTable) {
return false;
}

        const groupId = selectedTable.merged_into_table_id || selectedTable.id;
        const groupTableIds = safeTables
            .filter((t) => t.id === groupId || t.merged_into_table_id === groupId)
            .map((t) => t.id);

        return groupTableIds.some((id) => !!lockedCheckoutTables[id]);
    }, [selectedTable, safeTables, lockedCheckoutTables]);

    const currentTableLockedBy = useMemo(() => {
        if (!selectedTable) {
return '';
}

        const groupId = selectedTable.merged_into_table_id || selectedTable.id;
        const groupTableIds = safeTables
            .filter((t) => t.id === groupId || t.merged_into_table_id === groupId)
            .map((t) => t.id);

        const lockedId = groupTableIds.find((id) => !!lockedCheckoutTables[id]);

        return lockedId ? lockedCheckoutTables[lockedId].employeeName : '';
    }, [selectedTable, safeTables, lockedCheckoutTables]);


    return (
        <DashboardLayout fullWidth={true} hideNavbar={true}>
            <Head title="Đặt hàng POS & Quản lý bàn bán hàng" />

            {/* Custom POS Toolbar — 44px */}
            <POSToolbar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                selectedTable={selectedTable}
                cartItemCount={currentCart.reduce((s, i) => s + i.quantity, 0)}
                unreadErrorCount={unreadErrorCount}
                onOpenLog={() => setUnreadErrorCount(0)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            {/* Full Width & Height Split Screen Container */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-h-0">
                    {/* Left Panel (7 columns): Standalone Card for Tabs */}
                    <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col h-full min-h-0 shadow-xs">
                        {/* Content Area with Independent Scroll */}
                        <div className="flex-1 overflow-hidden min-h-0">
                            {activeTab === 'tables' ? (
                                <POSTableTab
                                    tables={safeTables}
                                    selectedTable={selectedTable}
                                    onSelectTable={(table) => {
                                        handleSelectTable(table);

                                        if (autoSwitchToMenu) {
                                            setActiveTab('menu');
                                        }
                                    }}
                                    lockedCheckoutTables={lockedCheckoutTables}
                                    draftTableCounts={draftTableCounts}
                                    autoSwitchToMenu={autoSwitchToMenu}
                                    onAutoSwitchChange={handleAutoSwitchChange}
                                    searchQuery={searchQuery}
                                />
                            ) : activeTab === 'menu' ? (
                                <POSMenuTab
                                    products={safeProducts}
                                    categories={safeCategories}
                                    cartItems={currentCart}
                                    onToggleProduct={handleToggleProduct}
                                    searchQuery={searchQuery}
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
                            tables={safeTables}
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
                                    handleSendToKitchen(selectedTable, currentCart, activeInvoiceIdForTable, () => {
                                        clearUnconfirmedDraft(selectedTable.id, activeInvoiceIdForTable);
                                    });
                                }
                            }}
                            onOpenPayment={() => {
 setPaymentMode(isTakeawayTable ? 'single' : 'bulk'); setDrawerMode('payment'); setIsPaymentDrawerOpen(true); 
}}
                            onOpenSinglePayment={() => {
 setPaymentMode('single'); setDrawerMode('payment'); setIsPaymentDrawerOpen(true); 
}}
                            submitting={submitting}
                            isCheckoutLocked={isCurrentTableCheckoutLocked}
                            checkoutLockedBy={currentTableLockedBy}
                            reservationDraft={currentReservationDraft}
                            onOpenReservationForm={() => setIsReservationFormOpen(true)}
                            onConfirmReservation={() => {
                                setDrawerMode('reservation');
                                setIsPaymentDrawerOpen(true);
                            }}
                            onCheckIn={(orderId) => {
                                checkInReservation(orderId, () => {
                                    router.reload({ only: ['tables'] });
                                });
                            }}
                            onCancelReservation={(orderId, resolution, note) => {
                                cancelReservation(orderId, resolution, note, () => {
                                    router.reload({ only: ['tables'] });
                                });
                            }}
                            onOpenDeposit={() => {
                                setPaymentMode('single');
                                setDrawerMode('deposit');
                                setIsPaymentDrawerOpen(true);
                            }}
                        />
                    </div>
                </div>
            </div>



            <PaymentDrawer
                isOpen={isPaymentDrawerOpen}
                onClose={() => {
                    setIsPaymentDrawerOpen(false);
                    setTimeout(() => setDrawerMode('payment'), 200);
                }}
                selectedTable={selectedTable}
                cartItems={paymentMode === 'bulk' && drawerMode === 'payment' ? bulkCartItems : currentCart}
                mode={drawerMode}
                orderCodes={currentOrderCodes}
                depositTotal={currentDepositTotal}
                reservationDraft={currentReservationDraft}
                promotions={safePromotions}
                selectedAutoId={selectedAutoId}
                onSelectAuto={setSelectedAutoId}
                appliedPromotions={appliedPromotions}
                totalDiscount={totalDiscount}
                onApplyPromotion={applyPromotion}
                onClearPromotion={clearPromotion}
                onConfirmPayment={(paymentMethod, amountReceived, changeAmount, shouldPrint) => {
                    if (selectedTable) {
                        if (paymentMode === 'bulk') {
                            handleBulkCheckout(
                                selectedTable,
                                bulkConfirmedOrders,
                                paymentMethod,
                                amountReceived,
                                changeAmount,
                                shouldPrint,
                                bulkCartItems,
                                selectedTable,
                                bulkDepositTotal,
                                () => clearTableCart(selectedTable.id),
                            );
                        } else {
                            handleConfirmPayment(
                                selectedTable,
                                currentCart,
                                activeInvoiceIdForTable,
                                paymentMethod,
                                amountReceived,
                                changeAmount,
                                shouldPrint,
                                () => clearTableCart(selectedTable.id, activeInvoiceIdForTable),
                                addLogEntry
                            );
                        }
                    }
                }}
                onConfirmDeposit={(amount, method) => {
                    if (activeOrderForDrawer?.id) {
                        return submitDeposit(activeOrderForDrawer.id, amount, method, () => {
                            setIsPaymentDrawerOpen(false);
                            setDrawerMode('payment');
                            router.reload({ only: ['tables'] });
                        });
                    }
                }}
                onConfirmReservation={(deposit) => {
                    if (selectedTable && currentReservationDraft) {
                        const newItems = currentCart
                            .filter(i => !i.isConfirmed && i.quantity > 0)
                            .map(i => ({ menu_item_id: i.menu_item_id, quantity: i.quantity }));
                        
                        return submitReservation({
                            table_id: selectedTable.id,
                            reservation_name: currentReservationDraft.name,
                            reservation_phone: currentReservationDraft.phone,
                            reservation_time: currentReservationDraft.time,
                            reservation_note: currentReservationDraft.note,
                            deposit_amount: deposit?.amount || 0,
                            payment_method: deposit?.method || 'cash',
                            items: newItems
                        }, () => {
                            clearDraft(selectedTable.id, activeInvoiceIdForTable);
                            clearUnconfirmedDraft(selectedTable.id, activeInvoiceIdForTable);
                            setIsPaymentDrawerOpen(false);
                            setDrawerMode('payment');
                            router.reload({ only: ['tables'] });
                        });
                    }
                }}
                submitting={submitting}
            />

            <ReservationFormDrawer
                isOpen={isReservationFormOpen}
                onClose={() => setIsReservationFormOpen(false)}
                table={selectedTable}
                initialDraft={currentReservationDraft}
                onSubmit={(draft) => {
                    if (selectedTable) {
                        setDraft(selectedTable.id, activeInvoiceIdForTable, draft);
                    }

                    setIsReservationFormOpen(false);
                }}
            />

            {/* K80 Thermal Receipt Printable Modal */}
            <ReceiptPrintModal
                isOpen={receiptModal.isOpen}
                onClose={() => setReceiptModal((prev: ReceiptModalState) => ({ ...prev, isOpen: false }))}
                selectedTable={receiptModal.table}
                cartItems={receiptModal.cartItems}
                paymentMethod={receiptModal.paymentMethod}
                amountReceived={receiptModal.amountReceived}
                changeAmount={receiptModal.changeAmount}
                invoiceCode={receiptModal.invoiceCode}
                depositAmount={receiptModal.depositAmount}
                depositRefund={receiptModal.depositRefund}
                promotionDiscount={receiptModal.promotionDiscount}
            />
        </DashboardLayout>
    );
}
