# Hoàn thiện Minor + cấu trúc controllers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện 9 Minor/cấu trúc còn lại: bỏ double dispatch TableStatusUpdated, đồng bộ payment_method, change_amount nullable, bỏ magic 'served', xóa resolvePromotion dead, dùng trait thay 2 duplicate, extract image-delete, gộp status strings thành constants.

**Architecture:** Mỗi fix độc lập, TDD cho các thay đổi hành vi (1a/1b/1c/1d/2a); refactor thuần (trait/constants/extract) chỉ regression. Constants trên `Order` model; traits có sẵn trong `Concerns/`.

**Tech Stack:** Laravel 11, PHP, Pest.

**Spec:** `docs/superpowers/specs/2026-08-07-controllers-minor-structural-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` như lệnh đơn.
- Mỗi task TDD: test RED (nếu đổi hành vi) → implement → pass → commit riêng.
- Test helpers trong `tests/Pest.php`: `posAdmin`, `posStaff`, `posTable`, `posMenuItem`, `posOrder`.
- **KHÔNG đổi hành vi báo cáo / shape frontend.**
- Refactor thuần (constants/trait/extract): không cần test mới, chỉ full regression.
- 1e (rewrite reservation_* edge hiếm) KHÔNG làm — follow-up.
- `ServingController:65` 'served' là audit action, KHÔNG đụng.
- Commit trên branch `feat/fix-critical-kitchen-deposit-auth` (đã có 6 commit Critical/Important/Auth + spec/plan).

---

## File Structure

**Sửa:**
- `app/Models/Order.php` — thêm 2 constants
- `app/Http/Controllers/Staff/PaymentController.php` — 1a (dispatch), 1b (e_wallet), 1c (change_amount), 2a (xóa resolvePromotion)
- `app/Http/Controllers/Staff/ReservationController.php` — 1d (bỏ 'served')
- `app/Http/Controllers/Staff/KitchenController.php` — 2b (trait DispatchesSafely)
- `app/Http/Controllers/Manager/TableController.php` — 2c (trait GeneratesOrderCode)
- `app/Http/Controllers/Manager/ProductController.php` — 2d (extract image-delete)
- 6 controllers thay status literal bằng constants (2e): PaymentController, ReservationController, KitchenController, POSController, ServingController(no — audit), TableOperationController, OrderListController
- `tests/Feature/POSPromotionRejectReasonTest.php` — 2a chuyển sang engine

---

## Task 1: 2e — Order constants + thay 14 chỗ status literal

**Files:**
- Modify: `app/Models/Order.php`, `app/Http/Controllers/Staff/PaymentController.php`, `app/Http/Controllers/Staff/ReservationController.php`, `app/Http/Controllers/Staff/KitchenController.php`, `app/Http/Controllers/Staff/POSController.php`, `app/Http/Controllers/Staff/TableOperationController.php`, `app/Http/Controllers/Manager/OrderListController.php`

**Interfaces:**
- Produces: `Order::ACTIVE_STATUSES` = `['draft','pending','confirmed','processing','completed']`; `Order::OPERATIONAL_STATUSES` = `['draft','pending','confirmed','processing','completed','reserved']`. Các controller thay literal bằng constant.

- [ ] **Step 1: Thêm constants vào Order model**

Trong `app/Models/Order.php`, sau `use HasFactory;`:
```php
    /** Trạng thái đơn đang hoạt động (chưa paid/cancelled). */
    public const ACTIVE_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed'];

    /** Trạng thái đơn vận hành (gồm cả đặt bàn chưa check-in). */
    public const OPERATIONAL_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'];
```

- [ ] **Step 2: Thay literal bằng constants**

Dùng find-and-replace chính xác (KHÔNG dùng rename tool; đây là thay literal array):

Thay `['draft', 'pending', 'confirmed', 'processing', 'completed']` → `Order::ACTIVE_STATUSES` ở:
- `PaymentController.php:186,357`
- `KitchenController.php:308`
- `POSController.php:272,364`
- `TableOperationController.php:68,90,148,200,205`
- `OrderListController.php:40`

Thay `['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved']` → `Order::OPERATIONAL_STATUSES` ở:
- `POSController.php:52,68,90`
- `ReservationController.php:74` — literal hiện là `['draft', 'pending', 'confirmed', 'served', 'completed', 'reserved']` → thay TRỰC TIẾP bằng `Order::OPERATIONAL_STATUSES` (bỏ luôn 'served' tại đây; Task 3 sẽ xác nhận).

