# Paid Products Top-K Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank paid invoice lines by durable product identity with a bounded min-heap, replacing the name-grouped dashboard top-five.

**Architecture:** New `PaidProductRankingService::rank()` scans invoice lines in ID chunks under one consistent read snapshot, aggregates net quantities in a HashMap keyed by numeric `menu_item_id`, then selects Top-K with a size-K min-heap. `DashboardService::topProducts` delegates and caches; the controller validates `top_k ∈ {5,10,20}`; the dashboard renders the selector and coverage note.

**Tech Stack:** PHP 8.3, Laravel 13, Eloquent/Query Builder, Pest, TypeScript React 19, dashboard cache tags.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-16-paid-products-top-k-design.md`.
- Source = issued real invoices with non-null/nonempty `payment_method`; exclude `synthetic_dataset_id`; filter on `invoices.issued_at` half-open `[startOfFirstDay, startOfDayAfterLastDay)` in reporting timezone. Never invent `invoices.status = paid`.
- Aggregation key is numeric `invoice_lines.menu_item_id`; label = latest `name_snapshot` by `(issued_at, invoice_line_id)` desc, fallback `Món #<id>`. NULL IDs excluded with `unidentified_line_count` + `unidentified_net_quantity`; never group NULLs by name or guess identity.
- Net per line = `quantity - refunded_qty` (`refunded_qty` authoritative; null legacy = 0 documented; amount-only refunds never reduce units; `refund_basis: invoice_line_refunded_qty` in metadata). Invalid (negative qty or refund > qty) excluded + counted in `invalid_line_count`, never clamped into ranking. Zero-net omitted.
- Heap root = worst retained (smaller count, then larger numeric ID); final order count desc, ID asc; compare IDs numerically, never lexicographically.
- Memory: HashMap O(P + chunk), heap O(K); chunk size 1,000 by ascending `invoice_lines.id`; never offset-page joins or load all models.
- Cache key includes source version + normalized range + timezone + K + source revision; TTL 300s, `dashboard` tag; checkout/refund/import invalidate after commit and advance revision; stale-revision fills never served as new.
- Before editing any symbol: GitNexus `impact({target, direction: "upstream"})`, report blast radius; warn on HIGH/CRITICAL.
- Before committing (only when explicitly requested): `detect_changes()` + status/diff/diff-check; stage only intended files.
- PHP tests on sqlite `:memory:` only; full `php artisan test` required (PHP changes); PHPStan per `phpstan.neon`.
- Frontend: `node --test` if touched, `npm run types:check`, ESLint, `npm run build`. No emojis; Lucide only.

---

## File Structure

- Create `app/Services/Manager/PaidProductRankingService.php` — `rank(Carbon $startInclusive, Carbon $endExclusive, int $k): array` returning `{items, metadata}`.
- Modify `app/Services/Manager/DashboardService.php::topProducts` — delegate to the new service; keep `analytics.top_products` item shape; add `analytics.top_products_meta`.
- Modify dashboard controller (the controller supplying `analytics.top_products` and date ranges `today|yesterday|last_7_days|this_month`) — validate `top_k`, forward selection + filters.
- Modify `resources/js/pages/manager/dashboard/DashboardManager.tsx` (+ optional extracted card under `components/`) — K selector 5/10/20, quantities, stable row IDs, coverage help, refresh/error/empty states.
- Create `tests/Feature/Manager/PaidProductRankingTest.php` — oracle + fixture matrix.
- Create `tests/Feature/Manager/PaidProductRankingCacheTest.php` — cache/invalidation/refresh tests.
- Create benchmark script (e.g. `app/Console/Commands/BenchmarkTopK.php` or standalone seeder-driven run, removed or clearly marked non-production) — seeded reproducible measurement.

---

### Task 1: Ranking service (scan + HashMap + min-heap)

**Files:**
- Create: `app/Services/Manager/PaidProductRankingService.php`
- Test: `tests/Feature/Manager/PaidProductRankingTest.php`

**Interfaces:**
- Consumes: `invoice_lines` joined to eligible `invoices`.
- Produces: `rank(Carbon $startInclusive, Carbon $endExclusive, int $k): array{items: array<int, array{product_id: int, name: string, sales_count: int}>, metadata: array{source: string, refund_basis: string, unidentified_line_count: int, unidentified_net_quantity: int, invalid_line_count: int, generated_at: string}}` with `source = paid_invoice_lines_net_v1`.

