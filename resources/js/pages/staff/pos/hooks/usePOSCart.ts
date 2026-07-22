import { useState, useEffect } from 'react';
import { POSTableData, POSProductData, CartItem } from '../types/pos.types';

export function usePOSCart(
    selectedTable: POSTableData | null,
    tables: POSTableData[],
    products: POSProductData[]
) {
    const [tableCarts, setTableCarts] = useState<Record<number, CartItem[]>>({});

    useEffect(() => {
        const initialCarts: Record<number, CartItem[]> = {};
        tables.forEach((table) => {
            const mergedMap: Record<number, CartItem> = {};
            const allOrders = table.active_orders || (table.active_order ? [table.active_order] : []);

            allOrders.forEach((order) => {
                const isOrderCompleted = order.status === 'completed';
                if (order.items) {
                    order.items.forEach((item) => {
                        const existing = mergedMap[item.menu_item_id];
                        if (existing) {
                            existing.quantity += item.quantity;
                            existing.initialQuantity = (existing.initialQuantity || 0) + item.quantity;
                            existing.isKitchenCompleted = (existing.isKitchenCompleted ?? true) && isOrderCompleted;
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
                                isKitchenCompleted: isOrderCompleted,
                            };
                        }
                    });
                }
            });

            initialCarts[table.id] = Object.values(mergedMap);
        });
        setTableCarts(initialCarts);
    }, [tables]);

    const currentCart = selectedTable ? tableCarts[selectedTable.id] || [] : [];

    const handleToggleProduct = (product: POSProductData) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];

        const index = existingCart.findIndex((i) => i.menu_item_id === product.id);
        const maxServings = product.max_servings !== undefined ? product.max_servings : 999;

        if (index > -1) {
            const existingItem = existingCart[index];
            if (!existingItem.isConfirmed) {
                const updated = existingCart.filter((i) => i.menu_item_id !== product.id);
                setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
            } else {
                if (existingItem.quantity + 1 > maxServings) {
                    alert(`Không đủ nguyên liệu trong kho! “${product.name}” chỉ còn phục vụ tối đa ${maxServings} phần.`);
                    return;
                }
                const updated = [...existingCart];
                updated[index] = { ...existingItem, quantity: existingItem.quantity + 1 };
                setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
            }
        } else {
            if (1 > maxServings) {
                alert(`Không đủ nguyên liệu trong kho! “${product.name}” đã hết hàng.`);
                return;
            }
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
            setTableCarts((prev) => ({ ...prev, [tableId]: [...existingCart, newItem] }));
        }
    };

    const handleUpdateQuantity = (menuItemId: number, delta: number) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const product = products.find((p) => p.id === menuItemId);
        const maxServings = product?.max_servings !== undefined ? product.max_servings : 999;

        const updated = existingCart
            .map((item) => {
                if (item.menu_item_id === menuItemId) {
                    const minQty = item.isConfirmed ? (item.initialQuantity || 1) : 0;
                    const newQty = item.quantity + delta;
                    if (delta > 0 && newQty > maxServings) {
                        alert(`Không đủ nguyên liệu trong kho! “${item.name}” chỉ còn phục vụ tối đa ${maxServings} phần.`);
                        return item;
                    }
                    return newQty >= minQty ? { ...item, quantity: newQty } : item;
                }
                return item;
            })
            .filter(Boolean) as CartItem[];

        setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
    };

    const handleRemoveItem = (menuItemId: number) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const updated = existingCart.filter((item) => item.menu_item_id !== menuItemId || item.isConfirmed);
        setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
    };

    const handleUpdateNote = (menuItemId: number, note: string) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const updated = existingCart.map((item) =>
            item.menu_item_id === menuItemId ? { ...item, note } : item
        );
        setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
    };

    const clearTableCart = (tableId?: number) => {
        if (!tableId) return;
        setTableCarts((prev) => ({ ...prev, [tableId]: [] }));
    };

    return {
        tableCarts,
        currentCart,
        handleToggleProduct,
        handleUpdateQuantity,
        handleRemoveItem,
        handleUpdateNote,
        clearTableCart,
    };
}
