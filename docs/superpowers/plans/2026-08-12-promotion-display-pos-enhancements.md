# Hiển thị Promotion chính xác trong POS & Nâng cấp trang Khuyến mãi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PaymentDrawer hiển thị từng promotion áp dụng (auto + coupon/voucher) khớp chính xác discount checkout, cho phép nhân viên chọn auto promotion cụ thể, sửa double-count revenue analytics + lỗi % pie chart, và nâng cấp Campaign Performance dùng `DataTable` kèm modal hoá đơn.

**Architecture:** Backend mở rộng `PromotionEngine::resolveAll` với tham số `$preferredAutoId` (backward compatible), `CheckoutService` và `PaymentController` truyền `selected_promotion_id`. Cache `pos_promotions` cho danh sách ứng viên hiển thị (chỉ hiển thị, không ảnh hưởng quota — quota qua DB lock như cũ). Realtime + command aggregate phân bổ revenue theo tỷ trọng discount để hết double-count. Frontend: `usePOSCheckout` giữ `appliedPromotions[]` + `selectedAutoId`, PaymentDrawer render từng dòng, Campaign Performance dùng `DataTable`, thêm modal `PromotionInvoicesModal`.

**Tech Stack:** Laravel 12 (PHP 8.3), MySQL/SQLite test, Inertia.js + React 19 + TypeScript, Tailwind, Pest, recharts.

## Global Constraints

- Backward compatible: mọi caller cũ của `PromotionEngine::resolveAll` không truyền `$preferredAutoId` → hành vi không đổi.
- Cache `pos_promotions` CHỈ phục vụ hiển thị; quyết định áp dụng/quota luôn đọc DB qua `lockForUpdate` trong transaction checkout.
- Tag cache mới: `pos_promotions` / key `pos_promotions_list`, TTL 300s. Môi trường `local` (`$isLocal`) bỏ cache chạy loader trực tiếp (pattern `cachedPayload` hiện có).
- Realtime `CheckoutService::runBulk` và command `AggregateDailyPromotionStats` cùng logic phân bổ revenue: `revenue_promotion = invoiceTotal × (discount_promotion / tổng discount invoice)`; tổng discount = 0 → promotion đầu tiên nhận full, còn lại 0.
- Không thêm dependency mới. Không refactor ngoài phạm vi.
- Spec: `docs/superpowers/specs/2026-08-12-promotion-display-pos-enhancements-design.md`

---

### Task 1: PromotionEngine — hỗ trợ chọn auto promotion cụ thể

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php` (signature `resolveAll` + step 3)
- Test: `tests/Feature/Services/PromotionEngineTest.php` (thêm test mới)

**Interfaces:**
- Produces: `PromotionEngine::resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false, ?int $preferredAutoId = null): array`

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/Services/PromotionEngineTest.php`:

```php
test('resolveAll voi preferredAutoId: chon dung promotion chi dinh, khong chon tot nhat', function () {
    $pSmall = promoV2();
    addAction($pSmall, 'discount_amount', 5000);
    $pBig = promoV2();
    addAction($pBig, 'discount_amount', 20000);

    // Không truyền preferred → chọn tốt nhất (pBig)
    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000);
    expect($r['promotions'])->toHaveCount(1);
    expect($r['promotions'][0]['promotion']->id)->toBe($pBig->id);

    // Truyền pSmall → chọn pSmall dù discount thấp hơn
    $r2 = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, $pSmall->id);
    expect($r2['promotions'])->toHaveCount(1);
    expect($r2['promotions'][0]['promotion']->id)->toBe($pSmall->id);
    expect($r2['total_discount'])->toBe(5000.0);
});

test('resolveAll voi preferredAutoId khong thoa dieu kien: khong ap auto, khong reject', function () {
    $p = promoV2();
    addCond($p, 'min_order_value', '999999');
    addAction($p, 'discount_amount', 20000);

    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, $p->id);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toBeEmpty();
    expect($r['total_discount'])->toBe(0.0);
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='resolveAll voi preferredAutoId'`
Expected: FAIL — `resolveAll` nhận sai số tham số / vẫn chọn tốt nhất.

- [ ] **Step 3: Cập nhật `resolveAll`**

```php
public static function resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false, ?int $preferredAutoId = null): array
{
    // ... giữ nguyên các bước 0-2 ...

    // 3. PROMOTION tự động: quét, lọc thoả điều kiện, chọn theo preferred hoặc tốt nhất
    $auto = null;
    $hasNonStackable = collect($codePromotions)->contains(fn ($p) => ! $p->stackable);
    if (! $hasNonStackable) {
        $candidatesQuery = Promotion::query()
            ->where('type', 'promotion')
            ->where('status', true)
            ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', now()))
            ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', now()))
            ->with(['conditions', 'actions']);
        if ($lockForUpdate) {
            $candidatesQuery->lockForUpdate();
        }
        $candidates = $candidatesQuery->get()
            ->filter(fn ($p) => self::matchesConditions($p, $lines, $subtotal) && self::quotaOk($p));

        $auto = $preferredAutoId !== null
            ? $candidates->first(fn ($p) => $p->id === $preferredAutoId)
            : $candidates->sortByDesc(fn ($p) => self::estimateDiscount($p, $lines, $subtotal))->first();
    }
    // ... giữ nguyên bước 4-5 ...
}
```

- [ ] **Step 4: Chạy toàn bộ PromotionEngine tests**

Run: `php artisan test --filter='PromotionEngineTest'`
Expected: PASS (cả test mới + test cũ backward compatible).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php tests/Feature/Services/PromotionEngineTest.php
git commit -m "feat: PromotionEngine cho phep chon auto promotion cu the qua preferredAutoId"
```

---

### Task 2: CheckoutService + PaymentController — truyền selected_promotion_id

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php` (`run`, `runBulk`, gọi `resolveAll`)
- Modify: `app/Http/Controllers/Staff/PaymentController.php` (`checkout`, `bulkCheckout` — validation + truyền param)
- Test: `tests/Feature/PromotionV2Test.php` (thêm test)

