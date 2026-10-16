# Paid products Top-K

Date: 2026-10-16. Status: approved design sections; written specification awaiting user review. Design only.

## Goal and source evidence

Replace existing dashboard name-grouped top-five calculation with chunked paid-invoice-line aggregation by durable product identity and bounded min-heap selection. Default K=5, choices 5/10/20, within existing dashboard card/date filter. Metric is net sold quantity, not revenue. No new analytics page, demand forecast, or refund reconstruction from monetary amounts.

`app/Services/Manager/DashboardService.php::topProducts` currently joins invoice lines to invoices, excludes `synthetic_dataset_id`, filters `issued_at`, groups by `name_snapshot`, and returns five rows. `DashboardController.php` supplies existing `analytics.top_products` and date ranges (`today`, `yesterday`, `last_7_days`, `this_month`). Frontend is `resources/js/pages/manager/dashboard/DashboardManager.tsx`.

`app/Models/Invoice.php` has `issued_at` and `payment_method`, no invoice payment-status column. `app/Services/Checkout/CheckoutService.php` creates issued invoices during settlement and records payment method (including `mixed`). Use issued real invoices with non-null/nonempty payment method as settled source; do not invent `invoices.status = paid`, depend on current order status, or require positive cash payment for zero-total/deposit-funded settlements.

Migration `2026_08_10_000006_create_payment_core_tables.php` defines nullable unsigned `invoice_lines.menu_item_id` and `order_item_id` without product FK, plus historical `name_snapshot` and integer quantity. `MenuItem` uses soft deletes. Migration `2026_09_04_000006_add_refunded_qty_to_invoice_lines.php` adds integer `refunded_qty` default 0. `RefundController::store` validates per-line refund quantities and increments this field transactionally; negative `payments` rows carry invoice ID and amount, not line-quantity links. Its audit items include line ID/qty, but aggregating duplicated per-order audit events would risk double counting. `refunded_qty` is authoritative evidence; no audit replay is needed.

## Source contract and identity policy

Read invoice lines joined to eligible invoices. Date range uses store/application reporting timezone, inclusive calendar days represented as half-open `[startOfFirstDay, startOfDayAfterLastDay)` converted consistently to database timestamps. Filter on invoice `issued_at`, not order creation, payment/refund time, or line update time. Current cumulative item refunds reduce quantity for invoices issued in selected range even when refund occurred later; label metric as current net quantity for that issuance period, not historical as-of reporting.

Stable aggregation key is numeric `invoice_lines.menu_item_id`. Same name with different IDs stays separate; renamed product with same ID aggregates. Retained ID remains valid even when live/soft-deleted product cannot be joined. Do not inner-join current menu or exclude deleted items. Label comes from `name_snapshot` of most recent eligible invoice line for ID, using `(issued_at, invoice_line_id)` descending; if empty use `Món #<id>`. Label reflects invoice history, not current renamed menu.

NULL product ID cannot honestly identify product. Exclude those rows from product ranking, return `unidentified_line_count` and `unidentified_net_quantity`, and display coverage note when nonzero. Do not group NULL rows by name, map them to one fake product, or guess via mutable order-item links. Deleted product with retained ID is included; deleted product whose ID was never retained follows NULL policy. No data backfill inventing identity.

Per valid line, net quantity is `quantity - refunded_qty`, with 0 <= refunded_qty <= quantity. Legacy null refund value, if encountered, counts as zero documented quantity evidence. Amount-only historical refunds do not reduce units; report explanatory metadata `refund_basis: invoice_line_refunded_qty`, and display help text explaining such refunds are not inferred. Zero-net products are omitted. Invalid negative quantity or refund exceeding quantity is excluded and counted in `invalid_line_count` with server diagnostic, rather than manufacturing a negative ranking or silently clamping. Coverage counters use same date/source filter.

## Architecture, files, and interfaces

Proposed `app/Services/Manager/PaidProductRankingService.php` owns source scan, HashMap aggregation and bounded heap. Existing `DashboardService::topProducts` delegates and uses dashboard tagged cache; controller validates `top_k` as one of 5/10/20 (absent=5, invalid=422) and adds selection to filters. Existing dashboard renders selector, quantity, stable row ID and coverage help. Any extracted card stays under `resources/js/pages/manager/dashboard/components/`.