- [ ] **Step 1: Write the failing oracle test**

```php
use App\Models\Invoice;
use App\Models\InvoiceLine;

it('ranks by stable product id with refund and tie rules', function () {
    $a = posMenuItem(['name' => 'Chung']); $b = posMenuItem(['name' => 'Chung']);
    $invoice = Invoice::create(['invoice_code' => 'INV-'.uniqid(), 'payment_method' => 'cash', 'issued_at' => now(), 'total_amount' => 80000]);
    InvoiceLine::create(['invoice_id' => $invoice->id, 'menu_item_id' => $a->id, 'name_snapshot' => 'Chung', 'quantity' => 5, 'unit_price' => 10000, 'subtotal' => 50000, 'refunded_qty' => 2]);
    InvoiceLine::create(['invoice_id' => $invoice->id, 'menu_item_id' => $b->id, 'name_snapshot' => 'Chung', 'quantity' => 3, 'unit_price' => 10000, 'subtotal' => 30000, 'refunded_qty' => 0]);
    $result = app(\App\Services\Manager\PaidProductRankingService::class)->rank(now()->startOfDay(), now()->addDay()->startOfDay(), 5);
    // net: A=3, B=3 -> tie broken by smaller id first; separate rows despite same name
    expect($result['items'][0]['product_id'])->toBe(min($a->id, $b->id));
    expect($result['metadata']['refund_basis'])->toBe('invoice_line_refunded_qty');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test tests/Feature/Manager/PaidProductRankingTest.php`
Expected: FAIL with "Class App\Services\Manager\PaidProductRankingService not found".

- [ ] **Step 3: Write minimal implementation**

Open a read snapshot on one connection; chunk `invoice_lines.id` ascending (1,000/chunk, explicit cursor alias) joined to invoices filtered by non-null/nonempty `payment_method`, null synthetic, `issued_at` in range. Per valid numeric-ID line compute `net = quantity - (refunded_qty ?? 0)`; skip NULL IDs (count coverage), invalid, and zero-net; accumulate `HashMap[id] = {count, latestKey, label}` with label from max `(issued_at, line_id)`. Then bounded min-heap of size K with worst-root rule (smaller count, then larger ID); final sort count desc, ID asc. Wrap `rank()` in the service with `@param`/`@return array{...}` DocBlocks (Larastan rule 14).

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test tests/Feature/Manager/PaidProductRankingTest.php`
Expected: PASS.

- [ ] **Step 5: Static analysis**

Run: `composer types:check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Manager/PaidProductRankingService.php tests/Feature/Manager/PaidProductRankingTest.php
git commit -m "feat(dashboard): add paid product ranking service"
```

---

### Task 2: Delegation + K validation + cache revision

**Files:**
- Modify: `app/Services/Manager/DashboardService.php`
- Modify: dashboard controller supplying `analytics.top_products`
- Test: `tests/Feature/Manager/PaidProductRankingCacheTest.php`

**Interfaces:**
- Consumes: `PaidProductRankingService::rank()` from Task 1.
- Produces: `topProducts($start, $end, $k)` delegation; controller accepts `top_k` absent → 5, `∈ {5,10,20}` → use, else 422; response adds `analytics.top_products_meta` and echoes selected K in filters.

- [ ] **Step 1: Write the failing cache test**

```php
use App\Models\Invoice;
use App\Models\InvoiceLine;

it('separates cache by date, source revision and K', function () {
    $item = posMenuItem();
    $invoice = Invoice::create(['invoice_code' => 'INV-'.uniqid(), 'payment_method' => 'cash', 'issued_at' => now(), 'total_amount' => 20000]);
    $line = InvoiceLine::create(['invoice_id' => $invoice->id, 'menu_item_id' => $item->id, 'name_snapshot' => $item->name, 'quantity' => 4, 'unit_price' => 20000, 'subtotal' => 80000, 'refunded_qty' => 0]);
    $this->actingAs(posAdmin())->get('/?top_k=5')->assertOk()
        ->assertInertia(fn ($page) => $page->where('analytics.top_products.0.sales_count', 4));
    $line->update(['refunded_qty' => 1]); // committed refund must bump source revision + flush dashboard cache
    $this->actingAs(posAdmin())->get('/?top_k=5')->assertOk()
        ->assertInertia(fn ($page) => $page->where('analytics.top_products.0.sales_count', 3));
});

