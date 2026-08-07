# Hiệu năng reports + dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảm rủi ro hiệu năng khi nhiều người dùng truy cập reports/dashboard: thêm index cột date + cache DashboardService (TTL ngắn).

**Architecture:** Migration thêm 4 index (`invoices.issued_at`, `orders.created_at`, `order_items.cancelled_at`, `deposits.created_at`) để `whereBetween` scan theo range. DashboardService bọc từng nhóm query bằng `Cache::tags(['dashboard'])->remember(...)` TTL ngắn (120-300s), không cache liveOperations (real-time), flush tag khi checkout.

**Tech Stack:** Laravel 11, PHP, Pest, SQLite (dev) / MySQL (prod).

**Spec:** `docs/superpowers/specs/2026-08-07-report-performance-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` như lệnh đơn.
- Mỗi task TDD (index test schema; cache test behavior).
- **KHÔNG đổi logic KPI/report** — chỉ thêm index + cache.
- KHÔNG cache `liveOperations` (real-time KDS/serving/tables).
- KHÔNG cache 6 report controller.
- KHÔNG thêm index mới cho invoice_lines/payments/invoice_promotions (đã có từ Task 1).
- Key cache gồm range + start date (`dashboard_kpis_{start}_{end}`, `dashboard_top_products_{start}_{end}` — BẮT BUỘC kèm end để tránh collision giữa `last_7_days`/`this_month` khi cùng start mùng 1).
- Dashboard TTL: kpis 120s, chart 120s, topProducts 300s, lowStock 300s.
- `Cache::tags(['dashboard'])->flush()` trong CheckoutService::runBulk sau khi ghi invoice.
- `cached()` helper fallback khi Redis lỗi (chạy thẳng).

---

## File Structure

**Tạo mới:**
- `database/migrations/2026_08_07_000001_add_report_performance_indexes.php`
- `tests/Feature/ReportPerformanceIndexesTest.php`
- `tests/Feature/DashboardServiceCacheTest.php`

**Sửa:**
- `app/Services/Manager/DashboardService.php` — thêm `cached()` helper + bọc 4 method
- `app/Services/Checkout/CheckoutService.php` — thêm flush dashboard

---

## Task 1: Migration thêm 4 index cột date

**Files:**
- Create: `database/migrations/2026_08_07_000001_add_report_performance_indexes.php`
- Test: `tests/Feature/ReportPerformanceIndexesTest.php`

**Interfaces:**
- Produces: 4 index: `invoices_issued_at_index`, `orders_created_at_index`, `order_items_cancelled_at_index`, `deposits_created_at_index`.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/ReportPerformanceIndexesTest.php`:

```php
<?php

use Illuminate\Support\Facades\Schema;

test('migration them index cot date cho bang bao cao', function () {
    expect(Schema::hasIndex('invoices', 'invoices_issued_at_index'))->toBeTrue();
    expect(Schema::hasIndex('orders', 'orders_created_at_index'))->toBeTrue();
    expect(Schema::hasIndex('order_items', 'order_items_cancelled_at_index'))->toBeTrue();
    expect(Schema::hasIndex('deposits', 'deposits_created_at_index'))->toBeTrue();
});
```

**Lưu ý:** `Schema::hasIndex($table, $index)` — Laravel có method này. Nếu không, dùng `Schema::getIndexes($table)` và assert tên index tồn tại (khớp phiên bản Laravel 11). Kiểm tra signature khi implement.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\ReportPerformanceIndexesTest.php`
Expected: FAIL — 4 index chưa tồn tại (migration chưa chạy vì file mới chưa có).

- [ ] **Step 3: Tạo migration**

Tạo `database/migrations/2026_08_07_000001_add_report_performance_indexes.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->index('issued_at', 'invoices_issued_at_index');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->index('created_at', 'orders_created_at_index');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->index('cancelled_at', 'order_items_cancelled_at_index');
        });

        Schema::table('deposits', function (Blueprint $table) {
            $table->index('created_at', 'deposits_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex('invoices_issued_at_index');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_created_at_index');
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropIndex('order_items_cancelled_at_index');
        });
        Schema::table('deposits', function (Blueprint $table) {
            $table->dropIndex('deposits_created_at_index');
        });
    }
};
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan migrate`
Run: `php artisan test tests\Feature\ReportPerformanceIndexesTest.php`
Expected: PASS.