**Interfaces:**
- Consumes: `PromotionEngine::resolveAll(..., ?int $preferredAutoId = null)` (Task 1)
- Produces: `CheckoutService::runBulk(Collection $orders, array $paymentRows, array $promotionCodes, ?int $userId, ?string $tableName = null, ?int $selectedPromotionId = null): Invoice`; `run(Order $order, array $paymentRows, array $promotionCodes, ?int $userId, ?int $selectedPromotionId = null): Invoice`
- Produces: request fields `selected_promotion_id` trên `POST /staff/pos/checkout` và `POST /staff/pos/bulk-checkout`

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/PromotionV2Test.php`:

```php
test('checkout voi selected_promotion_id: ap dung dung promotion da chon', function () {
    $admin = posAdmin();
    $pBig = promoV2(['type' => 'promotion']);
    addAction($pBig, 'discount_amount', 20000);
    $pSmall = promoV2(['type' => 'promotion']);
    addAction($pSmall, 'discount_amount', 5000);

    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 95000,
        'selected_promotion_id' => $pSmall->id,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    expect((float) $invoice->discount_amount)->toBe(5000.0);
    expect((float) $invoice->total_amount)->toBe(95000.0);
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='checkout voi selected_promotion_id'`
Expected: FAIL — discount vẫn là 20000 (chọn tốt nhất), total 80000.

- [ ] **Step 3: Cập nhật `CheckoutService::run` và `runBulk`**

```php
public static function run(Order $order, array $paymentRows, array $promotionCodes, ?int $userId, ?int $selectedPromotionId = null): Invoice
{
    return static::runBulk(collect([$order]), $paymentRows, $promotionCodes, $userId, null, $selectedPromotionId);
}

public static function runBulk(Collection $orders, array $paymentRows, array $promotionCodes, ?int $userId, ?string $tableName = null, ?int $selectedPromotionId = null): Invoice
{
    // trong transaction, dòng 98:
    $resolved = PromotionEngine::resolveAll($promotionCodes, $engineLines, $subtotal, true, $selectedPromotionId);
    // phần còn lại không đổi
}
```

- [ ] **Step 4: Cập nhật `PaymentController::checkout` và `bulkCheckout`**

Validation thêm vào cả 2 method:
```php
'selected_promotion_id' => ['nullable', 'integer', Rule::exists('promotions', 'id')->whereNull('deleted_at')],
```

`checkout` — dòng ~177:
```php
$invoice = CheckoutService::runBulk(
    collect([$order]),
    $paymentRows,
    $codes,
    $request->user()?->id,
    $tableNameStr,
    $validated['selected_promotion_id'] ?? null,
);
```

`bulkCheckout` — dòng ~342:
```php
$invoice = CheckoutService::runBulk(
    $orders,
    $paymentRows,
    $codes,
    $request->user()?->id,
    $tableNameStr,
    $validated['selected_promotion_id'] ?? null,
);
```

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `php artisan test --filter='selected_promotion_id|checkout voi selected'`
Expected: PASS.

- [ ] **Step 6: Chạy toàn bộ test suite để đảm bảo không phá vỡ**

Run: `php artisan test`
Expected: PASS (300+ tests, gồm cả race quota test).

- [ ] **Step 7: Commit**

```bash
git add app/Services/Checkout/CheckoutService.php app/Http/Controllers/Staff/PaymentController.php tests/Feature/PromotionV2Test.php
git commit -m "feat: checkout nhan selected_promotion_id de ap dung auto promotion duoc chon"
```

---

### Task 3: Cache pos_promotions khi vào POS + invalidate

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php` (`index` + method mới `loadPromotionsPayload`)
- Modify: `app/Http/Controllers/Manager/PromotionController.php` (`store`/`update`/`destroy` — flush cache)
- Modify: `app/Services/Checkout/CheckoutService.php` (sau transaction — flush cache)
- Test: `tests/Feature/ProductCacheTest.php` hoặc file test mới `tests/Feature/PromotionPosCacheTest.php`

**Interfaces:**
- Consumes: pattern `cachedPayload(bool $isLocal, string $tag, string $key, int $ttl, callable $loader)` (POSController đã có)
- Produces: `POSController::loadPromotionsPayload(): array`; cache tag `pos_promotions`, key `pos_promotions_list`
- Produces: props `promotions` trong Inertia render `staff/pos/POSManager`

- [ ] **Step 1: Viết failing test**

Tạo `tests/Feature/PromotionPosCacheTest.php`:

```php
<?php

use Illuminate\Support\Facades\Cache;

test('pos index cache danh sach promotions khi khong phai local', function () {
    // Bỏ qua khi chạy env local (AppServiceProvider/test thường là local?)
    // Mô phỏng cache bằng cách gọi loader trực tiếp qua endpoint.
    $p = promoV2(['type' => 'promotion']);
    $this->actingAs(posStaff())->get('/staff/pos')->assertOk();
    // Trong env local cachedPayload bỏ qua cache — chỉ assert endpoint trả props promotions
    $this->actingAs(posStaff())->get('/staff/pos')->assertInertia(fn ($page) => $page->component('staff/pos/POSManager')->has('promotions'));
});

test('store promotion moi invalidate cache pos_promotions', function () {
    Cache::tags(['pos_promotions'])->put('pos_promotions_list', ['stale'], 300);
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Promo Test Cache', 'type' => 'promotion',
        'start_date' => null, 'end_date' => null,
        'status' => true,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 10000, 'max_discount_amount' => null]],
    ])->assertSessionHasNoErrors();
    expect(Cache::tags(['pos_promotions'])->has('pos_promotions_list'))->toBeFalse();
});
```

Lưu ý: nếu test env là `local`, test cache thứ nhất chỉ assert props `promotions` tồn tại (loader chạy trực tiếp). Điều chỉnh assertion theo env.

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionPosCacheTest'`
Expected: FAIL — props `promotions` không tồn tại; cache không bị flush.

- [ ] **Step 3: POSController — thêm loadPromotionsPayload + index**

Trong `POSController::index`:
```php
$promotions = $this->cachedPayload($isLocal, 'pos_promotions', 'pos_promotions_list', 300, fn () => $this->loadPromotionsPayload());

return Inertia::render('staff/pos/POSManager', [
    'tables' => $tables,
    'categories' => $categories,
    'products' => $products,
    'promotions' => $promotions,
]);
```

Thêm method (đặt sau `loadProductsPayload`):
```php
private function loadPromotionsPayload(): array
{
    return \App\Models\Promotion::with(['conditions', 'actions'])
        ->where('type', 'promotion')
        ->where('status', true)
        ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', now()))
        ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', now()))
        ->get()
        ->toArray();
}
```

- [ ] **Step 4: PromotionController — flush cache khi CRUD**

Thêm `use Illuminate\Support\Facades\Cache;` nếu chưa có. Trong `store`, `update`, `destroy` — sau khi transaction thành công:
```php
try {
    Cache::tags(['pos_promotions'])->flush();
} catch (\Throwable $e) {
    \Illuminate\Support\Facades\Log::warning('pos_promotions cache flush failed: '.$e->getMessage());
}
```

- [ ] **Step 5: CheckoutService — flush cache sau transaction**

Trong `runBulk`, cạnh `Cache::tags(['dashboard'])->flush();` (dòng ~361):
```php
try {
    Cache::tags(['pos_promotions'])->flush();
} catch (\Throwable $e) {
    \Illuminate\Support\Facades\Log::warning('pos_promotions cache flush failed: '.$e->getMessage());
}
```

- [ ] **Step 6: Chạy tests**

Run: `php artisan test --filter='PromotionPosCacheTest|ProductCacheTest'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php app/Http/Controllers/Manager/PromotionController.php app/Services/Checkout/CheckoutService.php tests/Feature/PromotionPosCacheTest.php
git commit -m "feat: cache danh sach promotions khi vao POS + invalidate khi CRUD/checkout"
```

---

### Task 4: Endpoint available-promotions + PromotionEngine::candidates

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php` (method mới `candidates`)
- Modify: `app/Http/Controllers/Staff/PaymentController.php` (method `availablePromotions`)
- Modify: `routes/web.php` (route)
- Test: `tests/Feature/PromotionApplyTest.php` (hoặc file mới `tests/Feature/PromotionAvailableTest.php`)

**Interfaces:**
- Consumes: `matchesConditions`, `quotaOk`, `estimateDiscount` (private methods đã có trong PromotionEngine)
- Produces: `PromotionEngine::candidates(iterable $lines, float $subtotal): array` trả `[{id, name, code, estimated_discount}]`
- Produces: `POST /staff/pos/available-promotions` → `{ ok: true, promotions: [{id, name, code, estimated_discount}] }`

- [ ] **Step 1: Viết failing test**

Tạo `tests/Feature/PromotionAvailableTest.php`:

```php
<?php

test('available-promotions tra danh sach promotion type=promotion khop dieu kien + estimated_discount', function () {
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'discount_percent', 10);
    $coupon = promoV2(['type' => 'coupon', 'code' => 'AV1'.substr(uniqid(), -4)]);
    addAction($coupon, 'discount_amount', 5000);

    $res = $this->actingAs(posStaff())->postJson('/staff/pos/available-promotions', [
        'subtotal' => 100000,
        'items' => [['menu_item_id' => 1, 'quantity' => 1]], // menu_item_id không tồn tại sẽ fail validation
    ]);
    // dùng items thật
    $item = posMenuItem(['price' => 100000]);
    $res = $this->actingAs(posStaff())->postJson('/staff/pos/available-promotions', [
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ]);

    $res->assertOk();
    $data = $res->json();
    expect($data['ok'])->toBeTrue();
    $ids = array_column($data['promotions'], 'id');
    expect($ids)->toContain($p->id);
    expect($ids)->not->toContain($coupon->id); // coupon không nằm trong danh sách auto
});

test('available-promotions khong increment used_count', function () {
    $p = promoV2(['type' => 'promotion', 'max_usage' => 5]);
    addAction($p, 'discount_percent', 10);
    $item = posMenuItem(['price' => 100000]);

    $this->actingAs(posStaff())->postJson('/staff/pos/available-promotions', [
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ])->assertOk();

    expect($p->fresh()->used_count)->toBe(0);
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionAvailableTest'`
Expected: FAIL — endpoint 404 / `candidates` chưa có.

- [ ] **Step 3: Thêm `PromotionEngine::candidates`**

Trong `PromotionEngine.php` (sau method `estimateDiscount`):
```php
public static function candidates(iterable $lines, float $subtotal): array
{
    $lines = collect($lines);

    return Promotion::query()
        ->where('type', 'promotion')
        ->where('status', true)
        ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', now()))
        ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', now()))
        ->with(['conditions', 'actions'])
        ->get()
        ->filter(fn ($p) => self::matchesConditions($p, $lines, $subtotal) && self::quotaOk($p))
        ->map(fn ($p) => [
            'id' => $p->id,
            'name' => $p->name,
            'code' => $p->code,
            'estimated_discount' => self::estimateDiscount($p, $lines, $subtotal),
        ])
        ->values()
        ->all();
}
```

- [ ] **Step 4: Thêm `PaymentController::availablePromotions`**

Thêm method mới:
```php
public function availablePromotions(Request $request)
{
    $validated = $request->validate([
        'subtotal' => 'nullable|numeric|min:0',
        'items' => 'nullable|array',
        'items.*.menu_item_id' => ['required_with:items', 'integer', Rule::exists('menu_items', 'id')->whereNull('deleted_at')],
        'items.*.quantity' => 'required_with:items|integer|min:1',
    ]);

    $lines = collect($validated['items'] ?? [])->map(function ($it) {
        $mi = MenuItem::find($it['menu_item_id']);
        return [
            'order_item_id' => null,
            'menu_item_id' => (int) $it['menu_item_id'],
            'quantity' => (int) ($it['quantity'] ?? 0),
            'subtotal' => (float) $it['quantity'] * (float) ($mi?->price ?? 0),
            'category_id' => $mi?->category_id,
        ];
    });

    if ($lines->isEmpty()) {
        $lines = collect([[
            'order_item_id' => null,
            'menu_item_id' => null,
            'quantity' => 0,
            'subtotal' => (float) ($validated['subtotal'] ?? 0),
            'category_id' => null,
        ]]);
    }

    $linesSubtotal = $lines->sum('subtotal');
    $candidates = PromotionEngine::candidates($lines, (float) $linesSubtotal);

    return response()->json(['ok' => true, 'promotions' => $candidates]);
}
```

- [ ] **Step 5: Thêm route**

`routes/web.php` — sau dòng 172 (`validate-promotion`):
```php
Route::post('/pos/available-promotions', [PaymentController::class, 'availablePromotions'])->middleware('permission:pos.create');
```

- [ ] **Step 6: Cập nhật `validatePromotion` nhận `selected_promotion_id`**

Trong `PaymentController::validatePromotion`, thêm vào validation (dòng ~29-37):
```php
'selected_promotion_id' => ['nullable', 'integer', Rule::exists('promotions', 'id')->whereNull('deleted_at')],
```

Đổi dòng gọi resolveAll (dòng ~65):
```php
$resolved = PromotionEngine::resolveAll($codes, $lines, (float) $linesSubtotal, false, $validated['selected_promotion_id'] ?? null);
```

Thêm test vào `tests/Feature/PromotionAvailableTest.php`:
```php
test('validate-promotion nhan selected_promotion_id: tra discount dung promotion da chon', function () {
    $pBig = promoV2(['type' => 'promotion']);
    addAction($pBig, 'discount_amount', 20000);
    $pSmall = promoV2(['type' => 'promotion']);
    addAction($pSmall, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 100000]);

    $res = $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => null,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        'selected_promotion_id' => $pSmall->id,
    ])->assertOk();

    expect($res->json('discount_amount'))->toBe(5000.0);
});
```

- [ ] **Step 7: Chạy tests**

Run: `php artisan test --filter='PromotionAvailableTest'`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php app/Http/Controllers/Staff/PaymentController.php routes/web.php tests/Feature/PromotionAvailableTest.php
git commit -m "feat: endpoint available-promotions + validate-promotion nhan selected_promotion_id"
```

---

### Task 5: Fix double-count revenue — phân bổ theo tỷ trọng discount

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php` (upsert daily_promotion_stats, dòng ~287-312)
- Modify: `app/Console/Commands/AggregateDailyPromotionStats.php`
- Test: `tests/Feature/PromotionAnalyticsTest.php` (thêm test) + test hiện có

**Interfaces:**
- Consumes: `$appliedPromotions` (mỗi phần tử có `promotion` + `amount`), `$invoiceTotal`, `$promotionRows`
- Produces: `daily_promotion_stats.revenue` = phân bổ tỷ trọng, tổng revenue per invoice = đúng 1 lần `$invoiceTotal`

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/PromotionAnalyticsTest.php`:

```php
test('revenue daily_promotion_stats khong double-count khi 1 hoa don dung nhieu promotion', function () {
    $admin = posAdmin();
    $auto = promoV2(['type' => 'promotion']);
    addAction($auto, 'discount_percent', 10);          // giảm 10%
    $coupon = promoV2(['type' => 'coupon', 'code' => 'DC'.substr(uniqid(), -5)]);
    addAction($coupon, 'discount_amount', 5000);

    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);

    // checkout với mã coupon; auto 10% cũng áp (tổng discount = 10000 + 5000 = 15000)
    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 85000,
        'promotion_code' => $coupon->code,
    ])->assertOk();

    // Mỗi promotion có 1 row stats; tổng revenue các row = 1 lần invoiceTotal (85000)
    $rows = DB::table('daily_promotion_stats')->where('stat_date', now()->toDateString())->get();
    expect($rows->sum('revenue'))->toBe(85000.0);
    // Phân bổ tỷ trọng: auto(10k) nhận 85000×10000/15000, coupon(5k) nhận 85000×5000/15000
    $autoRow = $rows->firstWhere('promotion_id', $auto->id);
    $couponRow = $rows->firstWhere('promotion_id', $coupon->id);
    expect((float) $autoRow->revenue)->toBe(round(85000 * 10000 / 15000, 2));
    expect((float) $couponRow->revenue)->toBe(round(85000 * 5000 / 15000, 2));
});
```

Lưu ý: cần `use Illuminate\Support\Facades\DB;` ở đầu file test nếu chưa có. Kiểm tra stack ordering — nếu coupon không stack với auto (mặc định stackable=true nên stack được).

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='revenue daily_promotion_stats khong double-count'`
Expected: FAIL — tổng revenue = 170000 (double).

