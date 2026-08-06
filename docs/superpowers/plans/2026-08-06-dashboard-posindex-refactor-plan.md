# Hoàn thiện DashboardController + POSController::index — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách logic rải rác khỏi 2 controller: DashboardController → DashboardService (và đổi topProducts sang invoice_lines cho nhất quán dữ liệu tiền), POSController::index → helper riêng + gộp Redis fallback.

**Architecture:** `App\Services\Manager\DashboardService` giữ mọi truy vấn Dashboard (6 method), controller `index` chỉ orchestrate + render Inertia với shape giữ nguyên. POSController tách `loadTablesPayload`/`loadMenuPayload` + helper `cachedPayload` gộp 3 khối Redis fallback, giữ nguyên cache key + shape.

**Tech Stack:** Laravel 11, PHP, Pest + PHPUnit (DashboardTest là PHPUnit-style), Inertia/React.

**Spec:** `docs/superpowers/specs/2026-08-06-dashboard-posindex-refactor-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` / `npm run ...` như lệnh đơn.
- **Shape frontend GIỮ NGUYÊN** ở cả 2 controller: DashboardManager đọc `kpis`, `live_operations`, `analytics.chart_data`, `analytics.top_products`, `inventory_warnings`; POSManager đọc `tables`, `categories`, `products`.
- `topProducts` shape `[{name, sales_count}]` (group theo `name_snapshot` từ invoice_lines).
- KHÔNG đổi cache key/TTL: `pos_tables_list` (tag `pos_tables`, TTL 1800), `pos_categories` + `pos_products` (tag `pos_products_and_categories`, TTL 86400) — **giữ 2 key riêng**, không gộp.
- KHÔNG đụng ShiftController, OrderListController, reports controllers.
- Mọi task: chạy test/check phù hợp trước khi commit; full suite không phá.
- DashboardTest là PHPUnit-style (extends TestCase, `RefreshDatabase`, seed `AuthorizationSeeder`) — test mới theo cùng style, KHÔNG dùng Pest helper `posAdmin`.

---

## File Structure

**Tạo mới:**
- `app/Services/Manager/DashboardService.php`

**Sửa:**
- `app/Http/Controllers/Manager/DashboardController.php` — dùng service, `index` ~40 dòng
- `app/Http/Controllers/Staff/POSController.php` — tách helper + gộp Redis fallback
- `tests/Feature/DashboardTest.php` — bổ sung assertion nội dung top_products

---

## Task 1: DashboardService + DashboardController dùng service

**Files:**
- Create: `app/Services/Manager/DashboardService.php`
- Modify: `app/Http/Controllers/Manager/DashboardController.php`
- Test: `tests/Feature/DashboardTest.php` (bổ sung)

**Interfaces:**
- Produces: `DashboardService` với 6 public method:
  - `getDateBounds(string $range): array` → `[$start, $end, $prevStart, $prevEnd]` (Carbon)
  - `kpis(Carbon $start, Carbon $end, Carbon $prevStart, Carbon $prevEnd): array`
  - `liveOperations(string $range): ?array`
  - `chartData(string $range, Carbon $start, Carbon $end): array`
  - `topProducts(Carbon $start, Carbon $end): array`
  - `lowStock(): array`
- Controller `index` dùng service, trả Inertia với shape KHÔNG ĐỔI.

- [ ] **Step 1: Viết test fail — DashboardTest bổ sung assertion top_products nội dung**

Thêm vào cuối `tests/Feature/DashboardTest.php` (cùng style PHPUnit hiện có):

