import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { DraftLine, DraftSnapshot, ServerOrderView } from './draftUndo.ts';
import {
    pushDraftSnapshot,
    popDraftSnapshot,
    validateRestore,
    fingerprintBaseline,
    extractServerOrderViews,
    generateDraftLineId,
} from './draftUndo.ts';

describe('pushDraftSnapshot', () => {
    it('caps at 50 and freezes snapshots', () => {
        let h: DraftSnapshot[] = [];

        for (let i = 0; i < 51; i++) {
            h = pushDraftSnapshot(h, {
                rows: [
                    {
                        draftLineId: String(i),
                        menu_item_id: i,
                        quantity: 1,
                        unit_price: 1000,
                        vat_rate: 10,
                    },
                ],
            });
        }

        assert.equal(h.length, 50);
        assert.equal(h[0].rows[0].draftLineId, '1');
        assert.equal(h[49].rows[0].draftLineId, '50');

        assert.throws(() => {
            (h[0].rows as unknown[]).push('x');
        });
        assert.throws(() => {
            h[0].rows[0].quantity = 99;
        });
    });

    it('does not mutate original history array or input snapshot', () => {
        const initialRow: DraftLine = {
            draftLineId: 'line-1',
            menu_item_id: 10,
            quantity: 2,
            unit_price: 50000,
            vat_rate: 8,
        };
        const initialSnap: DraftSnapshot = { rows: [initialRow] };
        const initialHistory: readonly DraftSnapshot[] = Object.freeze([]);

        const nextHistory = pushDraftSnapshot(initialHistory, initialSnap);

        assert.equal(initialHistory.length, 0);
        assert.equal(nextHistory.length, 1);

        initialSnap.rows[0].quantity = 999;
        assert.equal(nextHistory[0].rows[0].quantity, 2);
    });

    it('supports custom capacity limit', () => {
        let h: DraftSnapshot[] = [];

        for (let i = 0; i < 5; i++) {
            h = pushDraftSnapshot(
                h,
                {
                    rows: [
                        {
                            draftLineId: `line-${i}`,
                            menu_item_id: i,
                            quantity: 1,
                            unit_price: 1000,
                            vat_rate: 0,
                        },
                    ],
                },
                3,
            );
        }

        assert.equal(h.length, 3);
        assert.equal(h[0].rows[0].draftLineId, 'line-2');
        assert.equal(h[1].rows[0].draftLineId, 'line-3');
        assert.equal(h[2].rows[0].draftLineId, 'line-4');
    });
});

describe('popDraftSnapshot', () => {
    it('returns undefined snapshot and empty nextHistory on empty history', () => {
        const result = popDraftSnapshot([]);

        assert.equal(result.snapshot, undefined);
        assert.deepEqual(result.nextHistory, []);
    });

    it('pops the latest snapshot and returns preceding history without mutating input', () => {
        const snap1: DraftSnapshot = {
            rows: [
                {
                    draftLineId: 'l1',
                    menu_item_id: 1,
                    quantity: 1,
                    unit_price: 1000,
                    vat_rate: 0,
                },
            ],
        };
        const snap2: DraftSnapshot = {
            rows: [
                {
                    draftLineId: 'l2',
                    menu_item_id: 2,
                    quantity: 2,
                    unit_price: 2000,
                    vat_rate: 0,
                },
            ],
        };

        const history = pushDraftSnapshot(pushDraftSnapshot([], snap1), snap2);

        assert.equal(history.length, 2);

        const { snapshot, nextHistory } = popDraftSnapshot(history);

        assert.equal(history.length, 2);
        assert.equal(snapshot?.rows[0].draftLineId, 'l2');
        assert.equal(nextHistory.length, 1);
        assert.equal(nextHistory[0].rows[0].draftLineId, 'l1');
    });
});