**Lưu ý mỗi file:** đảm bảo `use App\Models\Order;` có trong từng controller (hầu hết đã có; PaymentController/TableOperationController/OrderListController có; nếu thiếu thêm import).

- [ ] **Step 3: Chạy full suite**

Run: `php artisan test`
Expected: PASS (không đổi hành vi — chỉ thay literal bằng constant).

- [ ] **Step 4: Commit**

```bash
git add app/Models/Order.php app/Http/Controllers/Staff/PaymentController.php app/Http/Controllers/Staff/ReservationController.php app/Http/Controllers/Staff/KitchenController.php app/Http/Controllers/Staff/POSController.php app/Http/Controllers/Staff/TableOperationController.php app/Http/Controllers/Manager/OrderListController.php
git commit -m "refactor: Order status constants ACTIVE/OPERATIONAL thay literal"
```

---

## Task 2: 1a + 1b + 1c — PaymentController logic nhỏ

**Files:**
- Modify: `app/Http/Controllers/Staff/PaymentController.php`
- Test: `tests/Feature/POSCheckoutTest.php` (thêm case e_wallet + change_amount nullable)

**Interfaces:**
- Consumes: `posAdmin`, `posTable`, `posMenuItem`, `posOrder`.
- Produces: checkout chấp nhận `e_wallet`; `change_amount` nullable; TableStatusUpdated dispatch sau-commit cho cả group (không pre-commit dup).

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/Feature/POSCheckoutTest.php`:

```php
test('checkout chap nhan e_wallet va change_amount co the thieu', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);

    $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'e_wallet',
        'amount_received' => 100000,
        // KHÔNG gửi change_amount — trước đây required → 422
    ])->assertOk();
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\POSCheckoutTest.php --filter=e_wallet`
Expected: FAIL — `payment_method` validate `in:cash,bank_transfer` → 422; hoặc change_amount required → 422.

- [ ] **Step 3: Sửa validation**

Trong `PaymentController.php`:
- `:101` `'payment_method' => 'required|in:cash,bank_transfer,e_wallet'`
- `:103` `'change_amount' => 'nullable|numeric|min:0'`
- `:269` `'change_amount' => 'nullable|numeric|min:0'`

- [ ] **Step 4: Sửa 1a — bỏ dispatch pre-commit, dispatch sau-commit cho cả group**

Trong `checkout`:
1. Xóa block `:212-215` (`$this->safeDispatch(fn () => TableStatusUpdated::dispatch($grpTable, 'checkout', [...))` trong loop group table).
2. Transaction `return ['table' => $targetTable, 'deposit_total' => $depositTotal, 'deposit_refund' => $depositRefund]` (`:219`) → thêm `'all_group_tables' => $allGroupTables->values()->all()`.
3. Closure sau-commit `:228-235` → đổi thành loop cả group:
```php
            $this->safeDispatch(function () use ($result, $order, $totalAmount) {
                foreach ($result['all_group_tables'] as $grpTable) {
                    TableStatusUpdated::dispatch($grpTable, 'checkout', [
                        'order_code' => $order->order_code,
                        'total_amount' => $totalAmount,
                    ]);
                }
            });
```
(Giữ `$result` — đã có `$result['table']` ở `:224`. `$allGroupTables` là Collection → `->values()->all()` thành array để loop sau-commit.)

**Lưu ý:** `bulkCheckout` (`:394`) dispatch sau-commit 1 lần cho `$targetTable` — KHÔNG đụng (spec chỉ nói checkout).

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php tests\Feature\TableCacheTest.php`
Expected: PASS (e_wallet case mới + regression merged-table).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint app/Http/Controllers/Staff/PaymentController.php
git add app/Http/Controllers/Staff/PaymentController.php tests/Feature/POSCheckoutTest.php
git commit -m "fix: checkout e_wallet + change_amount nullable + TableStatusUpdated sau commit cho ca group"
```

---

## Task 3: 1d — bỏ magic status 'served'

**Files:**
- Modify: `app/Http/Controllers/Staff/ReservationController.php`
- Test: `tests/Feature/POSReservationDepositTest.php` (regression)

**Interfaces:**
- Produces: `ReservationController:74` không còn 'served' (status không tồn tại).

- [ ] **Step 1: Verify 'served' đã bỏ**

Task 1 đã thay `ReservationController:74` literal (có 'served') bằng `Order::OPERATIONAL_STATUSES` — xác nhận không còn `'served'` trong file:
```php
->whereIn('status', \App\Models\Order::OPERATIONAL_STATUSES)
```
Grep `'served'` trong `app/Http/Controllers/Staff/ReservationController.php` — 0 kết quả.

- [ ] **Step 2: Chạy regression**

Run: `php artisan test tests\Feature\POSReservationDepositTest.php tests\Feature\POSCheckoutTest.php`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/Http/Controllers/Staff/ReservationController.php
git commit -m "fix: bo magic status served trong cancelReservation"
```

---

## Task 4: 2a — xóa resolvePromotion dead + chuyển test sang engine

**Files:**
- Modify: `app/Http/Controllers/Staff/PaymentController.php`, `tests/Feature/POSPromotionRejectReasonTest.php`

**Interfaces:**
- Consumes: `PromotionEngine::resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false)`.
- Produces: `resolvePromotion` private bị xóa; test dùng engine trực tiếp.

- [ ] **Step 1: Đọc test hiện tại**

Đọc `tests/Feature/POSPromotionRejectReasonTest.php` — 4 test reflect `PaymentController::resolvePromotion` qua ReflectionMethod. `posRejectReasonLines()` trả shape lines engine (order_item_id/menu_item_id/subtotal/category_id) — giữ nguyên.

- [ ] **Step 2: Sửa test sang engine**

Trong `POSPromotionRejectReasonTest.php`, thay 4 test dùng ReflectionMethod thành gọi trực tiếp engine:

Test 1 (5 reject reasons, dataset):
```php
test('promotion engine tra cac ly do tu choi rieng biet', function (array $attrs, string $expectReason) {
    $promo = Promotion::create(array_merge([
        'code' => 'RRR'.substr(uniqid(), -5), 'name' => 'RR', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ], $attrs));

    $r = \App\Services\Promotions\PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);

    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe($expectReason);
})->with([
    'khong hoat dong' => [['is_active' => false], 'inactive'],
    'chua toi han' => [['starts_at' => now()->addDay()], 'not_started'],
    'het han' => [['expires_at' => now()->subDay()], 'expired'],
    'het luot' => [['max_uses' => 1, 'used_count' => 1], 'out_of_uses'],
    'duoi min' => [['min_order_amount' => 200000], 'below_min'],
]);
```

Test not_found:
```php
test('promotion engine khong tim thay ma tra not_found', function () {
    $r = \App\Services\Promotions\PromotionEngine::resolveAll(['NOEXIST'.substr(uniqid(), -5)], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('not_found');
});
```

Test no_eligible_line:
```php
test('promotion engine khong co dong khop target tra no_eligible_line', function () {
    $category = MenuCategory::create(['name' => 'Cat RRR '.uniqid(), 'sort_order' => 1]);
    $promo = Promotion::create([
        'code' => 'RRC'.substr(uniqid(), -5), 'name' => 'RRC', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
        'target_type' => 'category', 'target_value' => $category->id,
    ]);
    $lines = collect([['order_item_id' => 1, 'menu_item_id' => null, 'subtotal' => 100000.0, 'category_id' => 99999]]);

    $r = \App\Services\Promotions\PromotionEngine::resolveAll([$promo->code], $lines, 100000.0);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('no_eligible_line');
});
```

Test ok:
```php
test('promotion engine ok tra promotions va total_discount', function () {
    $promo = Promotion::create([
        'code' => 'OKR'.substr(uniqid(), -5), 'name' => 'OK', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ]);
    $r = \App\Services\Promotions\PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'][0]['promotion']->id)->toBe($promo->id);
    expect($r['total_discount'])->toBe(10000.0);
});
```
Xóa `use App\Http\Controllers\Staff\PaymentController;` nếu không còn dùng; bỏ `$controller`/`$reflection`.

- [ ] **Step 3: Xóa resolvePromotion trong PaymentController**

Trong `PaymentController.php`, xóa private method `resolvePromotion` (`:420-435`).

- [ ] **Step 4: Chạy test**

Run: `php artisan test tests\Feature\POSPromotionRejectReasonTest.php tests\Feature\Services\PromotionEngineTest.php`
Expected: PASS (4 test chuyển engine + PromotionEngineTest regression).

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint app/Http/Controllers/Staff/PaymentController.php tests/Feature/POSPromotionRejectReasonTest.php
git add app/Http/Controllers/Staff/PaymentController.php tests/Feature/POSPromotionRejectReasonTest.php
git commit -m "refactor: xoa resolvePromotion dead, test dung PromotionEngine truc tiep"
```

---

## Task 5: 2b + 2c — dùng trait DispatchesSafely + GeneratesOrderCode

**Files:**
- Modify: `app/Http/Controllers/Staff/KitchenController.php`, `app/Http/Controllers/Manager/TableController.php`

**Interfaces:**
- Consumes: `Concerns\DispatchesSafely`, `Concerns\GeneratesOrderCode`.
- Produces: KitchenController dùng trait (xóa private safeDispatch); TableController dùng trait (xóa private generateOrderCode).

- [ ] **Step 1: KitchenController dùng DispatchesSafely**

Trong `app/Http/Controllers/Staff/KitchenController.php`:
- Thêm import + use:
```php
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
```
```php
class KitchenController extends Controller
{
    use DispatchesSafely;
```
- Xóa private `safeDispatch` (`:341-348`):
```php
    private function safeDispatch(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            Log::warning('Reverb Broadcast skipped due to socket connection issue: '.$e->getMessage());
        }
    }
```
(Xóa cả `Log` import nếu không còn dùng nơi khác — kiểm tra file.)

- [ ] **Step 2: TableController dùng GeneratesOrderCode**

Trong `app/Http/Controllers/Manager/TableController.php`:
- Thêm import + use:
```php
use App\Http\Controllers\Staff\Concerns\GeneratesOrderCode;
```
```php
class TableController extends Controller
{
    use GeneratesOrderCode;
```
- Xóa private `generateOrderCode` (`:47-65`).

- [ ] **Step 3: Chạy regression**

Run: `php artisan test tests\Feature\KitchenFlowTest.php tests\Feature\TableCacheTest.php tests\Feature\POSTableOperationsTest.php tests\Feature\TableControllerDepositRefundTest.php tests\Feature\TableIndexReadOnlyTest.php`
Expected: PASS (traits cung cấp method, hành vi không đổi).

- [ ] **Step 4: Pint + commit**

```bash
vendor/bin/pint app/Http/Controllers/Staff/KitchenController.php app/Http/Controllers/Manager/TableController.php
git add app/Http/Controllers/Staff/KitchenController.php app/Http/Controllers/Manager/TableController.php
git commit -m "refactor: Kitchen/TableController dung trait DispatchesSafely/GeneratesOrderCode"
```

---

## Task 6: 2d — ProductController extract image-delete

**Files:**
- Modify: `app/Http/Controllers/Manager/ProductController.php`

**Interfaces:**
- Produces: `deleteProductImage(?string $image): void` — xóa ảnh public/sirv (giữ `$baseFolder` strip), dùng trong update + destroy.

- [ ] **Step 1: Thêm private method**

Trong `ProductController.php`, thêm:
```php
    private function deleteProductImage(?string $image): void
    {
        if (! $image) {
            return;
        }
        if (str_starts_with($image, '/storage/')) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $image));
        } elseif (str_contains($image, 'sirv.com')) {
            $oldPath = parse_url($image, PHP_URL_PATH);
            $baseFolder = (string) config('filesystems.disks.sirv.base_folder', '/TapHoa');
            $relativeSirvPath = ltrim(str_replace($baseFolder, '', (string) $oldPath), '/');
            \Illuminate\Support\Facades\Storage::disk('sirv')->delete($relativeSirvPath);
        }
    }
