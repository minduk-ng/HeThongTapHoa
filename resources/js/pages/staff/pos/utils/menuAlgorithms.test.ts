import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { CartItem, POSProductData } from '../types/pos.types';
import {
    normalizeName,
    mergeSortStable,
    buildMenuIndex,
    parsePriceRange,
    queryMenu,
    aggregateCartQuantities,
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

        const invalidStr = [
            {
                id: 3,
                category_id: 1,
                name: 'Món chữ',
                price: 'abc',
                is_available: true,
            },
        ];
        assert.throws(
            () => buildMenuIndex(invalidStr),
            /invalid price for product 3/,
        );

        const emptyStr = [
            {
                id: 4,
                category_id: 1,
                name: 'Món rỗng',
                price: '   ',
                is_available: true,
            },
        ];
        assert.throws(
            () => buildMenuIndex(emptyStr),
            /invalid price for product 4/,
        );

        const negativeStr = [
            {
                id: 5,
                category_id: 1,
                name: 'Món âm chuỗi',
                price: '-15000.00',
                is_available: true,
            },
        ];
        assert.throws(
            () => buildMenuIndex(negativeStr),
            /invalid price for product 5/,
        );
    });

    it('accepts string prices formatted as decimals or integers from Laravel Eloquent', () => {
        const stringPrices = [
            {
                id: 1,
                category_id: 1,
                name: 'Cà phê đen',
                price: '15000.00',
                is_available: true,
            },
            {
                id: 2,
                category_id: 1,
                name: 'Trà đá',
                price: '5000',
                is_available: true,
            },
            {
                id: 3,
                category_id: 1,
                name: 'Nước lọc',
                price: '0.00',
                is_available: true,
            },
        ];

        const index = buildMenuIndex(stringPrices);
        assert.equal(index.entries[0].priceMinor, 1500000);
        assert.equal(index.entries[1].priceMinor, 500000);
        assert.equal(index.entries[2].priceMinor, 0);
    });
});

describe('parsePriceRange', () => {
    it('rejects negative and reversed ranges; treats blank as unbounded', () => {
        assert.equal(parsePriceRange('', '').ok, true);
        assert.equal(parsePriceRange('-5', '').ok, false);
        assert.equal(parsePriceRange('60', '30').ok, false);
        const eq = parsePriceRange('30', '30');
        assert.equal(eq.ok && eq.minMinor === eq.maxMinor, true);
    });

    it('parses valid inputs, trims whitespace, and converts to minor units', () => {
        const res = parsePriceRange('  15  ', ' 20.50 ');
        assert.deepEqual(res, { ok: true, minMinor: 1500, maxMinor: 2050 });

        const openMax = parsePriceRange('10', '');
        assert.deepEqual(openMax, { ok: true, minMinor: 1000, maxMinor: null });

        const openMin = parsePriceRange('', '45.25');
        assert.deepEqual(openMin, { ok: true, minMinor: null, maxMinor: 4525 });
    });

    it('returns specific error fields and messages for malformed input', () => {
        const badMin = parsePriceRange('abc', '10');
        assert.equal(badMin.ok, false);

        if (!badMin.ok) {
            assert.equal(badMin.field, 'min');
        }

        const badMax = parsePriceRange('10', '12.345');
        assert.equal(badMax.ok, false);

        if (!badMax.ok) {
            assert.equal(badMax.field, 'max');
        }

        const inverted = parsePriceRange('50', '20');
        assert.equal(inverted.ok, false);

        if (!inverted.ok) {
            assert.equal(inverted.field, 'range');
            assert.equal(
                inverted.message,
                'Giá tối thiểu đang lớn hơn giá tối đa.',
            );
        }
    });
});