- [ ] **Step 5: Chạy full suite**

Run: `php artisan test`
Expected: PASS (index không đổi hành vi query).

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_08_07_000001_add_report_performance_indexes.php tests/Feature/ReportPerformanceIndexesTest.php
git commit -m "perf: index cot date cho bao cao (issued_at/created_at/cancelled_at)"
```

---

## Task 2: Cache DashboardService + flush khi checkout

**Files:**
- Modify: `app/Services/Manager/DashboardService.php`
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/DashboardServiceCacheTest.php` (mới)

**Interfaces:**
- Consumes: `Cache` facade, `Order`/`Invoice`/`OrderItem`/`Table`/`Ingredient`/`InvoiceLine` models.
- Produces: `DashboardService::cached(string $key, int $ttl, callable $loader): mixed`; 4 method bọc cache; CheckoutService flush dashboard tag.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/DashboardServiceCacheTest.php`:

```php
<?php

use App\Services\Manager\DashboardService;
use Illuminate\Support\Facades\Cache;

test('dashboard kpis duoc cache theo ngay', function () {
    $service = new DashboardService;
    [$start, $end, $prevStart, $prevEnd] = $service->getDateBounds('today');

    // Lần 1: chạy logic, ghi cache
    $r1 = $service->kpis($start, $end, $prevStart, $prevEnd);
    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_'.$start->toDateString()))->toBeTrue();

    // Lần 2: dùng cached (cùng kết quả)
    $r2 = $service->kpis($start, $end, $prevStart, $prevEnd);
    expect($r2)->toBe($r1);
});

test('dashboard lowStock duoc cache', function () {
    $service = new DashboardService;
    $r1 = $service->lowStock();
    expect(Cache::tags(['dashboard'])->has('dashboard_low_stock'))->toBeTrue();
    expect($service->lowStock())->toBe($r1);
});

test('checkout flush dashboard cache', function () {
    // Ghi cache giả
    Cache::tags(['dashboard'])->put('dashboard_kpis_2026-01-01', 'stale', 300);
    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_2026-01-01'))->toBeTrue();

    // Chạy 1 checkout
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);
    \App\Services\Checkout\CheckoutService::run($order, [['method' => 'cash', 'amount' => 100000]], [], auth()->id());

    expect(Cache::tags(['dashboard'])->has('dashboard_kpis_2026-01-01'))->toBeFalse();
});
```

**Lưu ý:** test cache dùng array cache driver (default sqlite + array cache trong test) — tags hoạt động. Test 3 cần `CheckoutService::run` (đã quen). Nếu `getDateBounds('today')` return Carbon objects, `$start->toDateString()` cho key.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\DashboardServiceCacheTest.php`
Expected: FAIL — kpis chưa cache (tags không có key), flush chưa có.

- [ ] **Step 3: Thêm cached() helper + bọc 4 method**

Trong `app/Services/Manager/DashboardService.php`:

Thêm imports:
```php
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
```

Thêm helper:
```php
    private function cached(string $key, int $ttl, callable $loader): mixed
    {
        try {
            return Cache::tags(['dashboard'])->remember($key, $ttl, $loader);
        } catch (\Exception $e) {
            Log::warning("Redis failed in dashboard {$key}: ".$e->getMessage());

            return $loader();
        }
    }
```

Bọc từng method — đổi body thành `return $this->cached(...)` với logic cũ trong closure:

**`kpis`** — thay toàn bộ body:
```php
    public function kpis(Carbon $start, Carbon $end, Carbon $prevStart, Carbon $prevEnd): array
    {
        return $this->cached('dashboard_kpis_'.$start->toDateString().'_'.$end->toDateString(), 120, function () use ($start, $end, $prevStart, $prevEnd) {
            $revenue = Invoice::whereBetween('issued_at', [$start, $end])->sum('total_amount');
            $prevRevenue = Invoice::whereBetween('issued_at', [$prevStart, $prevEnd])->sum('total_amount');

            $diffPercentage = 0;
            if ($prevRevenue > 0) {
                $diffPercentage = round((($revenue - $prevRevenue) / $prevRevenue) * 100, 1);
            }

            $ordersCount = Order::whereBetween('created_at', [$start, $end])->count();
            $pendingOrdersCount = Order::whereBetween('created_at', [$start, $end])
                ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->count();

            $totalTables = Table::count();
            $occupiedTables = Table::where('status', 'occupied')->count();

            $lowStockCount = Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')->count();

            return [
                'revenue' => [
                    'value' => (float) $revenue,
                    'comparison_percentage' => $diffPercentage,
                    'trend' => $diffPercentage >= 0 ? 'up' : 'down',
                ],
                'orders' => [
                    'value' => $ordersCount,
                    'pending_count' => $pendingOrdersCount,
                ],
                'tables' => [
                    'occupied' => $occupiedTables,
                    'total' => $totalTables,
                ],
                'inventory_warnings_count' => $lowStockCount,
            ];
        });
    }
```

