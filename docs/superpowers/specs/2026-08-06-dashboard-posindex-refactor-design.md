# Design — Hoàn thiện DashboardController + POSController::index

**Date:** 2026-08-06
**Branch:** main (head dca6f17, sau merge idempotency-guard)

## Mục tiêu

Hoàn thiện 2 controller theo đánh giá trước đó: tách logic rải rác ra khỏi controller, và sửa bất nhất dữ liệu tiền (topProducts đọc bảng vận hành thay vì snapshot). Không đổi hành vi UI — shape frontend giữ nguyên.

## Bối cảnh đã xác minh

- `DashboardController` (206 dòng): `index` làm 5 nhóm việc (KPI, live operations, chart, top products, low stock) + 2 private helpers. `topProducts` (line 86-94) join **`order_items`** — bảng vận hành; các báo cáo món (ProductDetails/Profit) đã đọc **`invoice_lines`** (snapshot tiền) từ Payment Core Restructure → bất nhất nguồn dữ liệu.
- `POSController::index` (36-160): 3 closure (`$loadTables`, `$loadCategories`, `$loadProducts`) + Redis fallback lặp 3 khối try/catch, dồn ~120 dòng.
- Frontend shapes đã xác minh:
  - `DashboardManager.tsx` đọc: `kpis`, `live_operations`, `analytics.chart_data`, `analytics.top_products`, `inventory_warnings`. `top_products` shape `[{ name, sales_count }]`.
  - `POSManager` nhận `tables`, `categories`, `products` (shape phụ thuộc nặng).
- Cache: `POSController::index` cache `pos_tables_list` (tag `pos_tables`, TTL 1800), `pos_categories`/`pos_products` (tag `pos_products_and_categories`, TTL 86400). PaymentController/ReservationController/TableController đã flush `pos_tables` — KHÔNG đụng cơ chế cache.

## Phần 1 — DashboardController → DashboardService

**Tạo mới:** `App\Services\Manager\DashboardService`

Các method (mỗi method 1 trách nhiệm, nhận tham số rõ ràng):

```php
final class DashboardService
{
    public function getDateBounds(string $range): array;              // [start, end, prevStart, prevEnd]
    public function kpis(Carbon $start, Carbon $end, Carbon $prevStart, Carbon $prevEnd): array;
    public function liveOperations(string $range): ?array;           // chỉ khi range === 'today'
    public function chartData(string $range, Carbon $start, Carbon $end): array;
    public function topProducts(Carbon $start, Carbon $end): array;
    public function lowStock(): array;
}
```

**Thay đổi nội dung (quan trọng):**

1. **`topProducts` đổi nguồn** từ `order_items` sang `invoice_lines`:
```php
public function topProducts(Carbon $start, Carbon $end): array
{
    return \App\Models\InvoiceLine::query()
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
```
Group by `name_snapshot` (giữ đúng tên món tại thời điểm bán, nhất quán ProductDetails). Shape giữ `[{ name, sales_count }]`.

2. **`kpis`** — chuyển nguyên logic từ controller:
- `revenue` = `Invoice::whereBetween('issued_at',[$start,$end])->sum('total_amount')`
- `prevRevenue` = tương tự `$prevStart..$prevEnd`; `diffPercentage` + `trend`
- `ordersCount` / `pendingOrdersCount` (status `draft,pending,confirmed,processing,completed`)
- `occupiedTables` / `totalTables`
- `lowStockCount` = `Ingredient::whereColumn('stock_quantity','<=','min_stock_alert')->count()`
- Trả `['revenue' => ['value','comparison_percentage','trend'], 'orders' => ['value','pending_count'], 'tables' => ['occupied','total'], 'inventory_warnings_count']`

3. **`liveOperations`** — chỉ khi `$range === 'today'`; chuyển nguyên logic KDS pending/completed, recent_items (3), serving queue count, tables_map. Trả `null` cho range khác.

4. **`chartData`** — chuyển nguyên logic hiện có (gộp theo giờ cho today/yesterday, theo ngày cho còn lại), không đổi.

5. **`lowStock`** — chuyển nguyên logic low-stock detail list.