it('rejects invalid K', function () {
    $this->actingAs(posAdmin())->get('/?top_k=7')->assertStatus(422);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test tests/Feature/Manager/PaidProductRankingCacheTest.php`
Expected: FAIL (service/controller delegation missing).

- [ ] **Step 3: Write minimal implementation**

`DashboardService::topProducts` keeps its signature plus `$k = 5`, delegates aggregation to the service, caches the full `{items, metadata}` under key `{source_version, start, end, tz, k, revision}` TTL 300 with `dashboard` tag and loader fallback. Transactional checkout/refund/import paths that touch invoice lines advance a `dashboard_source_revisions` counter (or equivalent existing revision mechanism) after commit and flush the `dashboard` tag; a fill computed under an old revision is never written as the new revision. Controller validates `top_k` strictly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test tests/Feature/Manager/PaidProductRankingCacheTest.php tests/Feature/Manager/PaidProductRankingTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Manager/DashboardService.php app/Http/Controllers/Manager/DashboardController.php tests/Feature/Manager/PaidProductRankingCacheTest.php
git commit -m "feat(dashboard): wire top-k selection and cache revision"
```

> Verify the actual dashboard controller filename/class before staging; adjust the path if it differs.

---

### Task 3: Dashboard UI + benchmark + docs

**Files:**
- Modify: `resources/js/pages/manager/dashboard/DashboardManager.tsx` (+ optional `components/TopProductsCard.tsx`)
- Create: benchmark runner (seed 20261016)
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md` (dashboard section only)

**Interfaces:**
- Consumes: `analytics.top_products`, `analytics.top_products_meta`, selected `top_k` from Task 2.
- Produces: K selector (5/10/20), stable row keys by numeric product ID (decimal-string if beyond safe integer), coverage note, refresh/error/empty states; benchmark table.

- [ ] **Step 1: Wire the selector**

K selector issues a matching-data request for the chosen date + K; keep the prior card while loading with a visible pending state; replace only with the latest matching response (guard out-of-order responses by request sequence); show retry on error (never render failure as zero sales); empty result renders the empty state distinctly from error.

- [ ] **Step 2: Run the benchmark**

Seed 20261016; L = 10,000/100,000/1,000,000 with P = 100/1,000/10,000 (P ≤ L), K = 5/10/20, uniform + skewed counts, duplicate names, refunds. Record PHP/DB versions, hardware, dataset hash, chunk size, 3 warmups + median/p95 of 10 runs. Separate DB fetch, map aggregation, heap selection, final K ordering, total cold request, warm cache, peak memory. Compare heap vs full-sort oracle on the identical aggregated map; report end-to-end too; no universal speedup claim.

- [ ] **Step 3: Verify**

Run: `php artisan test tests/Feature/Manager/PaidProductRankingTest.php tests/Feature/Manager/PaidProductRankingCacheTest.php`
Expected: PASS.

Run: `npm run types:check`
Expected: PASS.

Run: `npx eslint resources/js/pages/manager/dashboard/DashboardManager.tsx`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/manager/dashboard/DashboardManager.tsx docs/PROJECT_CONTEXT_AND_ROUTING.md
git commit -m "feat(dashboard): add top-k selector and ranking docs"
```

---

## Self-Review

- Spec coverage: settled-source rule + synthetic exclusion (Tasks 1–2), numeric-ID identity + latest-label + NULL/invalid/zero-net policies (Task 1), chunked consistent snapshot (Task 1), worst-root heap + numeric tie order (Task 1), delegation + K validation + revisioned cache (Task 2), selector/refresh/error/empty + out-of-order guard (Task 3), oracle + fixture matrix + seeded phase benchmark (Tasks 1–3).
- Placeholder scan: no TBD/TODO; every step has concrete code/commands.
- Type consistency: `rank(startInclusive, endExclusive, k)`, `{items, metadata}`, `source = paid_invoice_lines_net_v1`, `refund_basis = invoice_line_refunded_qty` stable across tasks.