describe('validateRestore', () => {
    it('returns ok for empty snapshot rows', () => {
        const emptySnap: DraftSnapshot = { rows: [] };
        const products = new Map();

        const result = validateRestore(emptySnap, products);

        assert.deepEqual(result, { ok: true });
    });

    it('returns ok when all items exist, are available, and within serving limits', () => {
        const snap: DraftSnapshot = {
            rows: [
                {
                    draftLineId: 'l1',
                    menu_item_id: 101,
                    quantity: 2,
                    unit_price: 25000,
                    vat_rate: 8,
                },
                {
                    draftLineId: 'l2',
                    menu_item_id: 102,
                    quantity: 1,
                    unit_price: 30000,
                    vat_rate: 8,
                },
            ],
        };
        const products = new Map([
            [101, { is_available: true, max_servings: 10 }],
            [102, { is_available: true, max_servings: 5 }],
        ]);

        const result = validateRestore(snap, products);

        assert.deepEqual(result, { ok: true });
    });

    it('aggregates quantities across multiple rows of the same product', () => {
        const snap: DraftSnapshot = {
            rows: [
                {
                    draftLineId: 'l1',
                    menu_item_id: 101,
                    quantity: 3,
                    note: 'ít đá',
                    unit_price: 25000,
                    vat_rate: 8,
                },
                {
                    draftLineId: 'l2',
                    menu_item_id: 101,
                    quantity: 3,
                    note: 'không đá',
                    unit_price: 25000,
                    vat_rate: 8,
                },
            ],
        };

        const productsOver = new Map([
            [101, { is_available: true, max_servings: 5 }],
        ]);
        const resultOver = validateRestore(snap, productsOver);

        assert.deepEqual(resultOver, {
            ok: false,
            message: 'Số lượng vượt quá suất phục vụ hiện tại.',
        });

        const productsExact = new Map([
            [101, { is_available: true, max_servings: 6 }],
        ]);
        const resultExact = validateRestore(snap, productsExact);

        assert.deepEqual(resultExact, { ok: true });
    });

    it('uses default max_servings of 999 when unspecified', () => {
        const snap: DraftSnapshot = {
            rows: [
                {
                    draftLineId: 'l1',
                    menu_item_id: 101,
                    quantity: 1000,
                    unit_price: 25000,
                    vat_rate: 8,
                },
            ],
        };
        const products = new Map([[101, { is_available: true }]]);

        const result = validateRestore(snap, products);

        assert.deepEqual(result, {
            ok: false,
            message: 'Số lượng vượt quá suất phục vụ hiện tại.',
        });
    });

    it('returns error when item is not found in latestProducts', () => {
        const snap: DraftSnapshot = {
            rows: [
                {
                    draftLineId: 'l1',
                    menu_item_id: 999,
                    quantity: 1,
                    unit_price: 25000,
                    vat_rate: 8,
                },
            ],
        };
        const products = new Map();

        const result = validateRestore(snap, products);

        assert.deepEqual(result, {
            ok: false,
            message: 'Món đã không còn trong thực đơn.',
        });
    });

    it('returns error when item is marked as unavailable', () => {
        const snap: DraftSnapshot = {
            rows: [
                {
                    draftLineId: 'l1',
                    menu_item_id: 101,
                    quantity: 1,
                    unit_price: 25000,
                    vat_rate: 8,
                },
            ],
        };
        const products = new Map([
            [101, { is_available: false, max_servings: 10 }],
        ]);

        const result = validateRestore(snap, products);

        assert.deepEqual(result, {
            ok: false,
            message: 'Món hiện đã hết hàng.',
        });
    });
});

describe('generateDraftLineId', () => {
    it('generates non-empty unique string IDs', () => {
        const id1 = generateDraftLineId();
        const id2 = generateDraftLineId();

        assert.equal(typeof id1, 'string');
        assert.ok(id1.length > 0);
        assert.notEqual(id1, id2);
    });
});

describe('fingerprintBaseline', () => {
    it('returns empty array string for empty or missing orders', () => {
        assert.equal(fingerprintBaseline([]), '[]');
        assert.equal(fingerprintBaseline(null as unknown as ServerOrderView[]), '[]');
        assert.equal(fingerprintBaseline(undefined as unknown as ServerOrderView[]), '[]');
    });

    it('produces identical fingerprints regardless of order insertion order', () => {
        const orderA: ServerOrderView = {
            id: 1,
            invoiceKey: 'INV-1',
            status: 'pending',
            tableId: 1,
            items: [
                { id: 10, quantity: 2, unit_price: 15000, note: 'ít cay', status: 'pending', isConfirmed: true, isKitchenCompleted: false, isServed: false },
            ],
        };
        const orderB: ServerOrderView = {
            id: 2,
            invoiceKey: 'INV-2',
            status: 'processing',
            tableId: 2,
            items: [
                { id: 20, quantity: 1, unit_price: 30000, note: null, status: 'processing', isConfirmed: true, isKitchenCompleted: false, isServed: false },
            ],
        };

        const fp1 = fingerprintBaseline([orderA, orderB]);
        const fp2 = fingerprintBaseline([orderB, orderA]);

        assert.equal(fp1, fp2);
    });

    it('produces identical fingerprints regardless of item insertion order within an order', () => {
        const item1 = { id: 10, quantity: 1, unit_price: 20000, note: 'nóng', status: 'pending', isConfirmed: true, isKitchenCompleted: false, isServed: false };
        const item2 = { id: 20, quantity: 2, unit_price: 40000, note: 'lạnh', status: 'pending', isConfirmed: true, isKitchenCompleted: false, isServed: false };

        const order1: ServerOrderView = {
            id: 1,
            invoiceKey: 'INV-1',
            status: 'pending',
            tableId: 1,
            items: [item1, item2],
        };
        const order2: ServerOrderView = {
            id: 1,
            invoiceKey: 'INV-1',
            status: 'pending',
            tableId: 1,
            items: [item2, item1],
        };

        assert.equal(fingerprintBaseline([order1]), fingerprintBaseline([order2]));
    });

    it('detects changes in item quantities, prices, notes, and statuses', () => {
        const baseOrder: ServerOrderView = {
            id: 1,
            invoiceKey: 'INV-1',
            status: 'pending',
            tableId: 1,
            items: [
                { id: 10, quantity: 2, unit_price: 25000, note: 'ghi chú', status: 'pending', isConfirmed: true, isKitchenCompleted: false, isServed: false },
            ],
        };

        const baseFp = fingerprintBaseline([baseOrder]);

        const qtyChanged: ServerOrderView = {
            ...baseOrder,
            items: [{ ...baseOrder.items[0], quantity: 3 }],
        };
        assert.notEqual(baseFp, fingerprintBaseline([qtyChanged]));

        const priceChanged: ServerOrderView = {
            ...baseOrder,
            items: [{ ...baseOrder.items[0], unit_price: 26000 }],
        };
        assert.notEqual(baseFp, fingerprintBaseline([priceChanged]));

        const noteChanged: ServerOrderView = {
            ...baseOrder,
            items: [{ ...baseOrder.items[0], note: 'đổi ghi chú' }],
        };
        assert.notEqual(baseFp, fingerprintBaseline([noteChanged]));

        const kitchenCompletedChanged: ServerOrderView = {
            ...baseOrder,
            items: [{ ...baseOrder.items[0], isKitchenCompleted: true }],
        };
        assert.notEqual(baseFp, fingerprintBaseline([kitchenCompletedChanged]));

        const servedChanged: ServerOrderView = {
            ...baseOrder,
            items: [{ ...baseOrder.items[0], isServed: true }],
        };
        assert.notEqual(baseFp, fingerprintBaseline([servedChanged]));

        const confirmedChanged: ServerOrderView = {
            ...baseOrder,
            items: [{ ...baseOrder.items[0], isConfirmed: false }],
        };
        assert.notEqual(baseFp, fingerprintBaseline([confirmedChanged]));

        const orderStatusChanged: ServerOrderView = {
            ...baseOrder,
            status: 'completed',
        };
        assert.notEqual(baseFp, fingerprintBaseline([orderStatusChanged]));
    });
});