describe('queryMenu', () => {
    const products: POSProductData[] = [
        {
            id: 1,
            category_id: 1,
            name: 'Cà phê đen',
            price: 30,
            is_available: true,
        },
        {
            id: 2,
            category_id: 1,
            name: 'Cà phê sữa',
            price: 30,
            is_available: true,
        },
        {
            id: 3,
            category_id: 2,
            name: 'Trà đào',
            price: 60,
            is_available: true,
        },
        {
            id: 4,
            category_id: 2,
            name: 'Bánh mì pate',
            price: 15,
            is_available: false,
        },
        {
            id: 5,
            category_id: 3,
            name: 'Trà sữa',
            price: 45.5,
            is_available: true,
        },
    ];
    const index = buildMenuIndex(products);

    it('binary range matches linear oracle and stays inclusive on duplicates', () => {
        const got = queryMenu(index, {
            name: '',
            categoryId: 'all',
            minMinor: 3000,
            maxMinor: 3000,
            sort: 'original',
        }).map((p) => p.id);
        assert.deepEqual(got, [1, 2]);
    });

    it('filters by categoryId', () => {
        const cat1 = queryMenu(index, {
            name: '',
            categoryId: '1',
            minMinor: null,
            maxMinor: null,
            sort: 'original',
        }).map((p) => p.id);
        assert.deepEqual(cat1, [1, 2]);

        const cat2 = queryMenu(index, {
            name: '',
            categoryId: '2',
            minMinor: null,
            maxMinor: null,
            sort: 'original',
        }).map((p) => p.id);
        assert.deepEqual(cat2, [3, 4]);
    });

    it('filters by accent-folded, case-folded name search', () => {
        const got = queryMenu(index, {
            name: 'ca phe',
            categoryId: 'all',
            minMinor: null,
            maxMinor: null,
            sort: 'original',
        }).map((p) => p.id);
        assert.deepEqual(got, [1, 2]);

        const gotTra = queryMenu(index, {
            name: 'TRÀ',
            categoryId: 'all',
            minMinor: null,
            maxMinor: null,
            sort: 'original',
        }).map((p) => p.id);
        assert.deepEqual(gotTra, [3, 5]);
    });

    it('sorts stably by name-asc and name-desc with originalIndex tie-breaker', () => {
        const nameAsc = queryMenu(index, {
            name: '',
            categoryId: 'all',
            minMinor: null,
            maxMinor: null,
            sort: 'name-asc',
        }).map((p) => p.name);
        assert.deepEqual(nameAsc, [
            'Bánh mì pate',
            'Cà phê đen',
            'Cà phê sữa',
            'Trà đào',
            'Trà sữa',
        ]);

        const nameDesc = queryMenu(index, {
            name: '',
            categoryId: 'all',
            minMinor: null,
            maxMinor: null,
            sort: 'name-desc',
        }).map((p) => p.name);
        assert.deepEqual(nameDesc, [
            'Trà sữa',
            'Trà đào',
            'Cà phê sữa',
            'Cà phê đen',
            'Bánh mì pate',
        ]);
    });

    it('sorts stably by price-asc and price-desc preserving original order on price ties', () => {
        const priceAsc = queryMenu(index, {
            name: '',
            categoryId: 'all',
            minMinor: null,
            maxMinor: null,
            sort: 'price-asc',
        }).map((p) => p.id);
        // 15 (id 4), 30 (id 1, then id 2), 45.5 (id 5), 60 (id 3)
        assert.deepEqual(priceAsc, [4, 1, 2, 5, 3]);

        const priceDesc = queryMenu(index, {
            name: '',
            categoryId: 'all',
            minMinor: null,
            maxMinor: null,
            sort: 'price-desc',
        }).map((p) => p.id);
        // 60 (id 3), 45.5 (id 5), 30 (id 1, then id 2), 15 (id 4)
        assert.deepEqual(priceDesc, [3, 5, 1, 2, 4]);
    });

    it('combines name, category, price range, and sort', () => {
        const got = queryMenu(index, {
            name: 'ca',
            categoryId: '1',
            minMinor: 2000,
            maxMinor: 3500,
            sort: 'name-desc',
        }).map((p) => p.id);
        // Category 1, price 3000 (in 2000..3500), 'ca' matches both, desc puts 'ca phe sua' before 'ca phe den'
        assert.deepEqual(got, [2, 1]);
    });
});

describe('aggregateCartQuantities', () => {
    it('cart map aggregates without merging distinct rows', () => {
        const map = aggregateCartQuantities([
            {
                menu_item_id: 1,
                name: 'A',
                quantity: 2,
                unit_price: 10,
                vat_rate: 0,
                note: 'x',
            },
            {
                menu_item_id: 1,
                name: 'A',
                quantity: 3,
                unit_price: 12,
                vat_rate: 0,
                note: 'y',
            },
        ]);
        assert.equal(map.get(1), 5);
    });

    it('aggregates multiple items and ignores rows with non-positive quantities', () => {
        const cart: CartItem[] = [
            {
                menu_item_id: 10,
                name: 'Item 10',
                quantity: 2,
                unit_price: 20,
                vat_rate: 0,
            },
            {
                menu_item_id: 20,
                name: 'Item 20',
                quantity: 1,
                unit_price: 50,
                vat_rate: 0,
            },
            {
                menu_item_id: 10,
                name: 'Item 10 extra',
                quantity: 3,
                unit_price: 20,
                vat_rate: 0,
            },
            {
                menu_item_id: 30,
                name: 'Item 30 zero',
                quantity: 0,
                unit_price: 10,
                vat_rate: 0,
            },
            {
                menu_item_id: 30,
                name: 'Item 30 negative',
                quantity: -1,
                unit_price: 10,
                vat_rate: 0,
            },
        ];
        const map = aggregateCartQuantities(cart);
        assert.equal(map.get(10), 5);
        assert.equal(map.get(20), 1);
        assert.equal(map.has(30), false);
    });

    it('returns empty map for empty cart', () => {
        const map = aggregateCartQuantities([]);
        assert.equal(map.size, 0);
    });
});
