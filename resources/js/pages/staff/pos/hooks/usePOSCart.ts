import { useState, useEffect } from 'react';
import type { POSTableData, POSProductData, CartItem } from '../types/pos.types';

export function usePOSCart(
    selectedTable: POSTableData | null,
    tables: POSTableData[],
    products: POSProductData[],
) {
    const [tableCarts, setTableCarts] = useState<
        Record<number, Record<string, CartItem[]>>
    >({});
    const [activeInvoiceId, setActiveInvoiceId] = useState<
        Record<number, string>
    >({});

    useEffect(() => {
        queueMicrotask(() => {
            const safeTables = (
                Array.isArray(tables) ? tables : Object.values(tables || {})
            ) as POSTableData[];

        setActiveInvoiceId((prevActive) => {
            const nextActive = { ...prevActive };
            safeTables.forEach((table) => {
                const allOrders =
                    table.active_orders ||
                    (table.active_order ? [table.active_order] : []);
                const currentActive = nextActive[table.id];

                if (currentActive && currentActive.startsWith('draft_')) {
                    if (allOrders.length > 0) {
                        const latestOrder = allOrders[allOrders.length - 1];
                        nextActive[table.id] =
                            latestOrder.order_code || `draft_${latestOrder.id}`;
                    }
                } else {
                    const hasCurrentActive = allOrders.some(
                        (o) =>
                            (o.order_code || `draft_${o.id}`) === currentActive,
                    );

                    if (!currentActive || !hasCurrentActive) {
                        if (allOrders.length > 0) {
                            nextActive[table.id] =
                                allOrders[0].order_code ||
                                `draft_${allOrders[0].id}`;
                        } else {
                            nextActive[table.id] = 'draft_default';
                        }
                    }
                }
            });

            return nextActive;
        });

        setTableCarts((prevCarts) => {
            const nextCarts: Record<number, Record<string, CartItem[]>> = {};
            safeTables.forEach((table) => {
                const tableInvoices: Record<string, CartItem[]> = {};
                const allOrders =
                    table.active_orders ||
                    (table.active_order ? [table.active_order] : []);

                allOrders.forEach((order) => {
                    const isOrderCompleted = order.status === 'completed';
                    const isDraft = order.status === 'draft' || order.status === 'reserved';
                    const key = order.order_code || `draft_${order.id}`;

                    if (!tableInvoices[key]) {
tableInvoices[key] = [];
}

                    if (order.items) {
                        order.items.forEach((item) => {
                            if (item.status === 'cancelled') {
return;
}

                            tableInvoices[key].push({
                                menu_item_id: item.menu_item_id,
                                name: item.menu_item?.name || 'Món',
                                quantity: item.quantity,
                                initialQuantity: item.quantity,
                                unit_price: Number(item.unit_price),
                                vat_rate: Number(item.menu_item?.vat_rate || 0),
                                note: item.note || '',
                                isConfirmed: !isDraft,
                                isKitchenCompleted:
                                    item.status === 'completed' ||
                                    isOrderCompleted,
                                isServed: !!item.served_at,
                                orderItemId: item.id,
                                orderCode: order.order_code || `draft_${order.id}`,
                                sentAt: item.created_at,
                            });
                        });
                    }
                });

                // Keep local unconfirmed drafts
                const prevTableCarts = prevCarts[table.id] || {};
                Object.keys(prevTableCarts).forEach((key) => {
                    if (key.startsWith('draft_')) {
                        const draftItems = prevTableCarts[key];

                        if (
                            draftItems &&
                            draftItems.length > 0 &&
                            draftItems.some((i) => !i.isConfirmed)
                        ) {
                            tableInvoices[key] = draftItems;
                        }
                    }
                });

                if (Object.keys(tableInvoices).length === 0) {
                    tableInvoices['draft_default'] = [];
                }

                nextCarts[table.id] = tableInvoices;
            });

            return nextCarts;
        });
        });
    }, [tables]);

    const activeInvId = selectedTable
        ? activeInvoiceId[selectedTable.id] || 'draft_default'
        : 'draft_default';
    const currentCart =
        selectedTable && tableCarts[selectedTable.id]
            ? tableCarts[selectedTable.id][activeInvId] || []
            : [];

    const whisperDraftCart = (tableId: number, items: CartItem[]) => {
        if (typeof window !== 'undefined' && window.Echo) {
            const unconfirmedCount = items
                .filter((i) => !i.isConfirmed)
                .reduce((s, i) => s + i.quantity, 0);
            window.Echo.join('pos-room').whisper('table-draft-cart-updated', {
                tableId,
                unconfirmedCount,
            });
        }
    };

    const addNewDraftInvoice = (tableId: number) => {
        const nextTempId = `draft_${Date.now()}`;
        setTableCarts((prev) => {
            const prevTableCarts = prev[tableId] || {};

            return {
                ...prev,
                [tableId]: {
                    ...prevTableCarts,
                    [nextTempId]: [],
                },
            };
        });
        setActiveInvoiceId((prev) => ({
            ...prev,
            [tableId]: nextTempId,
        }));
    };

    const removeDraftInvoice = (tableId: number, tempId: string) => {
        setTableCarts((prev) => {
            const nextTableCarts = { ...(prev[tableId] || {}) };
            delete nextTableCarts[tempId];

            if (Object.keys(nextTableCarts).length === 0) {
                nextTableCarts['draft_default'] = [];
            }

            return {
                ...prev,
                [tableId]: nextTableCarts,
            };
        });
        setActiveInvoiceId((prev) => {
            const currentActive = prev[tableId];

            if (currentActive === tempId) {
                const nextTableCarts = tableCarts[tableId] || {};
                const keys = Object.keys(nextTableCarts).filter(
                    (k) => k !== tempId,
                );
                const nextActive = keys.length > 0 ? keys[0] : 'draft_default';

                return {
                    ...prev,
                    [tableId]: nextActive,
                };
            }

            return prev;
        });
    };

    const handleToggleProduct = (product: POSProductData) => {
        if (!selectedTable) {
return;
}

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const existingCart = (tableCarts[tableId] || {})[activeId] || [];
        const maxServings =
            product.max_servings !== undefined ? product.max_servings : 999;

        const draftIndex = existingCart.findIndex(
            (i) => i.menu_item_id === product.id && !i.isConfirmed,
        );

        let updated: CartItem[];

        if (draftIndex > -1) {
            const existingDraft = existingCart[draftIndex];

            if (existingDraft.quantity + 1 > maxServings) {
return;
}

            updated = [...existingCart];
            updated[draftIndex] = {
                ...existingDraft,
                quantity: existingDraft.quantity + 1,
            };
        } else {
            if (1 > maxServings) {
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
            updated = [...existingCart, newItem];
        }

        setTableCarts((prev) => ({
            ...prev,
            [tableId]: {
                ...(prev[tableId] || {}),
                [activeId]: updated,
            },
        }));
        whisperDraftCart(tableId, updated);
    };

    const handleUpdateQuantity = (menuItemId: number, delta: number) => {
        if (!selectedTable) {
return;
}

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const existingCart = (tableCarts[tableId] || {})[activeId] || [];
        const product = products.find((p) => p.id === menuItemId);
        const maxServings =
            product?.max_servings !== undefined ? product.max_servings : 999;

        let draftAlreadyHandled = false;
        const updated = existingCart
            .map((item) => {
                if (item.menu_item_id === menuItemId && !item.isConfirmed) {
                    const newQty = item.quantity + delta;

                    if (delta > 0 && newQty > maxServings) {
return item;
}

                    if (newQty <= 0) {
                        draftAlreadyHandled = true;

                        return null;
                    }

                    draftAlreadyHandled = true;

                    return { ...item, quantity: newQty };
                }

                return item;
            })
            .filter(Boolean) as CartItem[];

        if (delta > 0) {
            const confirmedItem = existingCart.find(
                (i) => i.menu_item_id === menuItemId && i.isConfirmed,
            );

            if (confirmedItem && product && !draftAlreadyHandled) {
                const draftIndex = updated.findIndex(
                    (i) => i.menu_item_id === menuItemId && !i.isConfirmed,
                );

                if (draftIndex > -1) {
                    const existingDraft = updated[draftIndex];

                    if (existingDraft.quantity + 1 <= maxServings) {
                        updated[draftIndex] = {
                            ...existingDraft,
                            quantity: existingDraft.quantity + 1,
                        };
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

        setTableCarts((prev) => ({
            ...prev,
            [tableId]: {
                ...(prev[tableId] || {}),
                [activeId]: updated,
            },
        }));
        whisperDraftCart(tableId, updated);
    };

    const handleStageReduction = (
        orderItemId: number,
        reduceQty: number,
        reason: string,
        note?: string,
    ) => {
        if (!selectedTable) {
return;
}

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const existingCart = (tableCarts[tableId] || {})[activeId] || [];

        const updated = existingCart.map((item) => {
            if (item.orderItemId === orderItemId && item.isConfirmed) {
                const newStagedQty = (item.stagedReduceQty || 0) + reduceQty;
                const currentEffectiveQty = Math.max(
                    0,
                    item.quantity - reduceQty,
                );

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

        setTableCarts((prev) => ({
            ...prev,
            [tableId]: {
                ...(prev[tableId] || {}),
                [activeId]: updated,
            },
        }));
        whisperDraftCart(tableId, updated);
    };

    const handleRemoveItem = (menuItemId: number) => {
        if (!selectedTable) {
return;
}

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const existingCart = (tableCarts[tableId] || {})[activeId] || [];
        const updated = existingCart.filter(
            (item) => item.menu_item_id !== menuItemId || item.isConfirmed,
        );
        setTableCarts((prev) => ({
            ...prev,
            [tableId]: {
                ...(prev[tableId] || {}),
                [activeId]: updated,
            },
        }));
        whisperDraftCart(tableId, updated);
    };

    const handleUpdateNote = (menuItemId: number, note: string) => {
        if (!selectedTable) {
return;
}

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const existingCart = (tableCarts[tableId] || {})[activeId] || [];
        const updated = existingCart.map((item) =>
            item.menu_item_id === menuItemId ? { ...item, note } : item,
        );
        setTableCarts((prev) => ({
            ...prev,
            [tableId]: {
                ...(prev[tableId] || {}),
                [activeId]: updated,
            },
        }));
    };

    const clearTableCart = (tableId?: number, invoiceId?: string) => {
        // Note: virtual "Mang đi" table has id = 0, so a falsy check would skip it
        if (tableId === undefined || tableId === null) {
return;
}

        const activeId =
            invoiceId || activeInvoiceId[tableId] || 'draft_default';
        setTableCarts((prev) => {
            const nextTableCarts = { ...(prev[tableId] || {}) };
            delete nextTableCarts[activeId];

            if (Object.keys(nextTableCarts).length === 0) {
                nextTableCarts['draft_default'] = [];
            }

            setActiveInvoiceId((prevActive) => {
                if (prevActive[tableId] === activeId) {
                    const keys = Object.keys(nextTableCarts);

                    return {
                        ...prevActive,
                        [tableId]: keys.length > 0 ? keys[0] : 'draft_default',
                    };
                }

                return prevActive;
            });

            return {
                ...prev,
                [tableId]: nextTableCarts,
            };
        });
        whisperDraftCart(tableId, []);
    };

    const clearUnconfirmedDraft = (tableId?: number, invoiceId?: string) => {
        // Note: virtual "Mang đi" table has id = 0, so a falsy check would skip it
        if (tableId === undefined || tableId === null) {
return;
}

        const activeId =
            invoiceId || activeInvoiceId[tableId] || 'draft_default';
        setTableCarts((prev) => {
            const existing = (prev[tableId] || {})[activeId] || [];
            const confirmedOnly = existing
                .filter((item) => item.isConfirmed)
                .map((item) => {
                    const {
                        stagedReduceQty,
                        stagedReason,
                        stagedNote,
                        ...rest
                    } = item;

                    return rest;
                });

            const nextTableCarts = { ...(prev[tableId] || {}) };

            if (confirmedOnly.length === 0 && activeId.startsWith('draft_')) {
                delete nextTableCarts[activeId];
            } else {
                nextTableCarts[activeId] = confirmedOnly;
            }

            return {
                ...prev,
                [tableId]: nextTableCarts,
            };
        });
        whisperDraftCart(tableId, []);
    };

    return {
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
    };
}