- [ ] **Step 3: Sửa `CheckoutService::runBulk` upsert**

Thay khối `// 7c. Upsert daily_promotion_stats (realtime)` (dòng ~287-312) bằng:

```php
// 7c. Upsert daily_promotion_stats (realtime) — revenue phân bổ theo tỷ trọng discount
$invoiceTotal = (float) $invoice->total_amount;
$totalDiscountThisInvoice = (float) collect($appliedPromotions)->sum('amount');
$statDate = now()->toDateString();
foreach ($appliedPromotions as $idx => $pr) {
    $promo = $pr['promotion'];
    $promoAmount = (float) $pr['amount'];
    $revenueShare = 0.0;
    if ($totalDiscountThisInvoice > 0) {
        $revenueShare = round($invoiceTotal * $promoAmount / $totalDiscountThisInvoice, 2);
    } elseif ($idx === 0) {
        $revenueShare = round($invoiceTotal, 2);
    }
    // Đảm bảo tổng revenue khớp chính xác invoiceTotal (đơn cuối nhận phần dư)
    if ($idx === count($appliedPromotions) - 1) {
        $sumPrior = round(collect($appliedPromotions)->take($idx)->sum(fn ($x) => round($invoiceTotal * (float) $x['amount'] / max($totalDiscountThisInvoice, 1), 2)), 2);
        $revenueShare = round($invoiceTotal - $sumPrior, 2);
    }

    $attrs = ['promotion_id' => $promo->id, 'stat_date' => $statDate];
    $row = DB::table('daily_promotion_stats')->where($attrs)->first();
    if ($row) {
        DB::table('daily_promotion_stats')->where($attrs)->update([
            'order_count' => DB::raw('order_count + 1'),
            'unique_orders' => DB::raw('unique_orders + 1'),
            'revenue' => DB::raw('revenue + '.$revenueShare),
            'discount_total' => DB::raw('discount_total + '.round($promoAmount, 2)),
            'updated_at' => now(),
        ]);
    } else {
        DB::table('daily_promotion_stats')->insert(array_merge($attrs, [
            'order_count' => 1,
            'unique_orders' => 1,
            'revenue' => $revenueShare,
            'discount_total' => round($promoAmount, 2),
            'created_at' => now(),
            'updated_at' => now(),
        ]));
    }
}
```