```php
    public function test_dashboard_top_products_reads_from_invoice_lines()
    {
        $adminUser = User::where('email', 'admin@admin.com')->first();
        if (!$adminUser) {
            $adminUser = User::factory()->create(['email' => 'admin@admin.com']);
            $adminRole = \App\Models\Role::where('name', 'admin')->first();
            $adminUser->roles()->attach($adminRole);
        }

        // Seed: 1 invoice + 1 invoice_line (tạo dữ liệu MỚI theo tầng thanh toán)
        $invoice = \App\Models\Invoice::create([
            'invoice_code' => 'DASH1', 'table_name' => 'B01', 'payment_method' => 'cash',
            'amount_received' => 60000, 'change_amount' => 0, 'total_amount' => 60000,
        ]);
        $invoice->forceFill(['issued_at' => now()])->save();
        \App\Models\InvoiceLine::create([
            'invoice_id' => $invoice->id, 'menu_item_id' => null, 'name_snapshot' => 'Cà phê đen',
            'quantity' => 3, 'unit_price' => 20000, 'subtotal' => 60000,
            'vat_rate' => 0, 'vat_amount' => 0, 'discount_amount' => 0,
        ]);

        $response = $this->actingAs($adminUser)->get('/manager/dashboard?date_range=today');
        $response->assertInertia(fn ($page) => $page
            ->component('manager/dashboard/DashboardManager')
            ->has('analytics.top_products', 1)
            ->where('analytics.top_products.0.name', 'Cà phê đen')
            ->where('analytics.top_products.0.sales_count', 3)
        );
    }
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\DashboardTest.php`
Expected: test mới FAIL (topProducts hiện đọc order_items → không có dữ liệu → 0 phần tử, `has(...,1)` fail).

- [ ] **Step 3: Tạo DashboardService**

Tạo `app/Services/Manager/DashboardService.php` — chuyển NGUYÊN logic từ DashboardController sang:

```php
<?php

namespace App\Services\Manager;

use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

final class DashboardService
{
    public function getDateBounds(string $range): array
    {
        $now = Carbon::now();
        switch ($range) {
            case 'yesterday':
                $start = Carbon::yesterday()->startOfDay();
                $end = Carbon::yesterday()->endOfDay();
                $prevStart = Carbon::yesterday()->subDay()->startOfDay();
                $prevEnd = Carbon::yesterday()->subDay()->endOfDay();
                break;
            case 'last_7_days':
                $start = Carbon::now()->subDays(6)->startOfDay();
                $end = Carbon::now()->endOfDay();
                $prevStart = Carbon::now()->subDays(13)->startOfDay();
                $prevEnd = Carbon::now()->subDays(7)->endOfDay();
                break;
            case 'this_month':
                $start = Carbon::now()->startOfMonth();
                $end = Carbon::now()->endOfMonth();
                $prevStart = Carbon::now()->subMonth()->startOfMonth();
                $prevEnd = Carbon::now()->subMonth()->endOfMonth();
                break;
            case 'today':
            default:
                $start = Carbon::today()->startOfDay();
                $end = Carbon::today()->endOfDay();
                $prevStart = Carbon::yesterday()->startOfDay();
                $prevEnd = Carbon::yesterday()->endOfDay();
                break;
        }
        return [$start, $end, $prevStart, $prevEnd];
    }

    public function kpis(Carbon $start, Carbon $end, Carbon $prevStart, Carbon $prevEnd): array
    {
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
    }

    public function liveOperations(string $range): ?array
    {
        if ($range !== 'today') {
            return null;
        }

        $kdsPending = OrderItem::whereDate('created_at', Carbon::today())
            ->whereIn('status', ['pending', 'cooking'])->count();
        $kdsCompleted = OrderItem::whereDate('created_at', Carbon::today())
            ->whereIn('status', ['ready', 'served'])->count();

        $recentKdsItems = OrderItem::with('menuItem')
            ->whereDate('created_at', Carbon::today())
            ->latest()
            ->limit(3)
            ->get()
            ->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->menuItem?->name ?? 'Món ăn',
                'quantity' => $item->quantity,
                'time_ago' => $item->created_at->diffForHumans(null, true).' trước',
            ]);

        $servingQueueCount = OrderItem::where('status', 'completed')
            ->whereNull('served_at')
            ->whereHas('order', fn ($q) => $q->whereDate('created_at', Carbon::today()))
            ->count();

        $tablesMap = Table::select('id', 'table_number as name', 'status', 'reservation_name')->get();

        return [
            'kds' => [
                'pending_count' => $kdsPending,
                'completed_count' => $kdsCompleted,
                'recent_items' => $recentKdsItems,
            ],
            'serving' => [
                'queue_count' => $servingQueueCount,
            ],
            'tables_map' => $tablesMap,
        ];
    }

    public function chartData(string $range, Carbon $start, Carbon $end): array
    {
        $invoices = Invoice::whereBetween('issued_at', [$start, $end])->get();

        if ($range === 'today' || $range === 'yesterday') {
            $data = $invoices->groupBy(fn ($invoice) => Carbon::parse($invoice->issued_at)->hour)
                ->map(fn ($group) => $group->sum('total_amount'))
                ->toArray();

            $chart = [];
            for ($h = 0; $h <= 23; $h++) {
                $chart[] = [
                    'label' => sprintf('%02d:00', $h),
                    'revenue' => (float) ($data[$h] ?? 0),
                ];
            }
            return $chart;
        }

        $data = $invoices->groupBy(fn ($invoice) => Carbon::parse($invoice->issued_at)->toDateString())
            ->map(fn ($group) => $group->sum('total_amount'))
            ->toArray();

        $chart = [];
        $curr = $start->copy();
        while ($curr->lte($end)) {
            $chart[] = [
                'label' => $curr->format('d/m'),
                'revenue' => (float) ($data[$curr->toDateString()] ?? 0),
            ];
            $curr->addDay();
        }
        return $chart;
    }

    public function topProducts(Carbon $start, Carbon $end): array
    {
        return InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereBetween('invoices.issued_at', [$start, $end])
            ->selectRaw('invoice_lines.name_snapshot as name, SUM(invoice_lines.quantity) as sales_count')
            ->groupBy('invoice_lines.name_snapshot')
            ->orderByDesc('sales_count')
            ->limit(5)
            ->get()
            ->map(fn ($r) => [
                'name' => $r->name,
                'sales_count' => $r->sales_count,
            ])
            ->all();
    }

    public function lowStock(): array
    {
        return Ingredient::whereColumn('stock_quantity', '<=', 'min_stock_alert')
            ->select('code', 'name', 'stock_quantity', 'unit', 'min_stock_alert')
            ->get()
            ->all();
    }
}
```

