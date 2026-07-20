import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import DashboardLayout from '../../../layouts/DashboardLayout';
import POSTableTab, { POSTableData } from './components/POSTableTab';
import POSMenuTab, { CategoryData, POSProductData } from './components/POSMenuTab';
import POSCartPanel, { CartItem } from './components/POSCartPanel';

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

    useEffect(() => {
        const initialCarts: Record<number, CartItem[]> = {};
        tables.forEach((table) => {
            if (table.active_order && table.active_order.items) {
                initialCarts[table.id] = table.active_order.items.map((item) => ({
                    menu_item_id: item.menu_item_id,
                    name: item.menu_item?.name || 'Món',
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    vat_rate: item.menu_item?.vat_rate || 0,
                    note: item.note || '',
                    isConfirmed: true,
                }));
            } else {
                initialCarts[table.id] = [];
            }
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
                    const newQty = item.quantity + delta;
                    return newQty > 0 ? { ...item, quantity: newQty } : null;
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
        const updated = existingCart.filter((item) => item.menu_item_id !== menuItemId);
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

        setSubmitting(true);

        const subtotal = currentCart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const vatTotal = currentCart.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
        }, 0);
        const totalAmount = subtotal + vatTotal;

        const payload = {
            table_id: selectedTable.id,
            items: currentCart.map((item) => ({
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                note: item.note || null,
            })),
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

    return (
        <DashboardLayout>
            <Head title="Đặt hàng POS & Quản lý bàn bán hàng" />

            {/* Standalone Full-Height Split Screen Container */}
            <div className="h-[calc(100vh-68px)] p-3 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-h-0">
                    {/* Left Panel (7 columns): Standalone Box for Tabs */}
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
                                        setActiveTab('menu');
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

                    {/* Right Panel (5 columns): Standalone Cart Panel Box */}
                    <div className="lg:col-span-5 h-full min-h-0">
                        <POSCartPanel
                            selectedTable={selectedTable}
                            cartItems={currentCart}
                            onUpdateQuantity={handleUpdateQuantity}
                            onRemoveItem={handleRemoveItem}
                            onUpdateNote={handleUpdateNote}
                            onSendToKitchen={handleSendToKitchen}
                            submitting={submitting}
                        />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