- [ ] **Step 4: Chạy test xác nhận pass**

Run: `php artisan test --filter='revenue daily_promotion_stats khong double-count'`
Expected: PASS.

- [ ] **Step 5: Sửa `AggregateDailyPromotionStats`**

Thay toàn bộ logic revenue trong command (bước 1, dòng ~20-30) bằng phân bổ tỷ trọng:

```php
// 1) Phân bổ revenue theo tỷ trọng discount: mỗi invoice 1 lần, không nhân N
$invoiceLines = DB::table('order_promotions')
    ->join('invoices', 'invoices.id', '=', 'order_promotions.invoice_id')
    ->whereDate('order_promotions.created_at', $yesterday)
    ->whereNotNull('order_promotions.promotion_id')
    ->select(
        'order_promotions.promotion_id',
        'order_promotions.invoice_id',
        'invoices.total_amount as total',
        'order_promotions.discount_applied as discount'
    )
    ->get();

$revenueByPromo = [];
foreach ($invoiceLines->groupBy('invoice_id') as $invoiceGroup) {
    $invoiceTotal = (float) $invoiceGroup->first()->total;
    $invoiceDiscount = (float) $invoiceGroup->sum('discount');
    foreach ($invoiceGroup as $line) {
        $promoId = (int) $line->promotion_id;
        $share = $invoiceDiscount > 0
            ? round($invoiceTotal * (float) $line->discount / $invoiceDiscount, 2)
            : ($line->discount > 0 ? round($invoiceTotal, 2) : 0.0);
        $revenueByPromo[$promoId] = ($revenueByPromo[$promoId] ?? 0.0) + $share;
    }
}
```

