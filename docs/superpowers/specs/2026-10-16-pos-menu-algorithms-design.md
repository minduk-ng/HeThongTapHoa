# POS menu algorithms

Date: 2026-10-16. Status: approved design sections; written specification awaiting user review. Design only.

## Goal and boundaries

Add normalized linear name search, inclusive binary price-range search, stable MergeSort ordering, and ID-based lookup/quantity maps to existing POS menu. Keep category filtering. Default order is original product payload order. Price means `POSProductData.price`, the list/display price, never promotion-adjusted cart price. No backend search, fuzzy matching, pricing changes, cart-line consolidation, or new dependencies.

## Source grounding and files

- `resources/js/pages/staff/pos/components/POSMenuTab.tsx` currently filters category/name with lowercase substring matching and rescans cart for each product badge.
- `resources/js/pages/staff/pos/types/pos.types.ts` defines product ID, name, price, category, availability, and `max_servings`; cart rows can share product ID while differing in confirmation, note, price, or order item.
- `resources/js/pages/staff/pos/hooks/usePOSCart.ts` owns cart mutations; `POSManager.tsx` passes menu/cart props.
- `app/Http/Controllers/Staff/POSController.php::loadProductsPayload` supplies available products and stock-derived serving limits. Existing server validation remains authoritative.
- Proposed pure module: `resources/js/pages/staff/pos/utils/menuAlgorithms.ts`; proposed memoization adapter: `hooks/usePOSMenuIndex.ts`. Existing menu owns filter controls and renders results/errors. Cart hook consumes ID lookup where appropriate, without changing row identity.

## Data and interfaces

`buildMenuIndex(products)` returns immutable indexed entries `{product, originalIndex, normalizedName, priceMinor}`, `productById: Map<number, POSProductData>`, and ascending `priceIndex`. Build price index using stable MergeSort. Monetary comparisons use integer hundredths derived consistently from decimal list prices; display uses existing currency formatting. Non-finite/negative source prices and duplicate IDs are payload errors: reject index replacement, retain last valid index, show refresh error; first-load failure shows no actionable products.

`normalizeName(text)` applies Unicode NFD, removes combining marks, maps `đ/Đ` to `d`, lowercases, trims, and collapses whitespace. Apply same function to names and query. Search is contiguous substring matching, not token reordering. Empty normalized query matches all names. Name sort compares normalized keys lexicographically; normalization-equivalent names are equal keys.

`parsePriceRange(minText, maxText)` returns valid integer-minor-unit bounds or field errors. Blank/whitespace endpoint is unbounded. Nonblank input accepts unsigned decimal digits with optional dot and one/two fractional digits; reject signs, separators, exponent notation, non-finite values, unsafe integer conversion, negative values, and min greater than max. Labels explain accepted format. Equal endpoints are valid. Invalid input shows field error and suspends result replacement, explicitly marking previous results as last valid filter; initial invalid state shows no results. Never silently swap or clamp bounds.

`queryMenu(index, {name, categoryId, bounds, sort})` returns a new array; sort enum is `original | name-asc | name-desc | price-asc | price-desc`. Find first price greater than or equal to minimum and first price greater than maximum in ascending index; slice between bounds. Unbounded endpoints use array limits. Build candidate ID membership, then traverse original entries to apply category and linear normalized-name predicates. This restores original tie order before optional final stable MergeSort. Descending uses reversed comparison, never array reversal, so equal keys remain stable. Original mode returns surviving entries in original payload order.

`aggregateCartQuantities(cart)` returns `Map<productId, totalQuantity>` for positive live row quantities across draft and confirmed rows, matching current badges. Build in one pass per cart revision. This map is display-only. `productById` supports lookups; neither map is a cart store. Mutation must address an existing line identity, preserving separate notes, prices, confirmation states, and order-item IDs.

## Lifecycle, UI, and complexity

Menu adds min/max price fields, sort selector, reset, and empty-state/error messages. Reset clears name/category/range and selects original order. Existing availability indicators and add controls remain based on latest product data.

Memoize index by product payload revision/reference with immutable upstream updates. Rebuild atomically on product insert/delete/name/price/category/availability refresh; never reuse a stale object map after replacement. Cart map rebuild depends only on cart revision. Query/filter changes do not rebuild price index. A failed refresh preserves prior display but disables product actions until valid fresh data arrives. Availability remains revalidated by cart mutations and server.

For n products, c cart rows, r results: index build O(n log n), O(n) auxiliary memory; cart aggregation O(c), lookup expected O(1); binary bounds O(log n), slice O(r) before other predicates; complete query includes O(n) original-order/name filtering and optional O(r log r) final ordering. Do not claim complete query is O(log n).

## Verification and acceptance

Pure tests cover Vietnamese composed/decomposed accents, `đ/Đ`, case/whitespace, empty and missing matches; zero/equal/blank endpoints; exact inclusive duplicates; bounds outside data; invalid negative/reversed/NaN/precision inputs; empty/singleton arrays; stable equal keys in both directions; no mutation of frozen inputs; default original order after filtering. Compare binary result membership to linear range oracle. Refresh tests replace product names, prices, availability and IDs, proving no stale lookup/index. Cart tests use multiple same-product rows with different notes/prices/statuses and prove badges aggregate without merging or changing rows.

Benchmark seeded fixtures (seed 20261016), sizes 100/1,000/10,000, duplicate-heavy prices and Vietnamese names. Record runtime/browser/hardware, 5 warmups and median/p95 of 30 runs. Report normalization/map build, MergeSort index build, binary bounds alone, complete query, final sort, and cart aggregation separately. Compare repeated queries against linear range filtering on identical immutable inputs, including index amortization; no assumed speedup or machine-independent millisecond gate. Acceptance requires oracle equality, stable output, correct refresh, and measured costs with stated n/r/c.

## Dependencies

Independent of kitchen and dashboard specs. Shares cart line-identity rules with draft Undo spec. No schema changes required. Future implementation must run symbol impact analysis before editing existing symbols.