- [ ] **Step 4: Rút gọn DashboardController**

Thay toàn bộ nội dung `app/Http/Controllers/Manager/DashboardController.php`:

```php
<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Services\Manager\DashboardService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function __construct(
        private DashboardService $service
    ) {
    }

    public function index(Request $request)
    {
        $range = $request->input('date_range', 'today');
        [$startDate, $endDate, $prevStartDate, $prevEndDate] = $this->service->getDateBounds($range);

        return Inertia::render('manager/dashboard/DashboardManager', [
            'filters' => [
                'date_range' => $range,
                'available_ranges' => ['today', 'yesterday', 'last_7_days', 'this_month'],
            ],
            'kpis' => $this->service->kpis($startDate, $endDate, $prevStartDate, $prevEndDate),
            'live_operations' => $this->service->liveOperations($range),
            'analytics' => [
                'chart_data' => $this->service->chartData($range, $startDate, $endDate),
                'top_products' => $this->service->topProducts($startDate, $endDate),
            ],
            'inventory_warnings' => $this->service->lowStock(),
        ]);
    }
}
```

**Lưu ý:** `liveOperations` trả `Collection` (`$recentKdsItems`, `$tablesMap`) — Inertia serialize Collection ok (như controller cũ vốn trả nguyên Collection). Giữ nguyên.

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\DashboardTest.php`
Expected: PASS (5 test — 4 cũ + 1 mới top_products từ invoice_lines).

- [ ] **Step 6: Pint + full suite**

Run: `vendor/bin/pint app/Services/Manager/DashboardService.php app/Http/Controllers/Manager/DashboardController.php`
Expected: clean (gỡ import không dùng).

Run: `php artisan test`
Expected: PASS toàn bộ (233 + 1 Dashboard test mới = 234).

- [ ] **Step 7: Commit**

```bash
git add app/Services/Manager/DashboardService.php app/Http/Controllers/Manager/DashboardController.php tests/Feature/DashboardTest.php
git commit -m "refactor: DashboardController dung DashboardService, topProducts doc invoice_lines"
```

---

## Task 2: POSController::index tách helper + gộp Redis fallback

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php`