Dòng sử dụng (dòng ~51): `'revenue' => $revenueByPromo->get(...)` → đổi thành `$revenueByPromo[(int) $row->promotion_id] ?? 0.0`.

- [ ] **Step 6: Chạy test command aggregate**

Run: `php artisan test --filter='PromotionAnalyticsTest'`
Expected: PASS (test rebuild hiện có vẫn đúng — 1 invoice 1 promotion không đổi; test mới phủ trường hợp nhiều promotion).

- [ ] **Step 7: Commit**

```bash
git add app/Services/Checkout/CheckoutService.php app/Console/Commands/AggregateDailyPromotionStats.php tests/Feature/PromotionAnalyticsTest.php
git commit -m "fix: daily_promotion_stats revenue phan bo theo ty trong discount, het double-count"
```

---

### Task 6: Fix lỗi % pie chart + làm rõ label StatsCards

**Files:**
- Modify: `resources/js/pages/manager/promotions/components/PromotionAnalyticsCharts.tsx:33`
- Test: không có test tự động riêng — kiểm tra bằng build + visual

- [ ] **Step 1: Sửa label pie chart**

Trong `PromotionAnalyticsCharts.tsx`, dòng 33 — đổi:
```jsx
label={({ percent = 0 }) => `${(percent * 100).toFixed(0)}%`}
```
thành:
```jsx
label={({ percent = 0 }) => `${Number(percent).toFixed(0)}%`}
```

- [ ] **Step 2: Kiểm tra TypeScript + build**

Run: `npm run types:check && npm run build`
Expected: PASS, không lỗi.

- [ ] **Step 3: Commit**

```bash
git add resources/js/pages/manager/promotions/components/PromotionAnalyticsCharts.tsx
git commit -m "fix: pie chart promotion hien dung % (recharts v3 tra 0-100)"
```

---

### Task 7: Campaign Performance — index thêm revenue/discount_total + endpoint invoices

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php` (`index` + method mới `invoices`)
- Modify: `routes/web.php` (route)
- Test: `tests/Feature/PromotionControllerTest.php`

**Interfaces:**
- Produces: campaign payload mới có thêm `revenue`, `discount_total`
- Produces: `GET /manager/promotions/{promotion}/invoices` → `{ invoices: [{id, invoice_code, issued_at, table_name, subtotal_amount, discount_amount, total_amount, payment_method}] }`

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/PromotionControllerTest.php`:

```php
test('index tra revenue + discount_total cho tung campaign', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);
    $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 95000,
    ])->assertOk();

    $this->get('/manager/promotions')->assertInertia(fn ($page) => $page->component('manager/promotions/PromotionsManager')
        ->where('promotions.0.id', $p->id)
        ->where('promotions.0.revenue', 95000.0)
        ->where('promotions.0.discount_total', 5000.0));
});

test('promotion invoices endpoint tra danh sach hoa don da dung ma', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'coupon', 'code' => 'INVX'.substr(uniqid(), -4)]);
    addAction($p, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);
    $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 95000, 'promotion_code' => $p->code,
    ])->assertOk();

    $res = $this->getJson("/manager/promotions/{$p->id}/invoices")->assertOk();
    expect($res->json('invoices'))->toHaveCount(1);
    expect($res->json('invoices.0.discount_amount'))->toBe(5000.0);
});
```

Lưu ý: `where('promotions.0.revenue', ...)` phụ thuộc thứ tự sắp xếp (`latest('id')` → campaign vừa tạo đứng đầu). Kiểm tra ordering khi implement.

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionControllerTest'`
Expected: FAIL — thiếu `revenue`/`discount_total` trong payload; endpoint 404.

- [ ] **Step 3: Cập nhật `PromotionController::index`**

Trong `index`, sau khi map promotions (trước `return Inertia::render`), thêm query revenue/discount:
```php
$revenueAgg = DB::table('daily_promotion_stats')
    ->select('promotion_id',
        DB::raw('SUM(revenue) as revenue'),
        DB::raw('SUM(discount_total) as discount_total'))
    ->groupBy('promotion_id')
    ->get()
    ->keyBy('promotion_id');

$promotions = $promotions->map(function ($p) use ($revenueAgg) {
    $agg = $revenueAgg->get($p['id']);
    $p['revenue'] = $agg ? (float) $agg->revenue : 0.0;
    $p['discount_total'] = $agg ? (float) $agg->discount_total : 0.0;
    return $p;
});
```

- [ ] **Step 4: Thêm method `invoices`**

```php
public function invoices(Promotion $promotion): JsonResponse
{
    $invoices = InvoicePromotion::query()
        ->where('promotion_id', $promotion->id)
        ->join('invoices', 'invoices.id', '=', 'invoice_promotions.invoice_id')
        ->select('invoices.id', 'invoices.invoice_code', 'invoices.issued_at', 'invoices.table_name',
            'invoices.subtotal_amount', 'invoices.discount_amount', 'invoices.total_amount', 'invoices.payment_method')
        ->orderBy('invoices.issued_at', 'desc')
        ->get();

    return response()->json(['invoices' => $invoices]);
}
```

Thêm `use App\Models\InvoicePromotion;` nếu chưa có.

- [ ] **Step 5: Thêm route**

`routes/web.php` — sau dòng 118 (`analytics`):
```php
Route::get('/promotions/{promotion}/invoices', [PromotionController::class, 'invoices'])->middleware('permission:promotions.view');
```

- [ ] **Step 6: Chạy tests**

Run: `php artisan test --filter='PromotionControllerTest'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Manager/PromotionController.php routes/web.php tests/Feature/PromotionControllerTest.php
git commit -m "feat: campaign performance them revenue/discount_total + endpoint danh sach hoa don da dung ma"
```

---

### Task 8: DataTable — header căn giữa không bị chevron làm lệch

**Files:**
- Modify: `resources/js/components/DataTable.tsx:127-145`

- [ ] **Step 1: Sửa render header**

Trong `DataTable.tsx`, khối `<th>` (dòng 128-145) — thay phần nội dung:

