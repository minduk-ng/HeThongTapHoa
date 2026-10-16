# POS Menu Algorithms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add normalized linear name search, inclusive binary price-range search, stable MergeSort ordering, and ID-based lookup maps to the POS menu.

**Architecture:** New pure module `menuAlgorithms.ts` owns all algorithm logic with zero React imports; a small memoization hook builds the index once per product payload revision. `POSMenuTab` owns filter UI and renders results; cart code consumes the lookup map read-only.

**Tech Stack:** TypeScript, React 19, `node:test` + `node:assert/strict`, Vite build, ESLint.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-16-pos-menu-algorithms-design.md` — all task requirements implicitly include it.
- Price means `POSProductData.price` (list/display price), never promotion-adjusted cart price.
- Default order is original product payload order; never reorder payload itself.
- No backend search, no fuzzy matching, no pricing changes, no cart-line consolidation, no new dependencies.
- `POSProductData` has `id`, `category_id`, `name`, `price`, `is_available`, `max_servings`; no product `code` field exists — ID map is the lookup contract.
- Cart rows may share `menu_item_id` while differing in note/price/confirmation/order-item — maps are display/lookup only, never a cart store.
- Before editing any symbol: GitNexus `impact({target, direction: "upstream"})`, report blast radius; warn on HIGH/CRITICAL before proceeding.
- Before committing (only when explicitly requested): `detect_changes()`, `git status`, `git diff`, `git diff --check`; stage only intended files.
- Frontend tests run with `node --test`; typecheck `npm run types:check`; lint `npx eslint <files>`; build `npm run build`.
- No emojis in UI; Lucide icons only.

---

## File Structure

- Create `resources/js/pages/staff/pos/utils/menuAlgorithms.ts` — pure functions: `normalizeName`, `mergeSortStable`, `buildMenuIndex`, `parsePriceRange`, `lowerBoundPrice`, `upperBoundPrice`, `queryMenu`, `aggregateCartQuantities`. No React imports.
- Create `resources/js/pages/staff/pos/hooks/usePOSMenuIndex.ts` — memoizes `buildMenuIndex(products)` by payload reference/revision; returns `{ index, indexError }`.
- Create `resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts` — `node:test` suite covering every spec case.
- Create `resources/js/pages/staff/pos/utils/menuAlgorithms.bench.ts` — seeded benchmark script (seed 20261016), run via `node --test` or `tsx`; reports per-phase timings, no pass/fail gate on milliseconds.
- Modify `resources/js/pages/staff/pos/components/POSMenuTab.tsx` — add min/max price fields, sort selector, reset, error/empty states; replace inline filter and per-product cart scans with index + cart map.
- Modify `resources/js/pages/staff/pos/hooks/usePOSCart.ts` — use `productById` for lookups where it currently calls `products.find()`; no behavior change.

---

### Task 1: Pure algorithm module (normalize + stable MergeSort + index builder)

**Files:**
- Create: `resources/js/pages/staff/pos/utils/menuAlgorithms.ts`
- Test: `resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`

**Interfaces:**
- Consumes: `POSProductData`, `CartItem` types from `../types/pos.types`.
- Produces: `normalizeName(text: string): string`; `mergeSortStable<T>(arr: readonly T[], cmp: (a: T, b: T) => number): T[]`; `buildMenuIndex(products: readonly POSProductData[]): MenuIndex`; `MenuIndex { entries, productById: Map<number, POSProductData>, priceIndex: IndexedEntry[] }`; `IndexedEntry { product, originalIndex, normalizedName, priceMinor }`.

- [ ] **Step 1: Write the failing test for normalize + MergeSort stability**

```ts
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { normalizeName, mergeSortStable } from './menuAlgorithms.ts';

describe('normalizeName', () => {
    it('folds Vietnamese accents, đ, case and whitespace identically', () => {
        assert.equal(normalizeName('  CÀ  PHÊ '), normalizeName('ca phe'));
        assert.equal(normalizeName('Đường'), normalizeName('duong'));
        assert.equal(normalizeName('Cà\u0300 phê'), normalizeName('cà phê'));
    });
});