**Controller `DashboardController::index` sau tách** (~40 dòng):
```php
public function index(Request $request)
{
    $range = $request->input('date_range', 'today');
    [$startDate, $endDate, $prevStartDate, $prevEndDate] = $this->service->getDateBounds($range);

    return Inertia::render('manager/dashboard/DashboardManager', [
        'filters' => ['date_range' => $range, 'available_ranges' => ['today', 'yesterday', 'last_7_days', 'this_month']],
        'kpis' => $this->service->kpis($startDate, $endDate, $prevStartDate, $prevEndDate),
        'live_operations' => $this->service->liveOperations($range),
        'analytics' => [
            'chart_data' => $this->service->chartData($range, $startDate, $endDate),
            'top_products' => $this->service->topProducts($startDate, $endDate),
        ],
        'inventory_warnings' => $this->service->lowStock(),
    ]);
}
```
Inject service qua constructor (`private DashboardService $service`).

**Shape frontend GIỮ NGUYÊN** — chỉ đổi nơi tính toán + nguồn topProducts.

## Phần 2 — POSController::index → tách helper

**Sửa `app/Http/Controllers/Staff/POSController.php`:**

1. Tách `$loadTables` closure thành `private function loadTablesPayload(): array` (logic y hệt, ~64 dòng).
2. Tách `$loadCategories` + `$loadProducts` thành `private function loadMenuPayload(): array` trả `['categories' => ..., 'products' => ...]` (logic y hệt).
3. Thêm helper cache chung để gộp 3 khối Redis fallback:
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
4. `index` rút gọn:
```php
public function index(Request $request)
{
    $isLocal = app()->environment('local');

    $tables = $this->cachedPayload($isLocal, 'pos_tables', 'pos_tables_list', 1800, fn () => $this->loadTablesPayload());
    $menu = $this->cachedPayload($isLocal, 'pos_products_and_categories', 'pos_menu', 86400, fn () => $this->loadMenuPayload());

    return Inertia::render('staff/pos/POSManager', [
        'tables' => $tables,
        'categories' => $menu['categories'],
        'products' => $menu['products'],
    ]);
}
```

**Lưu ý cache:** `pos_categories`/`pos_products` là 2 key riêng (frontend không phụ thuộc key name — chỉ đọc props). Có thể giữ 2 key riêng để không phá invalidation hiện có, hoặc gộp 1 key `pos_menu` — **quyết định: giữ 2 key riêng** (`pos_categories`, `pos_products`) để không đổi hành vi invalidation; helper `cachedPayload` gọi 2 lần cho 2 key. Điều này giữ an toàn tuyệt đối với cache hiện tại.

**Shape frontend GIỮ NGUYÊN** (`tables`, `categories`, `products`).

## Phần 3 — Không đụng

- `ShiftController` — index rỗng là pattern hợp lệ (logic nằm ở open/current/close + frontend fetch). KHÔNG sửa.
- `OrderListController` — giữ nguyên (đã thảo luận: đơn chưa/không thanh toán không có invoice).
- Cache tag/TTL của `pos_tables` — giữ nguyên (đã có flush từ Payment/Reservation/Table controllers).

## Phần 4 — Kiểm thử

- **Backend regression:** full suite `php artisan test` — kỳ vọng 233/233 giữ nguyên (Dashboard test hiện có `DashboardTest.php` — chạy riêng).
- **DashboardTest:** kiểm tra hiện có chỉ `->has('analytics.top_products')` (assert tồn tại, không assert nội dung). Đổi nguồn sang invoice_lines → test vẫn pass (array rỗng cũng pass `->has`). **Bổ sung assertion nội dung** để verify hành vi mới thật sự: tạo invoice_lines (seed giống Task 9 cũ của reports) rồi assert `top_products.0.name` + `sales_count`. Cụ thể: test mới tạo 1 invoice + 1 invoice_line (qty 3, tên 'Cà phê đen'), gọi dashboard `date_range=today`... Lưu ý invoice `issued_at` phải nằm trong range — dùng `forceFill(['issued_at' => now()])->save()` để chắc chắn.
- **POS index:** regression qua `POSCheckoutTest`/`POSOrderFlowTest`/`POSTableOperationsTest` (đều gọi route POSManager) — shape tables không đổi.
- **Frontend:** `npm run types:check` + `npm run build` pass.

## Ngoài phạm vi

- Không đổi logic nghiệp vụ Dashboard (KPI giữ nguyên công thức; chỉ đổi nguồn topProducts).
- Không đổi cache key/TTL `pos_tables_list`, `pos_categories`, `pos_products`.
- Không đụng ShiftController / OrderListController / reports controllers.
