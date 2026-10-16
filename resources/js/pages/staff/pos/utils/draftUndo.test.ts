import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { DraftLine, DraftSnapshot } from './draftUndo.ts';
import {
    pushDraftSnapshot,
    popDraftSnapshot,
    validateRestore,
    fingerprintBaseline,
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

describe('fingerprintBaseline', () => {
    it('serializes tables payload', () => {
        const payload = { tables: [{ id: 1, name: 'Table 1' }] };
        const fp = fingerprintBaseline(payload);

        assert.equal(fp, JSON.stringify(payload.tables));
    });

    it('handles null or missing tables safely', () => {
        assert.equal(fingerprintBaseline({ tables: null }), 'null');
        assert.equal(fingerprintBaseline({ tables: undefined }), 'null');
    });
});