describe('extractServerOrderViews', () => {
    it('maps POSTableData into ServerOrderView filtering cancelled items', () => {
        const tables = [
            {
                id: 1,
                table_number: 'B01',
                capacity: 4,
                status: 'occupied' as const,
                active_orders: [
                    {
                        id: 101,
                        order_code: 'ORD-101',
                        status: 'pending' as const,
                        items: [
                            {
                                id: 501,
                                menu_item_id: 1,
                                quantity: 2,
                                unit_price: 35000,
                                status: 'pending' as const,
                                note: 'ít đường',
                            },
                            {
                                id: 502,
                                menu_item_id: 2,
                                quantity: 1,
                                unit_price: 45000,
                                status: 'cancelled' as const,
                            },
                        ],
                    },
                ],
            },
        ];

        const views = extractServerOrderViews(tables);

        assert.equal(views.length, 1);
        assert.equal(views[0].tableId, 1);
        assert.equal(views[0].invoiceKey, 'ORD-101');
        assert.equal(views[0].status, 'pending');
        assert.equal(views[0].items.length, 1);
        assert.equal(views[0].items[0].id, 501);
        assert.equal(views[0].items[0].quantity, 2);
        assert.equal(views[0].items[0].unit_price, 35000);
        assert.equal(views[0].items[0].note, 'ít đường');
        assert.equal(views[0].items[0].isConfirmed, true);
        assert.equal(views[0].items[0].isKitchenCompleted, false);
    });

    it('marks draft or reserved orders as unconfirmed', () => {
        const tables = [
            {
                id: 2,
                table_number: 'B02',
                capacity: 2,
                status: 'occupied' as const,
                active_order: {
                    id: 102,
                    status: 'draft' as const,
                    items: [
                        {
                            id: 503,
                            menu_item_id: 3,
                            quantity: 1,
                            unit_price: 20000,
                        },
                    ],
                },
            },
        ];

        const views = extractServerOrderViews(tables);

        assert.equal(views.length, 1);
        assert.equal(views[0].invoiceKey, 'draft_102');
        assert.equal(views[0].items[0].isConfirmed, false);
    });

    it('isolates local unconfirmed drafts from server unconfirmed items', () => {
        // Simulates the baseline reconciliation filter:
        // Local drafts lack orderItemId; server draft items have orderItemId
        const cartItems: Array<{ isConfirmed: boolean; orderItemId?: number; name: string }> = [
            { isConfirmed: false, orderItemId: 101, name: 'Server draft item' },
            { isConfirmed: false, name: 'Local draft item' },
            { isConfirmed: true, orderItemId: 102, name: 'Confirmed item' },
        ];

        const localDraftsOnly = cartItems.filter((i) => !i.isConfirmed && !i.orderItemId);

        assert.equal(localDraftsOnly.length, 1);
        assert.equal(localDraftsOnly[0].name, 'Local draft item');
    });
});
