import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import POSTableTab, { POSTableData } from './components/POSTableTab';
import POSMenuTab, { CategoryData, POSProductData } from './components/POSMenuTab';
import POSCartPanel, { CartItem } from './components/POSCartPanel';
import PaymentDrawer from './components/PaymentDrawer';
import ReceiptPrintModal from './components/ReceiptPrintModal';

interface POSManagerProps {
    tables: POSTableData[];
    categories: CategoryData[];
    products: POSProductData[];
}

export default function POSManager({ tables, categories, products }: POSManagerProps) {
    const [activeTab, setActiveTab] = useState<'tables' | 'menu'>('tables');
    const [selectedTable, setSelectedTable] = useState<POSTableData | null>(tables[0] || null);

    const [tableCarts, setTableCarts] = useState<Record<number, CartItem[]>>({});
    const [submitting, setSubmitting] = useState(false);

    // Payment & Receipt Print Modals State
    const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
    const [receiptModal, setReceiptModal] = useState<{
        isOpen: boolean;
        paymentMethod: 'cash' | 'bank_transfer';
        amountReceived: number;
        changeAmount: number;
        cartItems: CartItem[];
        table: POSTableData | null;
        invoiceCode?: string;
    }>({
        isOpen: false,
        paymentMethod: 'cash',
        amountReceived: 0,
        changeAmount: 0,
        cartItems: [],
        table: null,
    });

    useEffect(() => {
        const initialCarts: Record<number, CartItem[]> = {};
        tables.forEach((table) => {
            const mergedMap: Record<number, CartItem> = {};
            const allOrders = table.active_orders || (table.active_order ? [table.active_order] : []);

            allOrders.forEach((order) => {
                if (order.items) {
                    order.items.forEach((item) => {
                        const existing = mergedMap[item.menu_item_id];
                        if (existing) {
                            existing.quantity += item.quantity;
                            existing.initialQuantity = (existing.initialQuantity || 0) + item.quantity;
                        } else {
                            mergedMap[item.menu_item_id] = {
                                menu_item_id: item.menu_item_id,
                                name: item.menu_item?.name || 'Món',
                                quantity: item.quantity,
                                initialQuantity: item.quantity,
                                unit_price: item.unit_price,
                                vat_rate: item.menu_item?.vat_rate || 0,
                                note: item.note || '',
                                isConfirmed: true,
                            };
                        }
                    });
                }
            });

            initialCarts[table.id] = Object.values(mergedMap);
        });
        setTableCarts(initialCarts);
    }, [tables]);

    const handleSelectTable = (table: POSTableData) => {
        setSelectedTable(table);
    };

    const currentCart = selectedTable ? tableCarts[selectedTable.id] || [] : [];

    const handleToggleProduct = (product: POSProductData) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];

        const index = existingCart.findIndex((i) => i.menu_item_id === product.id);

        if (index > -1) {
            const existingItem = existingCart[index];
            if (!existingItem.isConfirmed) {
                const updated = existingCart.filter((i) => i.menu_item_id !== product.id);
                setTableCarts({ ...tableCarts, [tableId]: updated });
            } else {
                const updated = [...existingCart];
                updated[index] = { ...existingItem, quantity: existingItem.quantity + 1 };
                setTableCarts({ ...tableCarts, [tableId]: updated });
            }
        } else {
            const newItem: CartItem = {
                menu_item_id: product.id,
                name: product.name,
                quantity: 1,
                initialQuantity: 0,
                unit_price: Number(product.price),
                vat_rate: Number(product.vat_rate || 0),
                note: '',
                isConfirmed: false,
            };
            setTableCarts({ ...tableCarts, [tableId]: [...existingCart, newItem] });
        }
    };

    const handleUpdateQuantity = (menuItemId: number, delta: number) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];

        const updated = existingCart
            .map((item) => {
                if (item.menu_item_id === menuItemId) {
                    const minQty = item.isConfirmed ? (item.initialQuantity || 1) : 0;
                    const newQty = item.quantity + delta;
                    return newQty >= minQty ? { ...item, quantity: newQty } : item;
                }
                return item;
            })
            .filter(Boolean) as CartItem[];

        setTableCarts({ ...tableCarts, [tableId]: updated });
    };

    const handleRemoveItem = (menuItemId: number) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const updated = existingCart.filter((item) => item.menu_item_id !== menuItemId || item.isConfirmed);
        setTableCarts({ ...tableCarts, [tableId]: updated });
    };

    const handleUpdateNote = (menuItemId: number, note: string) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const updated = existingCart.map((item) =>
            item.menu_item_id === menuItemId ? { ...item, note } : item
        );
        setTableCarts({ ...tableCarts, [tableId]: updated });
    };

    const handleSendToKitchen = () => {
        if (!selectedTable || currentCart.length === 0) return;

        // Filter out ONLY new delta items to send as fresh kitchen ticket!
        const newDeltaItems = currentCart
            .map((item) => {
                const initialQty = item.isConfirmed ? (item.initialQuantity || 0) : 0;
                const newDelta = item.quantity - initialQty;
                if (newDelta > 0) {
                    return {
                        menu_item_id: item.menu_item_id,
                        quantity: newDelta,
                        unit_price: item.unit_price,
                        note: item.note || null,
                        vat_rate: item.vat_rate,
                    };
                }
                return null;
            })
            .filter(Boolean) as Array<{
                menu_item_id: number;
                quantity: number;
                unit_price: number;
                note: string | null;
                vat_rate: number;
            }>;

        if (newDeltaItems.length === 0) return;

        setSubmitting(true);

        const subtotal = newDeltaItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const vatTotal = newDeltaItems.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
        }, 0);
        const totalAmount = subtotal + vatTotal;

        const payload = {
            table_id: selectedTable.id,
            items: newDeltaItems,
            subtotal,
            vat_amount: vatTotal,
            total: totalAmount,
        };

        router.post('/staff/pos/send-to-kitchen', payload, {
            onSuccess: () => {
                setSubmitting(false);
            },
            onError: () => {
                setSubmitting(false);
            },
        });
    };

    const handleConfirmPayment = (
        paymentMethod: 'cash' | 'bank_transfer',
        amountReceived: number,
        changeAmount: number,
        shouldPrint: boolean
    ) => {
        if (!selectedTable) return;

        setSubmitting(true);

        const payload = {
            table_id: selectedTable.id,
            payment_method: paymentMethod,
            amount_received: amountReceived,
            change_amount: changeAmount,
        };

        const snapshotCart = [...currentCart];
        const snapshotTable = { ...selectedTable };

        router.post('/staff/pos/checkout', payload, {
            onSuccess: () => {
                setSubmitting(false);
                setIsPaymentDrawerOpen(false);

                // Clear table cart
                setTableCarts((prev) => ({ ...prev, [selectedTable.id]: [] }));

                if (shouldPrint) {
                    setReceiptModal({
                        isOpen: true,
                        paymentMethod,
                        amountReceived,
                        changeAmount,
                        cartItems: snapshotCart,
                        table: snapshotTable,
                        invoiceCode: 'INV-' + dateCode(),
                    });
                }
            },
            onError: () => {
                setSubmitting(false);
            },
        });
    };

    const dateCode = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    };

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
                                className={`flex-1 py-2.5 px-4 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center space-x-2 ${
                                    activeTab === 'tables'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                            >
                                <span>🪑 Chọn bàn</span>
                                {selectedTable && (
                                    <span className="ml-1.5 px-2 py-0.5 rounded-full bg-white/20 text-[10px]">
                                        {selectedTable.table_number}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('menu')}
                                className={`flex-1 py-2.5 px-4 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center space-x-2 ${
                                    activeTab === 'menu'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                                }`}
                            >
                                <span>☕ Chọn món</span>
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
                                    onSelectTable={(table) => {
                                        handleSelectTable(table);
                                    }}
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
                            onSendToKitchen={handleSendToKitchen}
                            onOpenPayment={() => setIsPaymentDrawerOpen(true)}
                            submitting={submitting}
                        />
                    </div>
                </div>
            </div>

            {/* Payment Sliding Drawer Overlay */}
            <PaymentDrawer
                isOpen={isPaymentDrawerOpen}
                onClose={() => setIsPaymentDrawerOpen(false)}
                selectedTable={selectedTable}
                cartItems={currentCart}
                onConfirmPayment={handleConfirmPayment}
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
