import type { CartItem, POSProductData } from '../types/pos.types';

export type { CartItem, POSProductData };

export interface IndexedEntry {
    product: POSProductData;
    originalIndex: number;
    normalizedName: string;
    priceMinor: number;
}

export interface MenuIndex {
    entries: IndexedEntry[];
    productById: Map<number, POSProductData>;
    priceIndex: IndexedEntry[];
}

export function normalizeName(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

export function mergeSortStable<T>(
    arr: readonly T[],
    cmp: (a: T, b: T) => number,
): T[] {
    const a = arr.slice();

    if (a.length <= 1) {
        return a;
    }

    const mid = Math.floor(a.length / 2);
    const left = mergeSortStable(a.slice(0, mid), cmp);
    const right = mergeSortStable(a.slice(mid), cmp);
    const out: T[] = [];
    let i = 0;
    let j = 0;

    while (i < left.length && j < right.length) {
        if (cmp(left[i], right[j]) <= 0) {
            out.push(left[i++]);
        } else {
            out.push(right[j++]);
        }
    }

    while (i < left.length) {
        out.push(left[i++]);
    }

    while (j < right.length) {
        out.push(right[j++]);
    }

    return out;
}

function toPriceMinor(price: unknown): number | null {
    const num =
        typeof price === 'number'
            ? price
            : typeof price === 'string' && price.trim() !== ''
              ? Number(price)
              : NaN;

    if (!Number.isFinite(num) || num < 0) {
        return null;
    }

    const minor = Math.round(num * 100);

    if (!Number.isSafeInteger(minor) || minor < 0) {
        return null;
    }

    return minor;
}

export function buildMenuIndex(products: readonly POSProductData[]): MenuIndex {
    const seen = new Set<number>();
    const entries: IndexedEntry[] = products.map((product, originalIndex) => {
        if (seen.has(product.id)) {
            throw new Error(`duplicate product id ${product.id}`);
        }

        seen.add(product.id);
        const priceMinor = toPriceMinor(product.price);

        if (priceMinor === null) {
            throw new Error(`invalid price for product ${product.id}`);
        }

        return {
            product,
            originalIndex,
            normalizedName: normalizeName(product.name),
            priceMinor,
        };
    });
    const priceIndex = mergeSortStable(
        entries,
        (a, b) =>
            a.priceMinor - b.priceMinor || a.originalIndex - b.originalIndex,
    );

    return {
        entries,
        productById: new Map(entries.map((e) => [e.product.id, e.product])),
        priceIndex,
    };
}

export type SortMode =
    'original' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

export interface MenuQuery {
    name: string;
    categoryId: string;
    minMinor: number | null;
    maxMinor: number | null;
    sort: SortMode;
}

export type PriceRangeResult =
    | { ok: true; minMinor: number | null; maxMinor: number | null }
    | { ok: false; field: 'min' | 'max' | 'range'; message: string };

const PRICE_RE = /^\d+(\.\d{1,2})?$/;

function parseEndpoint(raw: string): {
    empty: boolean;
    minor?: number;
    error?: string;
} {
    const t = raw.trim();

    if (t === '') {
        return { empty: true };
    }

    if (!PRICE_RE.test(t)) {
        return {
            empty: false,
            error: 'Chỉ nhập số, tối đa 2 số lẻ (ví dụ 30 hoặc 30.50).',
        };
    }

    const minor = Math.round(Number(t) * 100);

    if (!Number.isSafeInteger(minor) || minor < 0) {
        return { empty: false, error: 'Giá không hợp lệ.' };
    }

    return { empty: false, minor };
}

export function parsePriceRange(
    minText: string,
    maxText: string,
): PriceRangeResult {
    const lo = parseEndpoint(minText);
    const hi = parseEndpoint(maxText);

    if (!lo.empty && lo.error) {
        return { ok: false, field: 'min', message: lo.error };
    }

    if (!hi.empty && hi.error) {
        return { ok: false, field: 'max', message: hi.error };
    }

    const minMinor = lo.empty ? null : (lo.minor as number);
    const maxMinor = hi.empty ? null : (hi.minor as number);

    if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) {
        return {
            ok: false,
            field: 'range',
            message: 'Giá tối thiểu đang lớn hơn giá tối đa.',
        };
    }

    return { ok: true, minMinor, maxMinor };
}

function lowerBoundPrice(idx: IndexedEntry[], target: number): number {
    let lo = 0;
    let hi = idx.length;

    while (lo < hi) {
        const mid = (lo + hi) >> 1;

        if (idx[mid].priceMinor < target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

function upperBoundPrice(idx: IndexedEntry[], target: number): number {
    let lo = 0;
    let hi = idx.length;

    while (lo < hi) {
        const mid = (lo + hi) >> 1;

        if (idx[mid].priceMinor <= target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }

    return lo;
}

export function queryMenu(index: MenuIndex, q: MenuQuery): POSProductData[] {
    const start =
        q.minMinor === null ? 0 : lowerBoundPrice(index.priceIndex, q.minMinor);
    const end =
        q.maxMinor === null
            ? index.priceIndex.length
            : upperBoundPrice(index.priceIndex, q.maxMinor);

    const inRange = new Set<number>();

    for (let i = start; i < end; i++) {
        inRange.add(index.priceIndex[i].product.id);
    }

    const needle = normalizeName(q.name);
    // ponytail: O(N) scan over index.entries filtered by price inRange set, fast enough for POS menus (< 10k items)
    const survivors: IndexedEntry[] = [];

    for (const e of index.entries) {
        if (!inRange.has(e.product.id)) {
            continue;
        }

        if (
            q.categoryId !== 'all' &&
            String(e.product.category_id) !== q.categoryId
        ) {
            continue;
        }

        if (needle !== '' && !e.normalizedName.includes(needle)) {
            continue;
        }

        survivors.push(e);
    }

    if (q.sort === 'original') {
        return survivors.map((e) => e.product);
    }

    const cmp = (a: IndexedEntry, b: IndexedEntry): number => {
        if (q.sort === 'name-asc' || q.sort === 'name-desc') {
            const c =
                a.normalizedName < b.normalizedName
                    ? -1
                    : a.normalizedName > b.normalizedName
                      ? 1
                      : 0;
            const d = q.sort === 'name-asc' ? c : -c;

            return d !== 0 ? d : a.originalIndex - b.originalIndex;
        }

        const c = a.priceMinor - b.priceMinor;
        const d = q.sort === 'price-asc' ? c : -c;

        return d !== 0 ? d : a.originalIndex - b.originalIndex;
    };

    return mergeSortStable(survivors, cmp).map((e) => e.product);
}

export function aggregateCartQuantities(
    cart: readonly CartItem[],
): Map<number, number> {
    const map = new Map<number, number>();

    for (const row of cart) {
        if (!row || row.quantity <= 0) {
            continue;
        }

        map.set(
            row.menu_item_id,
            (map.get(row.menu_item_id) ?? 0) + row.quantity,
        );
    }

    return map;
}