**Interfaces:**
- Consumes: `Table`, `Order`, `MenuCategory`, `MenuItem`, `Cache`, `Log` (imports đã có).
- Produces: `index` rút gọn; 3 private method mới: `loadTablesPayload()`, `loadMenuPayload()`, `cachedPayload(bool $isLocal, string $tag, string $key, int $ttl, callable $loader)`.
- Shape `tables`/`categories`/`products` GIỮ NGUYÊN.

- [ ] **Step 1: Tách loadTablesPayload**

Trong `app/Http/Controllers/Staff/POSController.php`, thay closure `$loadTables` (hiện ~dòng 37-100) bằng private method (logic Y HỆT, `$this->` không cần vì không dùng state):

```php
    private function loadTablesPayload(): array
    {
        $tables = Table::with(['mergedIntoTable', 'orders' => function ($query) {
            $query->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'])
                ->with(['items' => function ($q) {
                    $q->where('status', '!=', 'cancelled')->with('menuItem');
                }, 'deposits' => function ($q) {
                    $q->where('status', 'held');
                }]);
        }])->where('status', '!=', 'maintenance')->orderBy('area', 'asc')->orderBy('table_number', 'asc')->get();

        $tables->each(function ($table) use ($tables) {
            if ($table->merged_into_table_id || $tables->contains('merged_into_table_id', $table->id)) {
                $groupId = $table->merged_into_table_id ?? $table->id;
                $allGroupTableIds = $tables->filter(fn ($t) => $t->id == $groupId || $t->merged_into_table_id == $groupId)->pluck('id');
                $allGroupOrders = Order::with(['items' => function ($query) {
                    $query->where('status', '!=', 'cancelled')->with('menuItem');
                }, 'deposits' => function ($q) {
                    $q->where('status', 'held');
                }])->whereIn('table_id', $allGroupTableIds)->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'])->get();
                $allGroupOrders->each(function ($order) {
                    $order->deposit_total = (float) $order->deposits->sum('amount');
                });
                $table->setRelation('activeOrders', $allGroupOrders);
                $table->setRelation('activeOrder', $allGroupOrders->first());
            } else {
                $table->setRelation('activeOrders', $table->orders);
                $table->activeOrders->each(function ($order) {
                    $order->deposit_total = (float) $order->deposits->sum('amount');
                });
            }
        });

        $result = $tables->values()->toArray();

        // Inject virtual "Mang đi" table with takeaway orders (table_id IS NULL)
        $takeawayOrders = Order::with(['items' => function ($query) {
            $query->where('status', '!=', 'cancelled')->with('menuItem');
        }, 'deposits' => function ($q) {
            $q->where('status', 'held');
        }])->whereNull('table_id')
            ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'])
            ->get();
        $takeawayOrders->each(function ($order) {
            $order->deposit_total = (float) $order->deposits->sum('amount');
        });

        array_unshift($result, [
            'id' => 0,
            'table_number' => 'Mang đi',
            'area' => 'Mang đi',
            'capacity' => 0,
            'status' => $takeawayOrders->isNotEmpty() ? 'occupied' : 'available',
            'merged_into_table_id' => null,
            'merged_into_table' => null,
            'reservation_time' => null,
            'reservation_name' => null,
            'reservation_phone' => null,
            'reservation_note' => null,
            'active_orders' => $takeawayOrders->toArray(),
            'active_order' => $takeawayOrders->first()?->toArray(),
        ]);

        return $result;
    }
```

