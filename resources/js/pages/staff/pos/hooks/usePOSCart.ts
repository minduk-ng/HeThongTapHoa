import { useState, useEffect, useMemo, useCallback } from 'react';
import type { POSTableData, POSProductData, CartItem } from '../types/pos.types';
import type { DraftLine, DraftSnapshot, ServerOrderView } from '../utils/draftUndo';
import {
    pushDraftSnapshot,
    popDraftSnapshot,
    validateRestore,
    fingerprintBaseline,
    extractServerOrderViews,
    generateDraftLineId,
} from '../utils/draftUndo';

export interface ContextKey {
    tableId: number;
    invoiceKey: string;
    generation: number;
}

export interface ContextState {
    tableId: number;
    invoiceKey: string;
    generation: number;
    cart: CartItem[];
    history: DraftSnapshot[];
    baselineFingerprint: string;
    sending: boolean;
}

export function usePOSCart(
    selectedTable: POSTableData | null,
    tables: POSTableData[],
    products: POSProductData[],
) {
    // ponytail: O(1) product lookup map memoized per products array revision
    const productById = useMemo(
        () => new Map(products.map((p) => [p.id, p])),
        [products],
    );

    const [contexts, setContexts] = useState<Record<string, ContextState>>({});
    const [activeInvoiceId, setActiveInvoiceId] = useState<
        Record<number, string>
    >({});
    const [undoError, setUndoError] = useState<string | null>(null);

    const tableCarts = useMemo(() => {
        const result: Record<number, Record<string, CartItem[]>> = {};

        for (const ctx of Object.values(contexts)) {
            if (!result[ctx.tableId]) {
                result[ctx.tableId] = {};
            }

            result[ctx.tableId][ctx.invoiceKey] = ctx.cart;
        }

        return result;
    }, [contexts]);

    const activeInvId = selectedTable
        ? activeInvoiceId[selectedTable.id] || 'draft_default'
        : 'draft_default';

    const currentContext = selectedTable
        ? contexts[`${selectedTable.id}::${activeInvId}`]
        : undefined;

    const currentCart = currentContext ? currentContext.cart : [];

    const canUndo = Boolean(
        selectedTable &&
            currentContext &&
            !currentContext.sending &&
            currentContext.history.length > 0,
    );

    const sending = Boolean(currentContext?.sending);

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

    const commitDraftChange = useCallback(
        (
            key: ContextKey,
            action: 'add' | 'remove' | 'setQty',
            lineId: string,
            qty: number,
            latestProducts: ReadonlyMap<number, POSProductData>,
        ): void => {
            const ctxKey = `${key.tableId}::${key.invoiceKey}`;

            setContexts((prev) => {
                const ctx = prev[ctxKey] || {
                    tableId: key.tableId,
                    invoiceKey: key.invoiceKey,
                    generation: key.generation,
                    cart: [],
                    history: [],
                    baselineFingerprint: '[]',
                    sending: false,
                };

                if (ctx.generation !== key.generation) {
                    return prev;
                }

                if (ctx.sending) {
                    return prev;
                }

                const prevCart = ctx.cart;

                const draftIndex = prevCart.findIndex(
                    (i) =>
                        !i.isConfirmed &&
                        (i.draftLineId === lineId ||
                            String(i.menu_item_id) === lineId),
                );
                const existingDraft =
                    draftIndex > -1 ? prevCart[draftIndex] : null;

                let newCart: CartItem[] | null = null;

                if (action === 'add') {
                    if (!Number.isInteger(qty) || qty <= 0) {
                        return prev;
                    }

                    if (existingDraft) {
                        const product = latestProducts.get(
                            existingDraft.menu_item_id,
                        );

                        if (!product || !product.is_available) {
                            return prev;
                        }

                        const maxServings =
                            product.max_servings !== undefined
                                ? product.max_servings
                                : 999;

                        const otherDemand = prevCart
                            .filter(
                                (i, idx) =>
                                    !i.isConfirmed &&
                                    idx !== draftIndex &&
                                    i.menu_item_id === product.id,
                            )
                            .reduce((sum, i) => sum + i.quantity, 0);

                        const nextQty = existingDraft.quantity + qty;

                        if (otherDemand + nextQty > maxServings) {
                            return prev;
                        }

                        newCart = [...prevCart];
                        newCart[draftIndex] = {
                            ...existingDraft,
                            quantity: nextQty,
                        };
                    } else {
                        const menuItemId = Number(lineId);

                        if (isNaN(menuItemId)) {
                            return prev;
                        }

                        const product = latestProducts.get(menuItemId);

                        if (!product || !product.is_available) {
                            return prev;
                        }

                        const maxServings =
                            product.max_servings !== undefined
                                ? product.max_servings
                                : 999;

                        const otherDemand = prevCart
                            .filter(
                                (i) =>
                                    !i.isConfirmed &&
                                    i.menu_item_id === product.id,
                            )
                            .reduce((sum, i) => sum + i.quantity, 0);

                        if (otherDemand + qty > maxServings) {
                            return prev;
                        }

                        const newItem: CartItem = {
                            draftLineId: generateDraftLineId(),
                            menu_item_id: product.id,
                            name: product.name,
                            quantity: qty,
                            initialQuantity: 0,
                            unit_price: Number(product.price),
                            vat_rate: Number(product.vat_rate || 0),
                            note: '',
                            isConfirmed: false,
                        };
                        newCart = [...prevCart, newItem];
                    }
                } else if (action === 'remove') {
                    if (!existingDraft) {
                        return prev;
                    }

                    newCart = prevCart.filter(
                        (i) =>
                            i.isConfirmed ||
                            (i.draftLineId !== lineId &&
                                String(i.menu_item_id) !== lineId),
                    );
                } else if (action === 'setQty') {
                    if (!Number.isInteger(qty)) {
                        return prev;
                    }

                    if (!existingDraft) {
                        return prev;
                    }

                    if (qty === existingDraft.quantity) {
                        return prev;
                    }

                    if (qty <= 0) {
                        newCart = prevCart.filter(
                            (i, idx) => i.isConfirmed || idx !== draftIndex,
                        );
                    } else {
                        const product = latestProducts.get(
                            existingDraft.menu_item_id,
                        );

                        if (!product || !product.is_available) {
                            return prev;
                        }

                        const maxServings =
                            product.max_servings !== undefined
                                ? product.max_servings
                                : 999;

                        const otherDemand = prevCart
                            .filter(
                                (i, idx) =>
                                    !i.isConfirmed &&
                                    idx !== draftIndex &&
                                    i.menu_item_id === product.id,
                            )
                            .reduce((sum, i) => sum + i.quantity, 0);

                        if (otherDemand + qty > maxServings) {
                            return prev;
                        }

                        newCart = [...prevCart];
                        newCart[draftIndex] = {
                            ...existingDraft,
                            quantity: qty,
                        };
                    }
                }

                if (!newCart) {
                    return prev;
                }

                const unconfirmedRows: DraftLine[] = prevCart
                    .filter((i) => !i.isConfirmed)
                    .map((i) => ({
                        draftLineId: i.draftLineId || generateDraftLineId(),
                        menu_item_id: i.menu_item_id,
                        quantity: i.quantity,
                        note: i.note || '',
                        unit_price: i.unit_price,
                        vat_rate: i.vat_rate,
                        orderItemId: i.orderItemId,
                        name: i.name,
                    }));

                // ponytail: in-memory capped snapshot history per context
                const nextHistory = pushDraftSnapshot(
                    ctx.history,
                    { rows: unconfirmedRows },
                    50,
                );

                whisperDraftCart(key.tableId, newCart);
                setUndoError(null);

                return {
                    ...prev,
                    [ctxKey]: {
                        ...ctx,
                        cart: newCart,
                        history: nextHistory,
                    },
                };
            });
        },
        [],
    );

    const undoDraft = useCallback(
        (
            key?: ContextKey,
            latestProducts?: ReadonlyMap<number, POSProductData>,
        ): void => {
            const productsMap = latestProducts || productById;

            setContexts((prev) => {
                let targetTableId: number;
                let targetInvoiceKey: string;
                let targetGen: number;

                if (key) {
                    targetTableId = key.tableId;
                    targetInvoiceKey = key.invoiceKey;
                    targetGen = key.generation;
                } else {
                    if (!selectedTable) {
                        return prev;
                    }

                    targetTableId = selectedTable.id;
                    targetInvoiceKey =
                        activeInvoiceId[targetTableId] || 'draft_default';
                    const existing =
                        prev[`${targetTableId}::${targetInvoiceKey}`];

                    if (!existing) {
                        return prev;
                    }

                    targetGen = existing.generation;
                }

                const ctxKey = `${targetTableId}::${targetInvoiceKey}`;
                const ctx = prev[ctxKey];

                if (!ctx) {
                    return prev;
                }

                if (ctx.generation !== targetGen) {
                    return prev;
                }

                if (ctx.sending) {
                    setUndoError('Đang gửi bếp, không thể hoàn tác');

                    return prev;
                }

                if (ctx.history.length === 0) {
                    return prev;
                }

                const snap = ctx.history[ctx.history.length - 1];
                const valResult = validateRestore(snap, productsMap);

                if (!valResult.ok) {
                    setUndoError(valResult.message);

                    return prev;
                }

                setUndoError(null);
                const confirmedRows = ctx.cart.filter((i) => i.isConfirmed);

                const restoredUnconfirmed: CartItem[] = snap.rows.map((r) => {
                    const product = productsMap.get(r.menu_item_id);

                    return {
                        draftLineId: r.draftLineId,
                        menu_item_id: r.menu_item_id,
                        name: (r.name as string) || product?.name || 'Món',
                        quantity: r.quantity,
                        initialQuantity: 0,
                        unit_price: r.unit_price,
                        vat_rate: r.vat_rate,
                        note: r.note || '',
                        isConfirmed: false,
                    };
                });

                const nextCart = [...confirmedRows, ...restoredUnconfirmed];
                const { nextHistory } = popDraftSnapshot(ctx.history);

                whisperDraftCart(targetTableId, nextCart);

                return {
                    ...prev,
                    [ctxKey]: {
                        ...ctx,
                        cart: nextCart,
                        history: nextHistory,
                    },
                };
            });
        },
        [selectedTable, activeInvoiceId, productById],
    );

    const invalidateContexts = useCallback(
        (keys: ContextKey[], reason?: string) => {
            void reason;
            setContexts((prev) => {
                const next = { ...prev };

                for (const k of keys) {
                    const ctxKey = `${k.tableId}::${k.invoiceKey}`;
                    const existing = next[ctxKey];

                    if (existing) {
                        next[ctxKey] = {
                            ...existing,
                            generation: existing.generation + 1,
                            history: [],
                            cart: existing.cart.filter((i) => i.isConfirmed),
                            sending: false,
                        };
                    }
                }

                return next;
            });
        },
        [],
    );

    const reconcileBaseline = useCallback((serverTables: POSTableData[]) => {
        const safeTables = (
            Array.isArray(serverTables)
                ? serverTables
                : Object.values(serverTables || {})
        ) as POSTableData[];

        const allServerOrderViews = extractServerOrderViews(safeTables);
        const serverOrdersByContext = new Map<string, ServerOrderView[]>();

        for (const view of allServerOrderViews) {
            const ctxKey = `${view.tableId}::${view.invoiceKey}`;
            const list = serverOrdersByContext.get(ctxKey) || [];
            list.push(view);
            serverOrdersByContext.set(ctxKey, list);
        }

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

        setContexts((prevContexts) => {
            const nextContexts: Record<string, ContextState> = {};
            const activeKeysSet = new Set<string>();

            safeTables.forEach((table) => {
                const allOrders =
                    table.active_orders ||
                    (table.active_order ? [table.active_order] : []);

                const invoiceKeys = allOrders.map(
                    (o) => o.order_code || `draft_${o.id}`,
                );

                if (invoiceKeys.length === 0) {
                    invoiceKeys.push('draft_default');
                }

                invoiceKeys.forEach((key) => {
                    const ctxKey = `${table.id}::${key}`;
                    activeKeysSet.add(ctxKey);

                    const serverOrders =
                        serverOrdersByContext.get(ctxKey) || [];
                    const newFingerprint = fingerprintBaseline(serverOrders);
                    const existingCtx = prevContexts[ctxKey];

                    const confirmedCartItems: CartItem[] = [];
                    const matchingOrders = allOrders.filter(
                        (o) => (o.order_code || `draft_${o.id}`) === key,
                    );

                    matchingOrders.forEach((order) => {
                        const isOrderCompleted = order.status === 'completed';
                        const isDraft =
                            order.status === 'draft' ||
                            order.status === 'reserved';

                        if (order.items) {
                            order.items.forEach((item) => {
                                if (item.status === 'cancelled') {
                                    return;
                                }

                                confirmedCartItems.push({
                                    menu_item_id: item.menu_item_id,
                                    name: item.menu_item?.name || 'Món',
                                    quantity: item.quantity,
                                    initialQuantity: item.quantity,
                                    unit_price: Number(item.unit_price),
                                    vat_rate: Number(
                                        item.menu_item?.vat_rate || 0,
                                    ),
                                    note: item.note || '',
                                    isConfirmed: !isDraft,
                                    isKitchenCompleted:
                                        item.status === 'completed' ||
                                        isOrderCompleted,
                                    isServed: !!item.served_at,
                                    orderItemId: item.id,
                                    orderCode:
                                        order.order_code || `draft_${order.id}`,
                                    sentAt: item.created_at,
                                });
                            });
                        }
                    });

                    if (!existingCtx) {
                        nextContexts[ctxKey] = {
                            tableId: table.id,
                            invoiceKey: key,
                            generation: 0,
                            cart: confirmedCartItems,
                            history: [],
                            baselineFingerprint: newFingerprint,
                            sending: false,
                        };
                    } else {
                        const isFingerprintEqual =
                            existingCtx.baselineFingerprint === newFingerprint;

                        if (isFingerprintEqual) {
                            const unconfirmedItems = existingCtx.cart.filter(
                                (i) => !i.isConfirmed,
                            );

                            nextContexts[ctxKey] = {
                                ...existingCtx,
                                cart: [
                                    ...confirmedCartItems,
                                    ...unconfirmedItems,
                                ],
                            };
                        } else {
                            nextContexts[ctxKey] = {
                                ...existingCtx,
                                cart: confirmedCartItems,
                                history: [],
                                baselineFingerprint: newFingerprint,
                                sending: false,
                            };
                        }
                    }
                });
            });

            // Retain unconfirmed draft invoices not present on server
            Object.entries(prevContexts).forEach(([ctxKey, ctx]) => {
                if (
                    !activeKeysSet.has(ctxKey) &&
                    ctx.invoiceKey.startsWith('draft_')
                ) {
                    const tableExists = safeTables.some(
                        (t) => t.id === ctx.tableId,
                    );

                    if (tableExists && ctx.cart.some((i) => !i.isConfirmed)) {
                        nextContexts[ctxKey] = ctx;
                    }
                }
            });

            return nextContexts;
        });
    }, []);

    useEffect(() => {
        queueMicrotask(() => {
            reconcileBaseline(tables);
        });
    }, [tables, reconcileBaseline]);

    const onSendBegin = useCallback(
        (tableId: number, invoiceKey: string): ContextKey | null => {
            const ctxKey = `${tableId}::${invoiceKey}`;
            let capturedKey: ContextKey | null = null;

            setContexts((prev) => {
                const existing = prev[ctxKey];

                if (!existing) {
                    return prev;
                }

                capturedKey = {
                    tableId,
                    invoiceKey,
                    generation: existing.generation,
                };

                return {
                    ...prev,
                    [ctxKey]: {
                        ...existing,
                        sending: true,
                    },
                };
            });

            return capturedKey;
        },
        [],
    );

    const onSendSuccess = useCallback(
        (key: ContextKey, serverTables?: POSTableData[]) => {
            const ctxKey = `${key.tableId}::${key.invoiceKey}`;

            setContexts((prev) => {
                const existing = prev[ctxKey];

                if (!existing || existing.generation !== key.generation) {
                    return prev;
                }

                return {
                    ...prev,
                    [ctxKey]: {
                        ...existing,
                        sending: false,
                        history: [],
                        cart: existing.cart.filter((i) => i.isConfirmed),
                    },
                };
            });

            if (serverTables) {
                reconcileBaseline(serverTables);
            }
        },
        [reconcileBaseline],
    );

    const onSendFailure = useCallback((key: ContextKey) => {
        const ctxKey = `${key.tableId}::${key.invoiceKey}`;

        setContexts((prev) => {
            const existing = prev[ctxKey];

            if (!existing || existing.generation !== key.generation) {
                return prev;
            }

            return {
                ...prev,
                [ctxKey]: {
                    ...existing,
                    sending: false,
                },
            };
        });
    }, []);

    const onSendAmbiguous = useCallback((key: ContextKey) => {
        const ctxKey = `${key.tableId}::${key.invoiceKey}`;

        setContexts((prev) => {
            const existing = prev[ctxKey];

            if (!existing || existing.generation !== key.generation) {
                return prev;
            }

            return {
                ...prev,
                [ctxKey]: {
                    ...existing,
                    sending: true,
                },
            };
        });
    }, []);

    const addNewDraftInvoice = (tableId: number) => {
        const nextTempId = `draft_${Date.now()}`;
        const ctxKey = `${tableId}::${nextTempId}`;

        setContexts((prev) => ({
            ...prev,
            [ctxKey]: {
                tableId,
                invoiceKey: nextTempId,
                generation: 0,
                cart: [],
                history: [],
                baselineFingerprint: '[]',
                sending: false,
            },
        }));

        setActiveInvoiceId((prev) => ({
            ...prev,
            [tableId]: nextTempId,
        }));
    };

    const removeDraftInvoice = (tableId: number, tempId: string) => {
        const ctxKey = `${tableId}::${tempId}`;

        setContexts((prev) => {
            const next = { ...prev };
            delete next[ctxKey];

            const remaining = Object.values(next).filter(
                (c) => c.tableId === tableId,
            );

            if (remaining.length === 0) {
                next[`${tableId}::draft_default`] = {
                    tableId,
                    invoiceKey: 'draft_default',
                    generation: 0,
                    cart: [],
                    history: [],
                    baselineFingerprint: '[]',
                    sending: false,
                };
            }

            return next;
        });

        setActiveInvoiceId((prev) => {
            if (prev[tableId] === tempId) {
                return {
                    ...prev,
                    [tableId]: 'draft_default',
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
        const ctx = contexts[`${tableId}::${activeId}`];
        const generation = ctx?.generation ?? 0;

        commitDraftChange(
            { tableId, invoiceKey: activeId, generation },
            'add',
            String(product.id),
            1,
            productById,
        );
    };

    const handleUpdateQuantity = (menuItemId: number, delta: number) => {
        if (!selectedTable) {
            return;
        }

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const ctxKey = `${tableId}::${activeId}`;
        const ctx = contexts[ctxKey];
        const generation = ctx?.generation ?? 0;
        const existingCart = ctx?.cart || [];

        const draftItem = existingCart.find(
            (i) => i.menu_item_id === menuItemId && !i.isConfirmed,
        );

        if (draftItem) {
            const lineId =
                draftItem.draftLineId || String(draftItem.menu_item_id);
            const newQty = draftItem.quantity + delta;

            commitDraftChange(
                { tableId, invoiceKey: activeId, generation },
                'setQty',
                lineId,
                newQty,
                productById,
            );
        } else if (delta > 0) {
            commitDraftChange(
                { tableId, invoiceKey: activeId, generation },
                'add',
                String(menuItemId),
                delta,
                productById,
            );
        }
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
        const ctxKey = `${tableId}::${activeId}`;

        setContexts((prev) => {
            const ctx = prev[ctxKey];

            if (!ctx) {
                return prev;
            }

            const updated = ctx.cart.map((item) => {
                if (item.orderItemId === orderItemId && item.isConfirmed) {
                    const newStagedQty =
                        (item.stagedReduceQty || 0) + reduceQty;
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

            whisperDraftCart(tableId, updated);

            return {
                ...prev,
                [ctxKey]: {
                    ...ctx,
                    cart: updated,
                },
            };
        });
    };

    const handleRemoveItem = (menuItemId: number) => {
        if (!selectedTable) {
            return;
        }

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const ctxKey = `${tableId}::${activeId}`;
        const ctx = contexts[ctxKey];
        const generation = ctx?.generation ?? 0;

        commitDraftChange(
            { tableId, invoiceKey: activeId, generation },
            'remove',
            String(menuItemId),
            0,
            productById,
        );
    };

    const handleUpdateNote = (menuItemId: number, note: string) => {
        if (!selectedTable) {
            return;
        }

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const ctxKey = `${tableId}::${activeId}`;

        setContexts((prev) => {
            const ctx = prev[ctxKey];

            if (!ctx) {
                return prev;
            }

            const updated = ctx.cart.map((item) =>
                item.menu_item_id === menuItemId ? { ...item, note } : item,
            );

            return {
                ...prev,
                [ctxKey]: {
                    ...ctx,
                    cart: updated,
                    history: [], // ponytail: clear history on unrecorded note edit
                },
            };
        });
    };

    const clearTableCart = (tableId?: number, invoiceId?: string) => {
        if (tableId === undefined || tableId === null) {
            return;
        }

        const activeId =
            invoiceId || activeInvoiceId[tableId] || 'draft_default';
        const ctxKey = `${tableId}::${activeId}`;

        setContexts((prev) => {
            const next = { ...prev };
            const existing = next[ctxKey];
            const nextGen = (existing?.generation ?? 0) + 1;

            if (activeId.startsWith('draft_')) {
                delete next[ctxKey];
            } else if (existing) {
                next[ctxKey] = {
                    ...existing,
                    generation: nextGen,
                    history: [],
                    cart: existing.cart.filter((i) => i.isConfirmed),
                    sending: false,
                };
            }

            const remainingForTable = Object.values(next).filter(
                (c) => c.tableId === tableId,
            );

            if (remainingForTable.length === 0) {
                next[`${tableId}::draft_default`] = {
                    tableId,
                    invoiceKey: 'draft_default',
                    generation: 0,
                    cart: [],
                    history: [],
                    baselineFingerprint: '[]',
                    sending: false,
                };
            }

            return next;
        });

        setActiveInvoiceId((prevActive) => {
            if (prevActive[tableId] === activeId) {
                return {
                    ...prevActive,
                    [tableId]: 'draft_default',
                };
            }

            return prevActive;
        });

        whisperDraftCart(tableId, []);
    };

    const clearUnconfirmedDraft = (tableId?: number, invoiceId?: string) => {
        if (tableId === undefined || tableId === null) {
            return;
        }

        const activeId =
            invoiceId || activeInvoiceId[tableId] || 'draft_default';
        const ctxKey = `${tableId}::${activeId}`;

        setContexts((prev) => {
            const existing = prev[ctxKey];

            if (!existing) {
                return prev;
            }

            const confirmedOnly = existing.cart
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

            const next = { ...prev };

            if (
                confirmedOnly.length === 0 &&
                activeId.startsWith('draft_') &&
                activeId !== 'draft_default'
            ) {
                delete next[ctxKey];
            } else {
                next[ctxKey] = {
                    ...existing,
                    cart: confirmedOnly,
                    history: [],
                };
            }

            return next;
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
        // Draft Undo & History additions:
        commitDraftChange,
        undoDraft,
        canUndo,
        undoError,
        sending,
        invalidateContexts,
        reconcileBaseline,
        onSendBegin,
        onSendSuccess,
        onSendFailure,
        onSendAmbiguous,
    };
}