**`liveOperations`** — KHÔNG cache, giữ nguyên body hiện tại.

**`chartData`** — đổi body:
```php
    public function chartData(string $range, Carbon $start, Carbon $end): array
    {
        return $this->cached('dashboard_chart_'.$range.'_'.$start->toDateString(), 120, function () use ($range, $start, $end) {
            $invoices = Invoice::whereBetween('issued_at', [$start, $end])->get();
            // ... giữ nguyên logic cũ (hour/date grouping) ...
            return $chart;
        });
    }
```

**`topProducts`** — đổi body:
```php
    public function topProducts(Carbon $start, Carbon $end): array
    {
        return $this->cached('dashboard_top_products_'.$start->toDateString().'_'.$end->toDateString(), 300, function () use ($start, $end) {
            return \Illuminate\Support\Facades\DB::table('invoice_lines')
                ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
                ->whereBetween('invoices.issued_at', [$start, $end])
                ->selectRaw('invoice_lines.name_snapshot as name, SUM(invoice_lines.quantity) as sales_count')
                ->groupBy('invoice_lines.name_snapshot')
                ->orderByDesc('sales_count')
                ->limit(5)
                ->get()
                ->map(fn (\stdClass $r) => [
                    'name' => $r->name,
                    'sales_count' => (int) $r->sales_count,
                ])
                ->all();
        });
    }
```

**`lowStock`** — đổi body:
```php
    public function lowStock(): array
    {
        return $this->cached('dashboard_low_stock', 300, fn () => Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')
            ->select('code', 'name', 'stock_quantity', 'unit', 'min_stock_alert')
            ->get()
            ->all());
    }
```

**Lưu ý:** giữ NGUYÊN logic trong mỗi closure (không sửa query), chỉ thêm `return $this->cached(...)` bọc. `getDateBounds` không cache (thuần tính).

- [ ] **Step 4: Thêm flush dashboard trong CheckoutService**

Trong `app/Services/Checkout/CheckoutService.php` `runBulk`, hiện kết thúc là `return DB::transaction(function () use (...) { ... return $invoice; });`. Flush phải chạy SAU khi transaction commit.

**Cách sửa đúng (đổi cuối method):**
```php
        $invoice = DB::transaction(function () use ($orders, $paymentRows, $promotionCodes, $userId, $tableName) {
            // ... toàn bộ logic hiện tại, giữ nguyên ...
            return $invoice;
        });

        // Dashboard KPI tiền thay đổi sau mỗi checkout → flush cache dashboard
        \Illuminate\Support\Facades\Cache::tags(['dashboard'])->flush();

        return $invoice;
```
Tức: đổi `return DB::transaction(...)` thành `$invoice = DB::transaction(...)`, thêm flush, `return $invoice;`. Xác minh signature `runBulk` vẫn trả `Invoice`.

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\DashboardServiceCacheTest.php`
Expected: PASS (3 test).

- [ ] **Step 6: Regression + Pint**

Run: `php artisan test tests\Feature\DashboardTest.php tests\Feature\DashboardServiceKdsTest.php tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php`
Expected: PASS.

Run: `vendor/bin/pint app/Services/Manager/DashboardService.php app/Services/Checkout/CheckoutService.php`

- [ ] **Step 7: Commit**

```bash
git add app/Services/Manager/DashboardService.php app/Services/Checkout/CheckoutService.php tests/Feature/DashboardServiceCacheTest.php
git commit -m "perf: cache DashboardService (tag dashboard, TTL 120-300s) + flush khi checkout"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (258 + các test mới)
- [ ] `npm run types:check` — pass (không đụng frontend)
- [ ] `npm run build` — pass (không đụng frontend)
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `git status` — tree sạch, không file lạ