- [ ] **Step 2: Tách loadCategoriesPayload + loadProductsPayload**

Thêm 2 private method (logic Y HỆT `$loadCategories` + `$loadProducts`; tách 2 method riêng để giữ 2 cache key `pos_categories` + `pos_products` theo spec Phần 2):

```php
    private function loadCategoriesPayload(): array
    {
        return MenuCategory::orderBy('sort_order', 'asc')->get()->toArray();
    }

    private function loadProductsPayload(): array
    {
        $prods = MenuItem::with(['category', 'recipes.ingredient'])->where('is_available', true)->get();

        $prods->transform(function ($product) {
            if ($product->recipes && $product->recipes->count() > 0) {
                $possibleServings = [];
                foreach ($product->recipes as $recipe) {
                    if ($recipe->ingredient && (float) $recipe->amount > 0) {
                        $stock = (float) $recipe->ingredient->stock_quantity;
                        $possible = (int) floor($stock / (float) $recipe->amount);
                        $possibleServings[] = max(0, $possible);
                    }
                }
                $product->max_servings = count($possibleServings) > 0 ? min($possibleServings) : 999;
            } else {
                $product->max_servings = 999;
            }

            return $product;
        });

        return $prods->toArray();
    }
```

- [ ] **Step 3: Thêm helper cachedPayload**

Thêm private method (gộp 3 khối Redis fallback):

```php
    private function cachedPayload(bool $isLocal, string $tag, string $key, int $ttl, callable $loader): mixed
    {
        if ($isLocal) {
            return $loader();
        }

        try {
            return Cache::tags([$tag])->remember($key, $ttl, $loader);
        } catch (\Exception $e) {
            Log::error("Redis connection failed in POSController {$key} loading: ".$e->getMessage());

            return $loader();
        }
    }
```

- [ ] **Step 4: Rút gọn index**

Thay toàn bộ body `index` (hiện ~dòng 36-160) bằng:

```php
    public function index(Request $request)
    {
        $isLocal = app()->environment('local');

        $tables = $this->cachedPayload($isLocal, 'pos_tables', 'pos_tables_list', 1800, fn () => $this->loadTablesPayload());

        $categories = $this->cachedPayload($isLocal, 'pos_products_and_categories', 'pos_categories', 86400, fn () => $this->loadCategoriesPayload());
        $products = $this->cachedPayload($isLocal, 'pos_products_and_categories', 'pos_products', 86400, fn () => $this->loadProductsPayload());

        return Inertia::render('staff/pos/POSManager', [
            'tables' => $tables,
            'categories' => $categories,
            'products' => $products,
        ]);
    }
```

Giữ 2 cache key riêng (`pos_categories` + `pos_products`) đúng spec Phần 2 — không gộp thành 1 key.

- [ ] **Step 5: Xóa closure cũ + đảm bảo không còn `$loadTables`/`$loadCategories`/`$loadProducts`**

Sau khi thay, đảm bảo body `index` KHÔNG còn 3 closure cũ. Chạy:

Run: `php -l app/Http/Controllers/Staff/POSController.php`
Expected: "No syntax errors detected".

- [ ] **Step 6: Pint + regression**

Run: `vendor/bin/pint app/Http/Controllers/Staff/POSController.php`
Expected: clean.

Run: `php artisan test tests\Feature\POSCheckoutTest.php tests\Feature\POSOrderFlowTest.php tests\Feature\POSTableOperationsTest.php tests\Feature\TableCacheTest.php`
Expected: PASS (các test gọi route POSManager — shape tables không đổi).

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php
git commit -m "refactor: POSController index tach helper + gop Redis fallback (giu cache key)"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (kỳ vọng 234: 233 + 1 Dashboard test mới)
- [ ] `npm run types:check` — pass
- [ ] `npm run build` — pass
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `git status` — tree sạch, không file lạ
