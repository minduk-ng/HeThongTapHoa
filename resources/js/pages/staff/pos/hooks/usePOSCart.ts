import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

    const [contexts, renderContexts] = useState<Record<string, ContextState>>({});
    const contextsRef = useRef(contexts);
    const nextGeneration = useRef(0);
    const tableBaselines = useRef(new Map<number, string>());
    // Event callbacks must see earlier changes in the same React batch.
    const setContexts = useCallback((update: (prev: Record<string, ContextState>) => Record<string, ContextState>) => {
        const next = update(contextsRef.current);
        contextsRef.current = next;
        renderContexts(next);
    }, []);

    const [activeInvoiceId, setActiveInvoiceId] = useState<
        Record<number, string>
    >({});
    const [undoErrorState, setUndoErrorState] = useState<{
        contextKey: string;
        message: string;
    } | null>(null);

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

    const activeContextKey = `${selectedTable?.id ?? 'none'}::${activeInvId}`;
    const undoError =
        undoErrorState?.contextKey === activeContextKey
            ? undoErrorState.message
            : null;

    const setUndoError = useCallback(
        (message: string | null) => {
            if (message === null) {
                setUndoErrorState(null);
            } else {
                setUndoErrorState({ contextKey: activeContextKey, message });
            }
        },
        [activeContextKey],
    );

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
            const currentContexts = contextsRef.current;
            const ctx = currentContexts[ctxKey] || {
                tableId: key.tableId,
                invoiceKey: key.invoiceKey,
                generation: key.generation,
                cart: [],
                history: [],
                baselineFingerprint: '[]',
                sending: false,
            };

            if (ctx.generation !== key.generation) {
                return;
            }

            if (ctx.sending) {
                return;
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
                    return;
                }

                if (existingDraft) {
                    const product = latestProducts.get(
                        existingDraft.menu_item_id,
                    );

                    if (!product || !product.is_available) {
                        return;
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
                        return;
                    }

                    newCart = [...prevCart];
                    newCart[draftIndex] = {
                        ...existingDraft,
                        quantity: nextQty,
                    };
                } else {
                    const menuItemId = Number(lineId);

                    if (isNaN(menuItemId)) {
                        return;
                    }

                    const product = latestProducts.get(menuItemId);

                    if (!product || !product.is_available) {
                        return;
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
                        return;
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
                    return;
                }

                newCart = prevCart.filter(
                    (i) =>
                        i.isConfirmed ||
                        (i.draftLineId !== lineId &&
                            String(i.menu_item_id) !== lineId),
                );
            } else if (action === 'setQty') {
                if (!Number.isInteger(qty)) {
                    return;
                }

                if (!existingDraft) {
                    return;
                }

                if (qty === existingDraft.quantity) {
                    return;
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
                        return;
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
                        return;
                    }

                    newCart = [...prevCart];
                    newCart[draftIndex] = {
                        ...existingDraft,
                        quantity: qty,
                    };
                }
            }

            if (!newCart) {
                return;
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

            setContexts((prev) => {
                const current = prev[ctxKey] || ctx;

                if (
                    current.generation !== key.generation ||
                    current.sending
                ) {
                    return prev;
                }

                return {
                    ...prev,
                    [ctxKey]: {
                        ...current,
                        cart: newCart!,
                        history: nextHistory,
                    },
                };
            });

            whisperDraftCart(key.tableId, newCart);
            setUndoError(null);
        },
        [setUndoError, setContexts],
    );

    const undoDraft = useCallback(
        (
            key?: ContextKey,
            latestProducts?: ReadonlyMap<number, POSProductData>,
        ): void => {
            const productsMap = latestProducts || productById;

            let targetTableId: number;
            let targetInvoiceKey: string;
            let targetGen: number;

            if (key) {
                targetTableId = key.tableId;
                targetInvoiceKey = key.invoiceKey;
                targetGen = key.generation;
            } else {
                if (!selectedTable) {
                    return;
                }

                targetTableId = selectedTable.id;
                targetInvoiceKey =
                    activeInvoiceId[targetTableId] || 'draft_default';
                const existing =
                    contextsRef.current[`${targetTableId}::${targetInvoiceKey}`];

                if (!existing) {
                    return;
                }

                targetGen = existing.generation;
            }

            const ctxKey = `${targetTableId}::${targetInvoiceKey}`;
            const ctx = contextsRef.current[ctxKey];

            if (!ctx) {
                return;
            }

            if (ctx.generation !== targetGen) {
                return;
            }

            if (ctx.sending) {
                setUndoError('Đang gửi bếp, không thể hoàn tác');

                return;
            }

            if (ctx.history.length === 0) {
                return;
            }

            const snap = ctx.history[ctx.history.length - 1];
            const valResult = validateRestore(snap, productsMap);

            if (!valResult.ok) {
                setUndoError(valResult.message);

                return;
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
                    orderItemId: r.orderItemId,
                };
            });

            const nextCart = [...confirmedRows, ...restoredUnconfirmed];
            const { nextHistory } = popDraftSnapshot(ctx.history);

            setContexts((prev) => {
                const current = prev[ctxKey];

                if (
                    !current ||
                    current.generation !== targetGen ||
                    current.sending
                ) {
                    return prev;
                }

                return {
                    ...prev,
                    [ctxKey]: {
                        ...current,
                        cart: nextCart,
                        history: nextHistory,
                    },
                };
            });

            whisperDraftCart(targetTableId, nextCart);
        },
        [selectedTable, activeInvoiceId, productById, setUndoError, setContexts],
    );

    const invalidateContexts = useCallback(
        (keys: ContextKey[], reason?: string) => {
            void reason;
            setContexts((prev) => {
                const next = { ...prev };

                for (const k of keys) {
                    const ctxKey = `${k.tableId}::${k.invoiceKey}`;
                    const existing = next[ctxKey];

                    if (existing && existing.generation === k.generation) {
                        next[ctxKey] = {
                            ...existing,
                            generation: ++nextGeneration.current,
                            history: [],
                            cart: existing.cart.filter((i) => i.isConfirmed),
                            sending: false,
                        };
                    }
                }

                return next;
            });
        },
        [setContexts],
    );

    const reconcileBaseline = useCallback((serverTables: POSTableData[]) => {
        const safeTables = (
            Array.isArray(serverTables)
                ? serverTables
                : Object.values(serverTables || {})
        ) as POSTableData[];

        const allServerOrderViews = extractServerOrderViews(safeTables);
        const changedTables = new Set<number>();
        const nextTableBaselines = new Map<number, string>();

        for (const table of safeTables) {
            const groupId = table.merged_into_table_id ?? table.id;
            const ownership = safeTables.filter(t => t.id === groupId || t.merged_into_table_id === groupId).map(t => t.id).sort((a, b) => a - b);
            const baseline = JSON.stringify([groupId, ownership, fingerprintBaseline(allServerOrderViews.filter(v => v.tableId === table.id))]);
            const previous = tableBaselines.current.get(table.id);

            if (previous !== undefined && previous !== baseline) {
                changedTables.add(table.id);
            }

            nextTableBaselines.set(table.id, baseline);
        }

        tableBaselines.current = nextTableBaselines;
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

                if (currentActive && currentActive.startsWith('draft_') && !changedTables.has(table.id)) {
                    return;
                } else if (currentActive && currentActive.startsWith('draft_')) {
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
                    const groupId = table.merged_into_table_id ?? table.id;
                    const ownership = safeTables.filter(t => t.id === groupId || t.merged_into_table_id === groupId).map(t => t.id).sort((a, b) => a - b);
                    const newFingerprint = JSON.stringify([groupId, ownership, fingerprintBaseline(serverOrders)]);
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
                                    draftLineId: isDraft ? `server_${item.id}` : undefined,
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
                            generation: ++nextGeneration.current,
                            cart: confirmedCartItems,
                            history: [],
                            baselineFingerprint: newFingerprint,
                            sending: false,
                        };
                    } else {
                        const isFingerprintEqual =
                            existingCtx.baselineFingerprint === newFingerprint;

                        if (isFingerprintEqual) {
                            nextContexts[ctxKey] = existingCtx;
                        } else {
                            nextContexts[ctxKey] = {
                                ...existingCtx,
                                generation: ++nextGeneration.current,
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

                    if (tableExists && !changedTables.has(ctx.tableId) && ctx.baselineFingerprint === '[]') {
                        nextContexts[ctxKey] = ctx;
                    }
                }
            });

            return nextContexts;
        });
    }, [setContexts]);

    useEffect(() => {
        queueMicrotask(() => {
            reconcileBaseline(tables);
        });
    }, [tables, reconcileBaseline]);

    const onSendBegin = useCallback(
        (tableId: number, invoiceKey: string): ContextKey | null => {
            const ctxKey = `${tableId}::${invoiceKey}`;
            const existing = contextsRef.current[ctxKey];

            if (!existing || existing.sending) {
                return null;
            }

            const capturedKey: ContextKey = {
                tableId,
                invoiceKey,
                generation: ++nextGeneration.current,
            };

            setContexts((prev) => {
                const ctx = prev[ctxKey];

                if (!ctx) {
                    return prev;
                }

                return {
                    ...prev,
                    [ctxKey]: {
                        ...ctx,
                        generation: capturedKey.generation,
                        sending: true,
                    },
                };
            });

            return capturedKey;
        },
        [setContexts],
    );

    const onSendSuccess = useCallback(
        (key: ContextKey, serverTables?: POSTableData[]) => {
            const ctxKey = `${key.tableId}::${key.invoiceKey}`;
            const current = contextsRef.current[ctxKey];

            if (!current || current.generation !== key.generation) {
                return;
            }

            setContexts((prev) => {
                const existing = prev[ctxKey];

                if (!existing || existing.generation !== key.generation) {
                    return prev;
                }

                return {
                    ...prev,
                    [ctxKey]: {
                        ...existing,
                        generation: ++nextGeneration.current,
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
        [reconcileBaseline, setContexts],
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
    }, [setContexts]);

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
    }, [setContexts]);

    const addNewDraftInvoice = (tableId: number) => {
        const nextTempId = `draft_${generateDraftLineId()}`;
        const ctxKey = `${tableId}::${nextTempId}`;

        setContexts((prev) => ({
            ...prev,
            [ctxKey]: {
                tableId,
                invoiceKey: nextTempId,
                generation: ++nextGeneration.current,
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

        if (contextsRef.current[ctxKey]?.sending) {
            return;
        }

        setContexts((prev) => {
            const next = { ...prev };
            const removedCtx = next[ctxKey];
            delete next[ctxKey];

            const remaining = Object.values(next).filter(
                (c) => c.tableId === tableId,
            );

            if (remaining.length === 0) {
                const defaultExisting = prev[`${tableId}::draft_default`];
                const defaultGen =
                    (defaultExisting?.generation ??
                        removedCtx?.generation ??
                        0) + 1;

                next[`${tableId}::draft_default`] = {
                    tableId,
                    invoiceKey: 'draft_default',
                    generation: defaultGen,
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
        const ctx = contextsRef.current[`${tableId}::${activeId}`];
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
        const ctx = contextsRef.current[ctxKey];
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
        const ctx = contextsRef.current[ctxKey];

        if (!ctx || ctx.sending) {
            return;
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

        setContexts((prev) => {
            const current = prev[ctxKey];

            if (!current) {
                return prev;
            }

            return {
                ...prev,
                [ctxKey]: {
                    ...current,
                    cart: updated,
                },
            };
        });

        whisperDraftCart(tableId, updated);
    };

    const handleRemoveItem = (menuItemId: number) => {
        if (!selectedTable) {
            return;
        }

        const tableId = selectedTable.id;
        const activeId = activeInvoiceId[tableId] || 'draft_default';
        const ctxKey = `${tableId}::${activeId}`;
        const ctx = contextsRef.current[ctxKey];
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

            if (!ctx || ctx.sending) {
                return prev;
            }

            const updated = ctx.cart.map((item) =>
                !item.isConfirmed && item.menu_item_id === menuItemId ? { ...item, note } : item,
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
                const defaultExisting = prev[`${tableId}::draft_default`];
                const defaultGen =
                    (defaultExisting?.generation ??
                        existing?.generation ??
                        0) + 1;

                next[`${tableId}::draft_default`] = {
                    tableId,
                    invoiceKey: 'draft_default',
                    generation: defaultGen,
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

    const captureContexts = (tableIds: number[], invoiceKeys?: string[]): ContextKey[] =>
        Object.values(contextsRef.current)
            .filter(ctx => tableIds.includes(ctx.tableId) && (!invoiceKeys || invoiceKeys.includes(ctx.invoiceKey)))
            .map(({ tableId, invoiceKey, generation }) => ({ tableId, invoiceKey, generation }));

    return {
        captureContexts,
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