```

- [ ] **Step 2: Thay 2 khối duplicate**

Trong `update` (`:116-126`):
```php
            if ($product->image) {
                if (str_starts_with($product->image, '/storage/')) {
                    $oldPath = str_replace('/storage/', '', $product->image);
                    Storage::disk('public')->delete($oldPath);
                } elseif (str_contains($product->image, 'sirv.com')) {
                    $oldPath = parse_url($product->image, PHP_URL_PATH);
                    $baseFolder = (string) config('filesystems.disks.sirv.base_folder', '/TapHoa');
                    $relativeSirvPath = ltrim(str_replace($baseFolder, '', (string) $oldPath), '/');
                    Storage::disk('sirv')->delete($relativeSirvPath);
                }
            }
```
→ `            $this->deleteProductImage($product->image);`

Trong `destroy` (`:155-164`) tương tự → `        $this->deleteProductImage($product->image);`

- [ ] **Step 3: Chạy regression**

Run: `php artisan test tests\Feature\ProductImageValidationTest.php tests\Feature\ProductCacheTest.php tests\Feature\SirvClientServiceTest.php`
Expected: PASS (extract không đổi hành vi).

- [ ] **Step 4: Pint + commit**

```bash
vendor/bin/pint app/Http/Controllers/Manager/ProductController.php
git add app/Http/Controllers/Manager/ProductController.php
git commit -m "refactor: ProductController extract deleteProductImage"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (256 + các test mới 1b)
- [ ] `npm run types:check` — pass (không đụng frontend)
- [ ] `npm run build` — pass (không đụng frontend)
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `git status` — tree sạch, không file lạ