```jsx
<th
    key={col.key}
    onClick={col.sortable ? () => handleSort(col.key) : undefined}
    className={`relative px-4 ${isCompact ? 'py-2 text-xs' : 'py-3.5'} ${alignClass(col.align)} ${col.headerClassName ?? ''} ${col.sortable ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800' : ''} ${col.hideWhenCompact && isCompact ? 'hidden' : ''}`}
>
    <div
        className={`flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}
    >
        <span className="flex-1">{col.header}</span>
        {col.sortable && (
            <span className={`shrink-0 ${col.align === 'center' ? 'absolute right-2' : ''}`}>
                {renderSortIcon(col.key)}
            </span>
        )}
    </div>
</th>
```

Giải thích: với `center`, icon được absolute positioning sang lề phải → text căn giữa theo toàn bộ ô không bị đẩy. Với `left`/`right`, icon vẫn sát text như cũ.

- [ ] **Step 2: Kiểm tra build**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 3: Kiểm tra visual các bảng dùng DataTable**

Các trang dùng `DataTable` hiện có (tìm `import DataTable`): đảm bảo header center (vd Loại, số đơn) không còn lệch.
Kiểm tra thủ công trong browser trang Khuyến mãi sau khi hoàn tất Task 9.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/DataTable.tsx
git commit -m "fix: DataTable header center khong bi chevron sort lam lech chu"
```

---

### Task 9: Frontend — usePOSCheckout state + PaymentDrawer hiển thị promotion

**Files:**
- Modify: `resources/js/pages/staff/pos/hooks/usePOSCheckout.ts`
- Modify: `resources/js/pages/staff/pos/components/PaymentDrawer.tsx`
- Modify: `resources/js/pages/staff/pos/types/pos.types.ts` (POSManagerProps thêm `promotions`)
- Modify: `resources/js/pages/staff/pos/POSManager.tsx` (truyền props)
- Modify: `app/Http/Controllers/Staff/POSController.php` (đã thêm props ở Task 3 — không cần sửa lại, chỉ chắc chắn `pos.types.ts` khớp)

**Interfaces:**
- Consumes: props `promotions` từ POSManager (Task 3); endpoint `/staff/pos/validate-promotion` (đã có, giữ nguyên)
- Produces: `usePOSCheckout` trả thêm `availablePromotions`, `selectedAutoId`, `setSelectedAutoId`, `appliedPromotions`, `totalDiscount`; PaymentDrawer props mới `promotions`, `selectedAutoId`, `onSelectAuto`, `appliedPromotions`, `totalDiscount`

- [ ] **Step 1: Cập nhật `pos.types.ts`**

```ts
export interface POSManagerProps {
    tables: POSTableData[];
    categories: CategoryData[];
    products: POSProductData[];
    promotions: PromotionCandidate[];
}

export interface PromotionCandidate {
    id: number;
    name: string;
    code: string | null;
    estimated_discount: number;
}
```

- [ ] **Step 2: Cập nhật `usePOSCheckout.ts`**

Hook nhận thêm tham số `promotions` (từ POSManager props, nạp cache ở Task 3):
```ts
export function usePOSCheckout(
    selectedTable: POSTableData | null = null,
    tables: POSTableData[] = [],
    promotions: PromotionCandidate[] = []
) {
```

Thay state promotion cũ (thêm state mới, **giữ lại** `promotionName`/`promotionDiscount` vì ReceiptPrintModal vẫn dùng):
```ts
const [availablePromotions, setAvailablePromotions] = useState<PromotionCandidate[]>(promotions);
const [selectedAutoId, setSelectedAutoId] = useState<number | null>(null);
const [appliedPromotions, setAppliedPromotions] = useState<{ id: number; name: string; code: string | null; discount_amount: number }[]>([]);
const [totalDiscount, setTotalDiscount] = useState(0);
const [promotionCode, setPromotionCode] = useState<string | null>(null);
const [promotionDiscount, setPromotionDiscount] = useState(0);   // GIỮ — ReceiptPrintModal dùng
const [promotionName, setPromotionName] = useState<string | null>(null);  // GIỮ — ReceiptPrintModal dùng
```

Import `PromotionCandidate` từ `../types/pos.types`. Lưu ý: nếu `promotions` prop thay đổi (sau router.reload), cập nhật qua `useEffect`:
```ts
useEffect(() => {
    setAvailablePromotions(promotions);
    if (promotions.length > 0 && selectedAutoId === null) {
        // mặc định chọn promotion ước tính cao nhất
        setSelectedAutoId(promotions.reduce((best, p) => (p.estimated_discount > (best?.estimated_discount ?? -1) ? p : best), promotions[0])?.id ?? null);
    }
}, [promotions]);
```

Sửa `clearPromotion`:
```ts
const clearPromotion = () => {
    setPromotionCode(null);
    setAppliedPromotions([]);
    setTotalDiscount(0);
    setPromotionName(null);
    setPromotionDiscount(0);
};
```

Thêm hàm sync applied promotions (gọi chung sau mỗi lần validate):
```ts
const syncApplied = (data: any) => {
    setTotalDiscount(Number(data.discount_amount) || 0);
    setPromotionDiscount(Number(data.discount_amount) || 0); // giữ cho ReceiptPrintModal
    const list = Array.isArray(data.promotions) && data.promotions.length
        ? data.promotions.map((x: any) => ({ id: x.id, name: x.name, code: x.code ?? null, discount_amount: Number(x.discount_amount) || 0 }))
        : [];
    setAppliedPromotions(list);
    setPromotionName(data.promotion?.name ?? null); // giữ cho ReceiptPrintModal
    if (!list.some((x: any) => x.code === null)) {
        setPromotionCode(null);
    }
};
```

Sửa `applyPromotion` — trong nhánh `response.ok`:
```ts
if (response.ok && data.ok) {
    setPromotionCode(code);
    syncApplied(data);
    return { ok: true, discount_amount: data.discount_amount, total: data.total };
}
```

Thêm `applyAutoPromotions` (gọi khi mở drawer, không cần mã):
```ts
const applyAutoPromotions = async (
    subtotal: number,
    items: { menu_item_id: number; quantity: number; unit_price: number }[] = []
) => {
    const csrfToken = getCsrfTokenFromCookie();
    try {
        const response = await fetch('/staff/pos/validate-promotion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': csrfToken, 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ subtotal, items, selected_promotion_id: selectedAutoId }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.ok) syncApplied(data);
    } catch { /* bỏ qua */ }
};
```

Sửa `handleConfirmPayment` và `handleBulkCheckout` payload — thêm:
```js
...(selectedAutoId ? { selected_promotion_id: selectedAutoId } : {}),
```

Return thêm: `availablePromotions, selectedAutoId, setSelectedAutoId, appliedPromotions, totalDiscount, applyAutoPromotions`.

- [ ] **Step 3: Cập nhật `PaymentDrawer.tsx`**

Props mới:
```ts
promotions: PromotionCandidate[];
selectedAutoId: number | null;
onSelectAuto: (id: number | null) => void;
appliedPromotions: { id: number; name: string; code: string | null; discount_amount: number }[];
totalDiscount: number;
```

Đổi `discountedTotal = Math.max(0, totalAmount - promotionDiscount)` → `Math.max(0, totalAmount - totalDiscount)`. Các nơi dùng `promotionDiscount` đổi sang `totalDiscount`.

Thay khu "Mã khuyến mãi" (dòng ~254-280) thành:
```jsx
{mode === 'payment' && onApplyPromotion && (
    <div className="space-y-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <Ticket className="h-4 w-4 text-sky-600 stroke-[1.5]" />
            Khuyến mãi tự động (Promotion)
        </div>
        <select
            value={selectedAutoId ?? ''}
            onChange={(e) => onSelectAuto(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        >
            <option value="">Chọn promotion...</option>
            {promotions.map((p) => (
                <option key={p.id} value={p.id}>
                    {p.name} {p.estimated_discount > 0 ? `(−${p.estimated_discount.toLocaleString('vi-VN')}đ)` : ''}
                </option>
            ))}
        </select>

        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <Tag className="h-4 w-4 text-sky-600 stroke-[1.5]" />
            Mã coupon / voucher
        </div>
        <div className="flex gap-2">
            <input value={promotionInput} onChange={(e) => setPromotionInput(e.target.value.toUpperCase())} disabled={promotionApplied}
                placeholder="Nhập mã…"
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-semibold uppercase outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-800" />
            {promotionApplied ? (
                <button type="button" onClick={() => { onClearPromotion?.(); setPromotionInput(''); setPromotionError(null); }} className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-zinc-700">Hủy mã</button>
            ) : (
                <button type="button" onClick={handlePromotion} disabled={promotionLoading || promotionInput.trim() === ''} className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    {promotionLoading ? 'Đang áp…' : 'Áp dụng'}
                </button>
            )}
        </div>
        {promotionError && <p className="text-xs text-rose-500">{promotionError}</p>}

        {appliedPromotions.length > 0 && (
            <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                {appliedPromotions.map((ap, i) => (
                    <div key={i} className="flex justify-between text-xs text-rose-600 dark:text-rose-400">
                        <span>{ap.name}</span>
                        <span className="tabular-nums">−{ap.discount_amount.toLocaleString('vi-VN')} đ</span>
                    </div>
                ))}
            </div>
        )}
    </div>
)}
```

Bỏ khối tổng tiền cũ có `promotionApplied` dòng duy nhất (dòng ~292-297) — thay bằng tổng giảm từ `totalDiscount`:
```jsx
{mode === 'payment' && totalDiscount > 0 && (
    <div className="flex justify-between border-t border-sky-200/60 pt-2 text-xs font-semibold text-rose-600 dark:border-sky-800/60 dark:text-rose-400">
        <span>Tổng giảm khuyến mãi:</span>
        <span className="tabular-nums">−{totalDiscount.toLocaleString('vi-VN')} đ</span>
    </div>
)}
```

- [ ] **Step 4: Cập nhật `POSManager.tsx`**

`safePromotions = (Array.isArray(promotions) ? promotions : Object.values(promotions || {})) as PromotionCandidate[]`.

Truyền `promotions` vào hook (dòng ~201):
```jsx
const {
    ...
    handleBulkCheckout,
} = usePOSCheckout(selectedTable, safeTables, safePromotions);
```

Thêm `useEffect` gọi `applyAutoPromotions` khi drawer mở payment (sau khi có cart items) — tính subtotal/items từ cart hiện tại:
```jsx
const paymentCart = paymentMode === 'bulk' && drawerMode === 'payment' ? bulkCartItems : currentCart;

useEffect(() => {
    if (isPaymentDrawerOpen && drawerMode === 'payment' && paymentCart.length > 0) {
        const subtotal = paymentCart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        applyAutoPromotions(subtotal, paymentCart.map((item) => ({
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
        })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isPaymentDrawerOpen, drawerMode]);
```

Truyền props mới vào PaymentDrawer:
```jsx
<PaymentDrawer
    ...
    promotions={safePromotions}
    selectedAutoId={selectedAutoId}
    onSelectAuto={setSelectedAutoId}
    appliedPromotions={appliedPromotions}
    totalDiscount={totalDiscount}
/>
```
Đồng thời lấy các state mới từ `usePOSCheckout` trong destructuring (thêm `availablePromotions`, `selectedAutoId`, `setSelectedAutoId`, `appliedPromotions`, `totalDiscount`, `applyAutoPromotions`).

- [ ] **Step 5: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 6: Kiểm tra thủ công**

Chạy app, mở POS → chọn bàn có đơn → thanh toán: thấy danh sách promotion auto, chọn cái, nhập mã coupon → tổng tiền khớp từng dòng giảm. Kiểm tra discount thực tế sau checkout = hiển thị.

- [ ] **Step 7: Commit**

```bash
git add resources/js/pages/staff/pos/hooks/usePOSCheckout.ts resources/js/pages/staff/pos/components/PaymentDrawer.tsx resources/js/pages/staff/pos/types/pos.types.ts resources/js/pages/staff/pos/POSManager.tsx
git commit -m "feat: PaymentDrawer hien thi tung promotion + chon auto promotion, tong tien khop checkout"
```

---

### Task 10: Frontend — Campaign Performance dùng DataTable + modal hoá đơn

**Files:**
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx`
- Create: `resources/js/pages/manager/promotions/components/PromotionInvoicesModal.tsx`

**Interfaces:**
- Consumes: campaign payload có `revenue`/`discount_total` (Task 7); endpoint `GET /manager/promotions/{id}/invoices` (Task 7); `DataTable` component (đã sửa ở Task 8)
- Produces: `PromotionInvoicesModal({ isOpen, onClose, promotionId })`

- [ ] **Step 1: Cập nhật `PromotionsManager.tsx`**

Thêm field vào `PromotionData`:
```ts
revenue: number;
discount_total: number;
```

Import:
```ts
import DataTable, { DataTableColumn } from '../../../../components/DataTable';
import { Pencil, Eye } from 'lucide-react';
import PromotionInvoicesModal from './components/PromotionInvoicesModal';
```

State:
```ts
const [invoiceView, setInvoiceView] = useState<number | null>(null);
```

Định nghĩa columns:
```tsx
const columns: DataTableColumn<PromotionData>[] = [
    { key: 'name', header: 'Mã / Tên chiến dịch', render: (p) => (
        <div>
            <div className="font-medium text-zinc-900 dark:text-zinc-100">{p.code || `KM_${p.id}`}</div>
            <div className="text-xs text-zinc-500">{p.name}</div>
        </div>
    )},
    { key: 'type', header: 'Loại', align: 'center', sortable: true, render: (p) => (
        <span className={`px-2.5 py-1 rounded text-xs font-medium ${TYPE_CLASS[p.type]}`}>{TYPE_LABEL[p.type]}</span>
    )},
    { key: 'used_count', header: 'Số đơn', align: 'center', sortable: true, render: (p) => <span className="font-medium tabular-nums">{p.used_count}</span> },
    { key: 'revenue', header: 'Tổng doanh thu', align: 'center', sortable: true, render: (p) => <span className="tabular-nums">{(p.revenue ?? 0).toLocaleString('vi-VN')} đ</span> },
    { key: 'discount_total', header: 'Tổng giảm giá', align: 'center', sortable: true, render: (p) => <span className="tabular-nums">{(p.discount_total ?? 0).toLocaleString('vi-VN')} đ</span> },
    { key: 'perf', header: 'Hiệu suất', align: 'center', render: (p) => {
        const perf = p.max_usage ? Math.min(100, Math.round((p.used_count / p.max_usage) * 100)) : null;
        return perf === null ? <span className="text-xs text-zinc-400">—</span> : (
            <div className="flex items-center gap-2">
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-sky-600 h-full rounded-full" style={{ width: `${perf}%` }} />
                </div>
                <span className="text-xs font-medium text-sky-600 w-8 text-right">{perf}%</span>
            </div>
        );
    }},
    { key: 'actions', header: 'Thao tác', align: 'center', render: (p) => (
        <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setEditing(p); setDrawerOpen(true); }} title="Sửa"
                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">
                <Pencil className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setInvoiceView(p.id)} title="Xem hoá đơn đã dùng mã"
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <Eye className="w-4 h-4" />
            </button>
        </div>
    )},
];
```

Thay khối bảng (dòng ~127-177) bằng:
```tsx
<div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
    <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Campaign Performance</h3>
    </div>
    <div className="p-3">
        <DataTable<PromotionData>
            columns={columns}
            rows={promotions}
            rowKey={(p) => p.id}
            emptyMessage="Chưa có chiến dịch nào"
            defaultSortKey="id"
            defaultSortDirection="desc"
            getSortValue={(p, key) => {
                if (key === 'name') return p.name;
                if (key === 'type') return p.type;
                if (key === 'revenue') return p.revenue ?? 0;
                if (key === 'discount_total') return p.discount_total ?? 0;
                if (key === 'used_count') return p.used_count;
                return p.id;
            }}
        />
    </div>
</div>
```

Render modal:
```tsx
<PromotionInvoicesModal isOpen={invoiceView !== null} onClose={() => setInvoiceView(null)} promotionId={invoiceView} />
```

- [ ] **Step 2: Tạo `PromotionInvoicesModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import DataTable, { DataTableColumn } from '../../../../components/DataTable';

interface InvoiceRow {
    id: number;
    invoice_code: string;
    issued_at: string;
    table_name: string;
    subtotal_amount: number;
    discount_amount: number;
    total_amount: number;
    payment_method: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotionId: number | null;
}

export default function PromotionInvoicesModal({ isOpen, onClose, promotionId }: Props) {
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || promotionId === null) return;
        setLoading(true);
        fetch(`/manager/promotions/${promotionId}/invoices`, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => setInvoices(data.invoices || []))
            .catch(() => setInvoices([]))
            .finally(() => setLoading(false));
    }, [isOpen, promotionId]);

    if (!isOpen) return null;

    const columns: DataTableColumn<InvoiceRow>[] = [
        { key: 'invoice_code', header: 'Mã hoá đơn', render: (i) => <span className="font-medium">{i.invoice_code}</span> },
        { key: 'issued_at', header: 'Thời gian', render: (i) => new Date(i.issued_at).toLocaleString('vi-VN') },
        { key: 'table_name', header: 'Bàn', align: 'center', render: (i) => i.table_name || 'Mang đi' },
        { key: 'subtotal_amount', header: 'Tổng tiền', align: 'right', render: (i) => `${Number(i.subtotal_amount).toLocaleString('vi-VN')} đ` },
        { key: 'discount_amount', header: 'Tiền giảm', align: 'right', render: (i) => `−${Number(i.discount_amount).toLocaleString('vi-VN')} đ` },
        { key: 'total_amount', header: 'Thực thu', align: 'right', render: (i) => <span className="font-semibold">{Number(i.total_amount).toLocaleString('vi-VN')} đ</span> },
        { key: 'payment_method', header: 'PTTT', align: 'center', render: (i) => ({ cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', e_wallet: 'Ví điện tử', mixed: 'Hỗn hợp' })[i.payment_method] || i.payment_method },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-auto p-6">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-5">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Hoá đơn đã dùng mã</h3>
                    <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {loading ? (
                    <div className="py-10 text-center text-sm text-zinc-500">Đang tải...</div>
                ) : (
                    <DataTable<InvoiceRow>
                        columns={columns}
                        rows={invoices}
                        rowKey={(i) => i.id}
                        emptyMessage="Chưa có hoá đơn nào dùng mã này"
                        showCompactToggle={false}
                    />
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 4: Kiểm tra thủ công**

Trang Khuyến mãi: ấn dòng không mở drawer; ấn icon pencil mở sửa; ấn icon eye mở modal hoá đơn; các cột căn giữa đúng; header không lệch.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/manager/promotions/PromotionsManager.tsx resources/js/pages/manager/promotions/components/PromotionInvoicesModal.tsx
git commit -m "feat: Campaign Performance dung DataTable + modal danh sach hoa don da dung ma"
```

---

### Task 11: Test toàn diện + cleanup

**Files:**
- Toàn bộ thay đổi ở trên

- [ ] **Step 1: Chạy toàn bộ test suite PHP**

Run: `php artisan test`
Expected: PASS (tất cả).

- [ ] **Step 2: Type check + build + lint các file sửa**

Run: `npm run types:check && npm run build`
Run: `npx eslint resources/js/components/DataTable.tsx resources/js/pages/manager/promotions/ resources/js/pages/staff/pos/`
Expected: không có lỗi mới do thay đổi (bỏ qua lỗi style pre-existing không liên quan).

- [ ] **Step 3: Rebuild dữ liệu analytics cũ (đã bị double-count)**

Run: `php artisan promotions:aggregate-daily` — rebuild ngày hôm qua. Nếu cần rebuild thêm ngày khác, chạy lại hoặc dọn thủ công bảng `daily_promotion_stats` cho các ngày cần.

- [ ] **Step 4: Kiểm tra git status & commit cuối**

```bash
git status
```
Đảm bảo không có file tạm, không có thay đổi ngoài phạm vi. Nếu còn thay đổi chưa commit → commit riêng theo task tương ứng.
