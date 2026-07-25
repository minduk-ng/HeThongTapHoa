import { useState, useEffect } from 'react';
import { POSTableData, POSProductData, CartItem } from '../types/pos.types';

export function usePOSCart(
    selectedTable: POSTableData | null,
    tables: POSTableData[],
    products: POSProductData[]
) {
    const [tableCarts, setTableCarts] = useState<Record<number, CartItem[]>>({});

    useEffect(() => {
        const safeTables = (Array.isArray(tables) ? tables : Object.values(tables || {})) as POSTableData[];
        setTableCarts((prevCarts) => {
            const nextCarts: Record<number, CartItem[]> = {};
            safeTables.forEach((table) => {
                const mergedMap: Record<string, CartItem> = {};
                const allOrders = table.active_orders || (table.active_order ? [table.active_order] : []);

                allOrders.forEach((order) => {
                    const isOrderCompleted = order.status === 'completed';
                    if (order.items) {
                        order.items.forEach((item) => {
                            if (item.status === 'cancelled') return;
                            const key = `${item.menu_item_id}_${isOrderCompleted ? 'completed' : 'pending'}`;
                            const existing = mergedMap[key];
                            if (existing) {
                                existing.quantity += item.quantity;
                                existing.initialQuantity = (existing.initialQuantity || 0) + item.quantity;
                            } else {
                                mergedMap[key] = {
                                    menu_item_id: item.menu_item_id,
                                    name: item.menu_item?.name || 'Món',
                                    quantity: item.quantity,
                                    initialQuantity: item.quantity,
                                    unit_price: item.unit_price,
                                    vat_rate: item.menu_item?.vat_rate || 0,
                                    note: item.note || '',
                                    isConfirmed: true,
                                    isKitchenCompleted: isOrderCompleted,
                                    orderItemId: item.id,
                                };
                            }
                        });
                    }
                });

                const existingUnconfirmed = (prevCarts[table.id] || []).filter((item) => !item.isConfirmed);
                const confirmedItems = Object.values(mergedMap);

                nextCarts[table.id] = [...confirmedItems, ...existingUnconfirmed];
            });
            return nextCarts;
        });
    }, [tables]);

    const currentCart = selectedTable ? tableCarts[selectedTable.id] || [] : [];

    const whisperDraftCart = (tableId: number, items: CartItem[]) => {
        if (typeof window !== 'undefined' && window.Echo) {
            const unconfirmedCount = items.filter((i) => !i.isConfirmed).reduce((s, i) => s + i.quantity, 0);
            window.Echo.join('pos-room').whisper('table-draft-cart-updated', {
                tableId,
                unconfirmedCount,
            });
        }
    };

    const handleToggleProduct = (product: POSProductData) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const maxServings = product.max_servings !== undefined ? product.max_servings : 999;

        // Check if an unconfirmed draft item for this product already exists
        const draftIndex = existingCart.findIndex((i) => i.menu_item_id === product.id && !i.isConfirmed);

        let updated: CartItem[];
        if (draftIndex > -1) {
            const existingDraft = existingCart[draftIndex];
            if (existingDraft.quantity + 1 > maxServings) return;
            updated = [...existingCart];
            updated[draftIndex] = { ...existingDraft, quantity: existingDraft.quantity + 1 };
        } else {
            if (1 > maxServings) return;
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
            updated = [...existingCart, newItem];
        }

        setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
        whisperDraftCart(tableId, updated);
    };

    const handleUpdateQuantity = (menuItemId: number, delta: number) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const product = products.find((p) => p.id === menuItemId);
        const maxServings = product?.max_servings !== undefined ? product.max_servings : 999;

        let updated = existingCart
            .map((item) => {
                if (item.menu_item_id === menuItemId && !item.isConfirmed) {
                    const newQty = item.quantity + delta;
                    if (delta > 0 && newQty > maxServings) return item;
                    if (newQty <= 0) return null; // Automatically remove draft item when reduced to 0
                    return { ...item, quantity: newQty };
                }
                return item;
            })
            .filter(Boolean) as CartItem[];

        // If delta > 0 for a confirmed item (clicking "+" on a confirmed row), create or increment a draft item
        if (delta > 0) {
            const confirmedItem = existingCart.find((i) => i.menu_item_id === menuItemId && i.isConfirmed);
            if (confirmedItem && product) {
                const draftIndex = updated.findIndex((i) => i.menu_item_id === menuItemId && !i.isConfirmed);
                if (draftIndex > -1) {
                    const existingDraft = updated[draftIndex];
                    if (existingDraft.quantity + 1 <= maxServings) {
                        updated[draftIndex] = { ...existingDraft, quantity: existingDraft.quantity + 1 };
                    }
                } else {
                    if (1 <= maxServings) {
                        const newDraftItem: CartItem = {
                            menu_item_id: product.id,
                            name: product.name,
                            quantity: 1,
                            initialQuantity: 0,
                            unit_price: Number(product.price),
                            vat_rate: Number(product.vat_rate || 0),
                            note: '',
                            isConfirmed: false,
                        };
                        updated.push(newDraftItem);
                    }
                }
            }
        }

        setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
        whisperDraftCart(tableId, updated);
    };

    const handleStageReduction = (orderItemId: number, reduceQty: number, reason: string, note?: string) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];

        const updated = existingCart.map((item) => {
            if (item.orderItemId === orderItemId && item.isConfirmed) {
                const newStagedQty = (item.stagedReduceQty || 0) + reduceQty;
                const currentEffectiveQty = Math.max(0, item.quantity - reduceQty);
                return {
                    ...item,
                    quantity: currentEffectiveQty,
                    stagedReduceQty: newStagedQty,
                    stagedReason: reason,
                    stagedNote: note,
                };
            }
            return item;
        });

        setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
        whisperDraftCart(tableId, updated);
    };

    const handleRemoveItem = (menuItemId: number) => {
        if (!selectedTable) return;
        const tableId = selectedTable.id;
        const existingCart = tableCarts[tableId] || [];
        const updated = existingCart.filter((item) => item.menu_item_id !== menuItemId || item.isConfirmed);
        setTableCarts((prev) => ({ ...prev, [tableId]: updated }));
        whisperDraftCart(tableId, updated);
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
        whisperDraftCart(tableId, []);
    };

    const clearUnconfirmedDraft = (tableId?: number) => {
        if (!tableId) return;
        setTableCarts((prev) => {
            const existing = prev[tableId] || [];
            const confirmedOnly = existing
                .filter((item) => item.isConfirmed)
                .map((item) => {
                    const { stagedReduceQty, stagedReason, stagedNote, ...rest } = item;
                    return rest;
                });
            return {
                ...prev,
                [tableId]: confirmedOnly,
            };
        });
        whisperDraftCart(tableId, []);
    };

    return {
        tableCarts,
        currentCart,
        handleToggleProduct,
        handleUpdateQuantity,
        handleStageReduction,
        handleRemoveItem,
        handleUpdateNote,
        clearTableCart,
        clearUnconfirmedDraft,
    };
}