describe('mergeSortStable', () => {
    it('keeps original order for equal keys and does not mutate input', () => {
        const input = Object.freeze([{ k: 1, i: 0 }, { k: 1, i: 1 }, { k: 0, i: 2 }]);
        const out = mergeSortStable(input, (a, b) => a.k - b.k);
        assert.deepEqual(out.map((x) => x.i), [2, 0, 1]);
        assert.equal(input.length, 3);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`
Expected: FAIL with "Cannot find module './menuAlgorithms.ts'".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CartItem, POSProductData } from '../types/pos.types';

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

export function mergeSortStable<T>(arr: readonly T[], cmp: (a: T, b: T) => number): T[] {
    const a = arr.slice();
    if (a.length <= 1) return a;
    const mid = Math.floor(a.length / 2);
    const left = mergeSortStable(a.slice(0, mid), cmp);
    const right = mergeSortStable(a.slice(mid), cmp);
    const out: T[] = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
        if (cmp(left[i], right[j]) <= 0) out.push(left[i++]);
        else out.push(right[j++]);
    }
    while (i < left.length) out.push(left[i++]);
    while (j < right.length) out.push(right[j++]);
    return out;
}

function toPriceMinor(price: unknown): number | null {
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
    const minor = Math.round(price * 100);
    if (!Number.isSafeInteger(minor) || minor < 0) return null;
    return minor;
}

export function buildMenuIndex(products: readonly POSProductData[]): MenuIndex {
    const seen = new Set<number>();
    const entries: IndexedEntry[] = products.map((product, originalIndex) => {
        if (seen.has(product.id)) throw new Error(`duplicate product id ${product.id}`);
        seen.add(product.id);
        const priceMinor = toPriceMinor(product.price);
        if (priceMinor === null) throw new Error(`invalid price for product ${product.id}`);
        return { product, originalIndex, normalizedName: normalizeName(product.name), priceMinor };
    });
    const priceIndex = mergeSortStable(entries, (a, b) => a.priceMinor - b.priceMinor || a.originalIndex - b.originalIndex);
    return { entries, productById: new Map(entries.map((e) => [e.product.id, e.product])), priceIndex };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the new module**

Run: `npm run types:check`
Expected: PASS.

---

### Task 2: Price-range parsing + binary bounds + query + cart aggregation

**Files:**
- Modify: `resources/js/pages/staff/pos/utils/menuAlgorithms.ts`
- Test: `resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`

**Interfaces:**
- Consumes: `MenuIndex` from Task 1.
- Produces: `parsePriceRange(minText: string, maxText: string): { ok: true; minMinor: number | null; maxMinor: number | null } | { ok: false; field: 'min' | 'max' | 'range'; message: string }`; `queryMenu(index: MenuIndex, q: MenuQuery): POSProductData[]`; `aggregateCartQuantities(cart: readonly CartItem[]): Map<number, number>`; `MenuQuery { name: string; categoryId: string; minMinor: number | null; maxMinor: number | null; sort: 'original' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' }`.

- [ ] **Step 1: Write the failing test**

```ts
import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { buildMenuIndex, parsePriceRange, queryMenu, aggregateCartQuantities } from './menuAlgorithms.ts';

it('rejects negative and reversed ranges; treats blank as unbounded', () => {
    assert.equal(parsePriceRange('', '').ok, true);
    assert.equal(parsePriceRange('-5', '').ok, false);
    assert.equal(parsePriceRange('60', '30').ok, false);
    const eq = parsePriceRange('30', '30');
    assert.equal(eq.ok && eq.minMinor === eq.maxMinor, true);
});

it('binary range matches linear oracle and stays inclusive on duplicates', () => {
    const products = [
        { id: 1, category_id: 1, name: 'A', price: 30, is_available: true },
        { id: 2, category_id: 1, name: 'B', price: 30, is_available: true },
        { id: 3, category_id: 1, name: 'C', price: 60, is_available: true },
    ];
    const index = buildMenuIndex(products);
    const got = queryMenu(index, { name: '', categoryId: 'all', minMinor: 3000, maxMinor: 3000, sort: 'original' }).map((p) => p.id);
    assert.deepEqual(got, [1, 2]);
});

it('cart map aggregates without merging distinct rows', () => {
    const map = aggregateCartQuantities([
        { menu_item_id: 1, name: 'A', quantity: 2, unit_price: 10, vat_rate: 0, note: 'x' },
        { menu_item_id: 1, name: 'A', quantity: 3, unit_price: 12, vat_rate: 0, note: 'y' },
    ]);
    assert.equal(map.get(1), 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`
Expected: FAIL with "parsePriceRange is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
export type SortMode = 'original' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';
export interface MenuQuery { name: string; categoryId: string; minMinor: number | null; maxMinor: number | null; sort: SortMode }
export type PriceRangeResult =
    | { ok: true; minMinor: number | null; maxMinor: number | null }
    | { ok: false; field: 'min' | 'max' | 'range'; message: string };

const PRICE_RE = /^\d+(\.\d{1,2})?$/;

function parseEndpoint(raw: string): { empty: boolean; minor?: number; error?: string } {
    const t = raw.trim();
    if (t === '') return { empty: true };
    if (!PRICE_RE.test(t)) return { empty: false, error: 'Chỉ nhập số, tối đa 2 số lẻ (ví dụ 30 hoặc 30.50).' };
    const minor = Math.round(Number(t) * 100);
    if (!Number.isSafeInteger(minor) || minor < 0) return { empty: false, error: 'Giá không hợp lệ.' };
    return { empty: false, minor };
}

export function parsePriceRange(minText: string, maxText: string): PriceRangeResult {
    const lo = parseEndpoint(minText);
    const hi = parseEndpoint(maxText);
    if (!lo.empty && lo.error) return { ok: false, field: 'min', message: lo.error };
    if (!hi.empty && hi.error) return { ok: false, field: 'max', message: hi.error };
    const minMinor = lo.empty ? null : (lo.minor as number);
    const maxMinor = hi.empty ? null : (hi.minor as number);
    if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) {
        return { ok: false, field: 'range', message: 'Giá tối thiểu đang lớn hơn giá tối đa.' };
    }
    return { ok: true, minMinor, maxMinor };
}

function lowerBoundPrice(idx: IndexedEntry[], target: number): number {
    let lo = 0;
    let hi = idx.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (idx[mid].priceMinor < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function upperBoundPrice(idx: IndexedEntry[], target: number): number {
    let lo = 0;
    let hi = idx.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (idx[mid].priceMinor <= target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

export function queryMenu(index: MenuIndex, q: MenuQuery): POSProductData[] {
    const start = q.minMinor === null ? 0 : lowerBoundPrice(index.priceIndex, q.minMinor);
    const end = q.maxMinor === null ? index.priceIndex.length : upperBoundPrice(index.priceIndex, q.maxMinor);
    const inRange = new Set<number>();
    for (let i = start; i < end; i++) inRange.add(index.priceIndex[i].product.id);
    const needle = normalizeName(q.name);
    const survivors: IndexedEntry[] = [];
    for (const e of index.entries) {
        if (!inRange.has(e.product.id)) continue;
        if (q.categoryId !== 'all' && String(e.product.category_id) !== q.categoryId) continue;
        if (needle !== '' && !e.normalizedName.includes(needle)) continue;
        survivors.push(e);
    }
    if (q.sort === 'original') return survivors.map((e) => e.product);
    const cmp = (a: IndexedEntry, b: IndexedEntry): number => {
        if (q.sort === 'name-asc' || q.sort === 'name-desc') {
            const c = a.normalizedName < b.normalizedName ? -1 : a.normalizedName > b.normalizedName ? 1 : 0;
            const d = q.sort === 'name-asc' ? c : -c;
            return d !== 0 ? d : a.originalIndex - b.originalIndex;
        }
        const c = a.priceMinor - b.priceMinor;
        const d = q.sort === 'price-asc' ? c : -c;
        return d !== 0 ? d : a.originalIndex - b.originalIndex;
    };
    return mergeSortStable(survivors, cmp).map((e) => e.product);
}

export function aggregateCartQuantities(cart: readonly CartItem[]): Map<number, number> {
    const map = new Map<number, number>();
    for (const row of cart) {
        if (!row || row.quantity <= 0) continue;
        map.set(row.menu_item_id, (map.get(row.menu_item_id) ?? 0) + row.quantity);
    }
    return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/staff/pos/utils/menuAlgorithms.ts resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts
git commit -m "feat(pos): add menu search, range and sort algorithms"
```

> Commit only when the user explicitly authorizes commits.

---

### Task 3: Index hook + POS menu UI wiring

**Files:**
- Create: `resources/js/pages/staff/pos/hooks/usePOSMenuIndex.ts`
- Modify: `resources/js/pages/staff/pos/components/POSMenuTab.tsx:27-48`
- Modify: `resources/js/pages/staff/pos/hooks/usePOSCart.ts` (lookup call sites only)

**Interfaces:**
- Consumes: `buildMenuIndex`, `queryMenu`, `parsePriceRange`, `aggregateCartQuantities` from Task 2.
- Produces: `usePOSMenuIndex(products: readonly POSProductData[]): { index: MenuIndex | null; indexError: string | null }`.

- [ ] **Step 1: Write the hook with failing UI expectation**

```ts
import { useMemo } from 'react';
import { buildMenuIndex, type MenuIndex } from '../utils/menuAlgorithms';
import type { POSProductData } from '../types/pos.types';

export function usePOSMenuIndex(products: readonly POSProductData[]): { index: MenuIndex | null; indexError: string | null } {
    return useMemo(() => {
        try {
            return { index: buildMenuIndex(products), indexError: null };
        } catch (e) {
            return { index: null, indexError: e instanceof Error ? e.message : 'Dữ liệu món ăn không hợp lệ.' };
        }
    }, [products]);
}
```

Wire `POSMenuTab`: add `minPrice`/`maxPrice`/`sortMode` state, `priceError` from `parsePriceRange`, call `queryMenu` only when range is valid, display Vietnamese field error next to the price inputs, `Reset` button clears name/category/range and selects `original`, empty state shows "Không có món phù hợp" on valid-empty and the field error on invalid. Replace `isProductInCart`/`getCartItemQuantity` scans with one `aggregateCartQuantities(cartItems)` memo per cart revision. In `usePOSCart`, replace `products.find((p) => p.id === ...)` with `productById.get(...)` from the index prop or a locally memoized map — no signature change to cart mutations.

- [ ] **Step 2: Typecheck and test**

Run: `npm run types:check`
Expected: PASS.

Run: `node --test resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`
Expected: PASS (pure suite unchanged; UI verified manually/by reviewer).

- [ ] **Step 3: Lint and build**

Run: `npx eslint resources/js/pages/staff/pos/utils/menuAlgorithms.ts resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts resources/js/pages/staff/pos/hooks/usePOSMenuIndex.ts resources/js/pages/staff/pos/components/POSMenuTab.tsx resources/js/pages/staff/pos/hooks/usePOSCart.ts`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/hooks/usePOSMenuIndex.ts resources/js/pages/staff/pos/components/POSMenuTab.tsx resources/js/pages/staff/pos/hooks/usePOSCart.ts
git commit -m "feat(pos): wire menu index, price range and sort UI"
```

---

### Task 4: Benchmark + verification ledger

**Files:**
- Create: `resources/js/pages/staff/pos/utils/menuAlgorithms.bench.ts`
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md` (POS menu section only)

**Interfaces:**
- Consumes: all Task 1–2 functions.
- Produces: benchmark report printed to stdout; no production code.

- [ ] **Step 1: Write the benchmark script**

```ts
// Seeded PRNG (mulberry32, seed 20261016). Sizes 100/1_000/10_000.
// Fixtures: duplicate-heavy prices, Vietnamese names with accents.
// Phases measured separately: normalize+map build, MergeSort index build,
// binary bounds alone, complete query, final sort, cart aggregation.
// 5 warmups + median/p95 of 30 runs per phase; compare repeated queries
// against linear range filtering on identical immutable inputs.
// Print: runtime, sizes n/r/c, op counts, timings. No millisecond gate.
```

- [ ] **Step 2: Run benchmark and record results**

Run: `node --test resources/js/pages/staff/pos/utils/menuAlgorithms.bench.ts`
Expected: prints phase table; attach results to the plan verification note.

- [ ] **Step 3: Update routing doc**

Add one paragraph under the POS section naming `menuAlgorithms.ts`, `usePOSMenuIndex.ts`, contracts (`price = POSProductData.price`, original-order default, invalid-range behavior), and link the spec + plan files.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/utils/menuAlgorithms.bench.ts docs/PROJECT_CONTEXT_AND_ROUTING.md
git commit -m "docs(pos): record menu algorithm benchmarks"
```

---

## Self-Review

- Spec coverage: linear name search (Task 2 query + UI), binary inclusive range (Task 2 bounds), stable MergeSort both directions + no-mutation (Tasks 1–2), ID map + cart aggregate without merging (Tasks 1–3), payload-error + refresh semantics (Tasks 1, 3), benchmark amortization (Task 4). No Quick Sort — spec does not require it.
- Placeholder scan: no TBD/TODO; every step has concrete code/commands.
- Type consistency: `MenuIndex`, `MenuQuery`, `SortMode`, `PriceRangeResult` names match across tasks.