`rank(startInclusive, endExclusive, k)` returns `{items: [{product_id, name, sales_count}], metadata: {source, refund_basis, unidentified_line_count, unidentified_net_quantity, invalid_line_count, generated_at}}`. `source` is versioned constant `paid_invoice_lines_net_v1`. Keep `analytics.top_products` as item array for existing UI shape and add `analytics.top_products_meta`; controller forwards selected K. Existing dashboard authorization remains `dashboard.view`.

Scan selected columns in chunks of 1,000 by qualified ascending `invoice_lines.id` with explicit alias for chunk cursor; never offset-page joined data or load all line models. Execute scan in consistent read snapshot on one connection so concurrent refund/checkout cannot mix source versions between chunks. Finish DB read transaction before cache write. HashMap holds one `{count, latestLabelKey, label}` per identified product and coverage counters. Numeric product IDs remain exact backend integers and frontend IDs must use decimal strings if beyond JavaScript safe integer range; compare ties numerically in backend, never lexicographic decimal order.

After complete aggregation, feed each positive-count product into size-K min-heap. Root is worst retained candidate: smaller count first, then larger numeric product ID first. Better candidate has larger count or equal count and smaller ID. Final selected K rows are sorted count descending, product ID ascending. This inverse heap tie rule is required to match final-order oracle. Return fewer than K rows when fewer eligible products exist; empty result is valid and distinct from error.

For L scanned lines and P identified products: expected HashMap aggregation O(L), memory O(P + chunk size); heap selection O(P log K), heap memory O(K); final order O(K log K). Database scan/transfer remains O(L); chunking does not make total memory O(K), because HashMap retains P products. No SQL full-product sort or frontend selection masquerading as backend heap.

## Cache, refresh, and errors

Cache key includes schema/source version, normalized start/end timestamps, reporting timezone, K and dashboard source revision. TTL 300 seconds, existing `dashboard` tag, loader fallback when cache unavailable. Transactional checkout/refund/import or source correction must invalidate ranking after commit and advance source revision; a fill started under old revision must never be served as new revision. Existing refund controller flushes dashboard cache; revision addition must cover same successful write paths. Label changes in current menu do not alter historical snapshot labels and need no invalidation.

Changing date/K requests matching data. Explicit dashboard refresh bypasses cached ranking and obtains fresh revision. Keep prior card while loading, visibly mark pending refresh, replace only with latest matching date/K response; stale responses cannot overwrite new selection. Error displays retry state, never represents failure as zero sales. Read-snapshot/database failure aborts result/cache publication; log diagnostic and return existing application error handling. Revision unavailable means bypass cache, not guess freshness.

## Verification and acceptance

Backend tests compare ranking to independently aggregated full-sort oracle for every K. Fixtures cover same name/different IDs; renamed same ID; deleted product retained ID; NULL ID coverage; empty name fallback; equal counts at heap boundary; fewer than K; zero net; fully/partly refunded lines; amount-only refund with unchanged units; later refund of earlier-period invoice; synthetic exclusion; missing payment method; zero-value settled invoice; date/timezone/day boundary; multiple chunks; invalid quantities; and concurrent source update during consistent read. Assert label selection independent of chunk order and numeric-ID tie ordering.

Integration tests cover default/allowed/invalid K, date/source/K cache separation, post-commit refund/checkout invalidation, stale cache fill revision, cache failure fallback, refresh/error/empty states, and out-of-order frontend responses. Validate no duplicate rows from joins or refund audit replication.

Reproducible benchmark seed 20261016; L=10,000/100,000/1,000,000, P=100/1,000/10,000 where P<=L, K=5/10/20, uniform and skewed counts, duplicate names and refunds. Record PHP/DB versions, hardware, dataset hash, chunk size, 3 warmups and median/p95 of 10 measured runs. Separate DB fetch, map aggregation, heap selection, final K ordering, total cold request, warm cache and peak memory. Compare heap against full-sort oracle using identical already-aggregated map, also report end-to-end costs; do not hide shared scan/map cost or promise heap wins at every size.

Acceptance requires exact oracle output/ties, truthful identity/refund coverage, bounded chunk fetch, O(P) map plus O(K) heap memory profile, and reproducible phase measurements. No fabricated historical refund quantities or identities.

## Dependencies

Uses existing invoice/refund schema without new product identity linkage. Source-revision invalidation requires coordinated checkout/refund/import integration; consistent snapshot capability is required for chunk scan. Independent of POS menu/Undo and kitchen schema. Future implementation must run symbol impact analysis before editing existing code.
