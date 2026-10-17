import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { recommendedModelKeys } from './modelRecommendation.ts';

test('count outranks WAPE without claiming lowest error', () => {
    deepEqual(
        recommendedModelKeys([
            { model_key: 'naive', selected_count: 5, avg_wape: 30 },
            { model_key: 'sma_7', selected_count: 2, avg_wape: 5 },
        ]),
        ['naive'],
    );
});

test('no selections yields no recommendation', () => {
    deepEqual(
        recommendedModelKeys([
            { model_key: 'naive', selected_count: 0, avg_wape: 0 },
        ]),
        [],
    );
    deepEqual(recommendedModelKeys([]), []);
    deepEqual(
        recommendedModelKeys([
            { model_key: 'naive', avg_wape: 0 },
            { model_key: 'sma_7', selected_count: -1, avg_wape: 0 },
        ]),
        [],
    );
});

test('finite WAPE beats missing WAPE, including values above 999', () => {
    deepEqual(
        recommendedModelKeys([
            { model_key: 'naive', selected_count: 2, avg_wape: null },
            { model_key: 'sma_7', selected_count: 2, avg_wape: 1200 },
        ]),
        ['sma_7'],
    );
});

test('ties stay ties in original candidate order', () => {
    deepEqual(
        recommendedModelKeys([
            { model_key: 'naive', selected_count: 2, avg_wape: 10 },
            { model_key: 'sma_7', selected_count: 2, avg_wape: 10 },
        ]),
        ['naive', 'sma_7'],
    );
});

test('lower finite WAPE breaks equal selection counts', () => {
    deepEqual(
        recommendedModelKeys([
            { model_key: 'naive', selected_count: 2, avg_wape: 10 },
            { model_key: 'sma_7', selected_count: 2, avg_wape: 0 },
        ]),
        ['sma_7'],
    );
});

test('non-finite WAPE ranks after finite values and ties with missing values', () => {
    const rows = [null, NaN, Infinity, -Infinity].map((avg_wape, index) => ({
        model_key: String(index),
        selected_count: 2,
        avg_wape,
    }));
    deepEqual(recommendedModelKeys(rows), ['0', '1', '2', '3']);
    deepEqual(
        recommendedModelKeys([
            ...rows,
            { model_key: 'finite', selected_count: 2, avg_wape: 1200 },
        ]),
        ['finite'],
    );
});

test('selection leaves frozen input rows and their order intact', () => {
    const rows = Object.freeze([
        Object.freeze({ model_key: 'naive', selected_count: 1, avg_wape: 0 }),
        Object.freeze({ model_key: 'sma_7', selected_count: 3, avg_wape: 20 }),
    ]);
    deepEqual(recommendedModelKeys(rows), ['sma_7']);
    deepEqual(
        rows.map((row) => row.model_key),
        ['naive', 'sma_7'],
    );
});
