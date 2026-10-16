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
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        return null;
    }

    const minor = Math.round(price * 100);

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
