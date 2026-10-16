import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { POSProductData } from '../types/pos.types';
import {
    normalizeName,
    mergeSortStable,
    buildMenuIndex,
} from './menuAlgorithms.ts';

describe('normalizeName', () => {
    it('folds Vietnamese accents, đ, case and whitespace identically', () => {
        assert.equal(normalizeName('  CÀ  PHÊ '), normalizeName('ca phe'));
        assert.equal(normalizeName('Đường'), normalizeName('duong'));
        assert.equal(normalizeName('Cà\u0300 phê'), normalizeName('cà phê'));
        assert.equal(normalizeName('  TRÀ   ĐÁ  '), 'tra da');
    });
});

describe('mergeSortStable', () => {
    it('keeps original order for equal keys and does not mutate input', () => {
        const input = Object.freeze([
            { k: 1, i: 0 },
            { k: 1, i: 1 },
            { k: 0, i: 2 },
        ]);
        const out = mergeSortStable(input, (a, b) => a.k - b.k);
        assert.deepEqual(
            out.map((x) => x.i),
            [2, 0, 1],
        );
        assert.equal(input.length, 3);
    });

    it('handles empty and singleton arrays without mutation', () => {
        const empty = Object.freeze([]);
        assert.deepEqual(
            mergeSortStable(empty, (a: number, b: number) => a - b),
            [],
        );
        const single = Object.freeze([{ id: 1 }]);
        assert.deepEqual(
            mergeSortStable(single, (a, b) => a.id - b.id),
            [{ id: 1 }],
        );
    });

    it('preserves stability in reverse comparison (descending order)', () => {
        const input = Object.freeze([
            { k: 10, i: 0 },
            { k: 20, i: 1 },
            { k: 20, i: 2 },
            { k: 10, i: 3 },
        ]);
        const out = mergeSortStable(input, (a, b) => b.k - a.k);
        assert.deepEqual(
            out.map((x) => x.i),
            [1, 2, 0, 3],
        );
    });
});

describe('buildMenuIndex', () => {
    const sampleProducts: POSProductData[] = [
        {
            id: 10,
            category_id: 1,
            name: 'Cà phê sữa',
            price: 25.5,
            is_available: true,
        },
        {
            id: 20,
            category_id: 1,
            name: 'Trà đào',
            price: 25.5,
            is_available: true,
        },
        {
            id: 30,
            category_id: 2,
            name: 'Bánh mì',
            price: 15,
            is_available: false,
        },
    ];

    it('indexes entries, builds ID lookup map, and sorts price index with tie-breaker', () => {
        const index = buildMenuIndex(sampleProducts);

        assert.equal(index.entries.length, 3);
        assert.equal(index.entries[0].normalizedName, 'ca phe sua');
        assert.equal(index.entries[0].priceMinor, 2550);
        assert.equal(index.entries[0].originalIndex, 0);

        assert.equal(index.productById.get(10)?.name, 'Cà phê sữa');
        assert.equal(index.productById.get(20)?.name, 'Trà đào');
        assert.equal(index.productById.get(30)?.name, 'Bánh mì');
        assert.equal(index.productById.size, 3);

        // Price index: 15 (id 30), then tie at 25.5 preserved by originalIndex: id 10 then id 20
        assert.deepEqual(
            index.priceIndex.map((e) => e.product.id),
            [30, 10, 20],
        );
    });

    it('throws error on duplicate product id', () => {
        const duplicateProducts: POSProductData[] = [
            {
                id: 1,
                category_id: 1,
                name: 'Món 1',
                price: 10,
                is_available: true,
            },
            {
                id: 1,
                category_id: 1,
                name: 'Món 1 trùng',
                price: 20,
                is_available: true,
            },
        ];
        assert.throws(
            () => buildMenuIndex(duplicateProducts),
            /duplicate product id 1/,
        );
    });

    it('throws error on invalid price', () => {
        const negativePrice = [
            {
                id: 1,
                category_id: 1,
                name: 'Món âm',
                price: -10,
                is_available: true,
            },
        ];
        assert.throws(
            () => buildMenuIndex(negativePrice),
            /invalid price for product 1/,
        );

        const nanPrice = [
            {
                id: 2,
                category_id: 1,
                name: 'Món NaN',
                price: Number.NaN,
                is_available: true,
            },
        ];
        assert.throws(
            () => buildMenuIndex(nanPrice),
            /invalid price for product 2/,
        );
    });
});
