import React, { useState } from 'react';
import { Head } from '@inertiajs/react';
import { Armchair, UtensilsCrossed } from 'lucide-react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import POSTableTab from './components/POSTableTab';
import POSMenuTab from './components/POSMenuTab';
import POSCartPanel from './components/POSCartPanel';
import PaymentDrawer from './components/PaymentDrawer';
import ReceiptPrintModal from './components/ReceiptPrintModal';
import ReservationConfirmModal from './components/ReservationConfirmModal';

import { POSManagerProps } from './types/pos.types';
import { usePOSTables } from './hooks/usePOSTables';
import { usePOSCart } from './hooks/usePOSCart';
import { usePOSCheckout } from './hooks/usePOSCheckout';

export default function POSManager({ tables, categories, products }: POSManagerProps) {
    const [activeTab, setActiveTab] = useState<'tables' | 'menu'>('tables');

    const {
        selectedTable,
        pendingReservationTable,
        handleSelectTable,
        handleConfirmReservationPrompt,
        setPendingReservationTable,
    } = usePOSTables(tables);

    const {
        currentCart,
        handleToggleProduct,
        handleUpdateQuantity,
        handleRemoveItem,
        handleUpdateNote,
        clearTableCart,
    } = usePOSCart(selectedTable, tables, products);

    const {
        submitting,
        isPaymentDrawerOpen,
        setIsPaymentDrawerOpen,
        receiptModal,
        setReceiptModal,
        handleSendToKitchen,
        handleConfirmPayment,
    } = usePOSCheckout();

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Đặt hàng POS & Quản lý bàn bán hàng" />

            {/* Full Width & Height Split Screen Container */}
            <div className="h-[calc(100vh-85px)] w-full overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-h-0">
                    {/* Left Panel (7 columns): Standalone Card for Tabs */}
                    <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col h-full min-h-0 shadow-xs">
                        {/* Top Fixed Tab Selector */}
                        <div className="shrink-0 flex items-center space-x-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-3">
                            <button
                                type="button"
                                onClick={() => setActiveTab('tables')}
                                className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center space-x-2 ${
                                    activeTab === 'tables'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                            >
                                <Armchair className="w-4 h-4" />
                                <span>Chọn bàn</span>
                                {selectedTable && (
                                    <span className="ml-1.5 px-2 py-0.5 rounded-full bg-white/20 text-[10px]">
                                        {selectedTable.table_number}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('menu')}
                                className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center space-x-2 ${
                                    activeTab === 'menu'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                            >
                                <UtensilsCrossed className="w-4 h-4" />
                                <span>Chọn món</span>
                                {currentCart.length > 0 && (
                                    <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 font-bold text-[10px]">
                                        {currentCart.reduce((s, i) => s + i.quantity, 0)}
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
                                />
                            ) : (
                                <POSMenuTab
                                    products={products}
                                    categories={categories}
                                    cartItems={currentCart}
                                    onToggleProduct={handleToggleProduct}
                                />
                            )}
                        </div>
                    </div>

                    {/* Right Panel (5 columns): Standalone Cart Panel Card */}
                    <div className="lg:col-span-5 h-full min-h-0">
                        <POSCartPanel
                            selectedTable={selectedTable}
                            cartItems={currentCart}
                            onUpdateQuantity={handleUpdateQuantity}
                            onRemoveItem={handleRemoveItem}
                            onUpdateNote={handleUpdateNote}
                            onSendToKitchen={() => handleSendToKitchen(selectedTable, currentCart)}
                            onOpenPayment={() => setIsPaymentDrawerOpen(true)}
                            submitting={submitting}
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
                onConfirmPayment={(paymentMethod, amountReceived, changeAmount, shouldPrint) =>
                    handleConfirmPayment(
                        selectedTable,
                        currentCart,
                        paymentMethod,
                        amountReceived,
                        changeAmount,
                        shouldPrint,
                        () => clearTableCart(selectedTable?.id)
                    )
                }
                submitting={submitting}
            />

            {/* K80 Thermal Receipt Printable Modal */}
            <ReceiptPrintModal
                isOpen={receiptModal.isOpen}
                onClose={() => setReceiptModal((prev) => ({ ...prev, isOpen: false }))}
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
