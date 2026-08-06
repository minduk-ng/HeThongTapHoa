# Split POSController + Dọn dead serving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách `app/Http/Controllers/Staff/POSController.php` (1473 dòng, 21 methods) thành 4 controller nhỏ theo trách nhiệm, và dọn dead serving (servingQueue/markServed POS + POSServingTab.tsx).

**Architecture:** Chia theo lĩnh vực đã có sẵn trong URL: POS (index/sendToKitchen/cancelOrder), Reservation, TableOperation, Payment. Helpers dùng chung (`safeDispatch`, `generateOrderCode`) thành trait trong `Concerns/`. URL endpoint giữ nguyên — chỉ trỏ class khác. Không thay đổi hành vi; mọi method di chuyển nguyên vẹn.

**Tech Stack:** Laravel 11, PHP, Pest, Inertia/React (chỉ Task 5 xóa 1 file .tsx).

**Spec:** `docs/superpowers/specs/2026-08-06-split-poscontroller-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` như lệnh đơn.
- Mọi method di chuyển NGUYÊN VẸN — không sửa logic, chỉ đổi class/nơi chứa + `$this->` thành gọi trait.
- URL endpoint GIỮ NGUYÊN. Middleware permission giữ nguyên.
- Không đụng `ShiftController`, `KitchenController`, `ServingController`, `DashboardController`, reports controllers.
- Khi tách, dọn import thừa bằng `vendor/bin/pint --dirty` (Pint tự xóa import không dùng).
- Test chạy: `php artisan test tests\Feature\<file>.php`
- Trước khi commit mỗi task: `php artisan test` full suite phải pass.

---

## File Structure

**Tạo mới:**
- `app/Http/Controllers/Staff/Concerns/DispatchesSafely.php`
- `app/Http/Controllers/Staff/Concerns/GeneratesOrderCode.php`
- `app/Http/Controllers/Staff/PaymentController.php`
- `app/Http/Controllers/Staff/ReservationController.php`
- `app/Http/Controllers/Staff/TableOperationController.php`

**Sửa:**
- `app/Http/Controllers/Staff/POSController.php` — giữ `index`, `sendToKitchen`, `cancelOrder` + dùng 2 trait; xóa 18 methods + helpers dead
- `routes/web.php` — trỏ class mới cho route đã chuyển; xóa 2 route serving dead
- `tests/Feature/POSPromotionRejectReasonTest.php` — `POSController::class` → `PaymentController::class`
- `tests/Feature/ServingQueueTest.php` — endpoint sang ServingController

**Xóa:**
- `resources/js/pages/staff/pos/components/POSServingTab.tsx`

---

## Task 1: Traits DispatchesSafely + GeneratesOrderCode

**Files:**
- Create: `app/Http/Controllers/Staff/Concerns/DispatchesSafely.php`
- Create: `app/Http/Controllers/Staff/Concerns/GeneratesOrderCode.php`

**Interfaces:**
- Produces: trait `DispatchesSafely { safeDispatch(callable $callback): void }`; trait `GeneratesOrderCode { generateOrderCode(?Table $table): string }` — cả 4 controller (Task 2-5) dùng.

- [ ] **Step 1: Tạo trait DispatchesSafely**

```php
<?php

namespace App\Http\Controllers\Staff\Concerns;

use Illuminate\Support\Facades\Log;

trait DispatchesSafely
{
    protected function safeDispatch(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            Log::warning('Reverb Broadcast skipped due to socket connection issue: '.$e->getMessage());
        }
    }
}
```

- [ ] **Step 2: Tạo trait GeneratesOrderCode**

```php
<?php

namespace App\Http\Controllers\Staff\Concerns;

use App\Models\Order;
use App\Models\Table;
use Illuminate\Support\Str;

trait GeneratesOrderCode
{
    protected function generateOrderCode(?Table $table): string
    {
        $normalized = $table ? str_replace('-', '', strtoupper(Str::slug($table->table_number))) : 'MD';
        $dateStr = date('ymd');
        $prefix = "{$normalized}-{$dateStr}-";

        $maxSeq = Order::where('order_code', 'like', $prefix.'%')
            ->lockForUpdate()
            ->pluck('order_code')
            ->map(fn ($code) => (int) substr($code, strlen($prefix)))
            ->max() ?? 0;

        $seq = str_pad($maxSeq + 1, 2, '0', STR_PAD_LEFT);

        return $prefix.$seq;
    }
}
```

- [ ] **Step 3: Verify syntax**

Run: `php -l app/Http/Controllers/Staff/Concerns/DispatchesSafely.php; php -l app/Http/Controllers/Staff/Concerns/GeneratesOrderCode.php`
Expected: "No syntax errors detected" cho cả 2.

- [ ] **Step 4: Commit**

```bash
git add app/Http/Controllers/Staff/Concerns/
git commit -m "feat: trait DispatchesSafely + GeneratesOrderCode cho tach POSController"
```

---

## Task 2: PaymentController

**Files:**
- Create: `app/Http/Controllers/Staff/PaymentController.php`
- Test: `tests/Feature/POSPromotionRejectReasonTest.php` (sửa class reflect)

**Interfaces:**
- Consumes: Task 1 (`DispatchesSafely`); `App\Services\Checkout\CheckoutService::runBulk`; `App\Services\Promotions\PromotionEngine::resolveAll/discountFor`; models `Invoice`, `MenuItem`, `Order`, `Table`, `Promotion`.
- Produces: `PaymentController` với `validatePromotion`, `checkout`, `bulkCheckout`, `resolvePromotion` (private). Routes trỏ tới (Task 6): `/pos/validate-promotion`, `/pos/checkout`, `/pos/bulk-checkout`.

- [ ] **Step 1: Tạo PaymentController — khởi tạo file + class**

Tạo `app/Http/Controllers/Staff/PaymentController.php` với khung class + đầy đủ `use` cho 3 method sẽ dán vào (Step 2). KHÔNG thêm method nào trong bước này:

```php
<?php

namespace App\Http\Controllers\Staff;

use App\Events\IngredientStockUpdated;
use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Table;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    use DispatchesSafely;
}
```

**Lưu ý quan trọng:** File này chưa có method nào — chưa thể chạy/commit. Bổ sung method thật ở Step 2 rồi mới chạy test/commit. Không commit ở trạng thái trống.

- [ ] **Step 2: Copy 3 method thật từ POSController**

Từ `app/Http/Controllers/Staff/POSController.php`, copy **nguyên vẹn** (không sửa logic) vào PaymentController:
- `validatePromotion` (hiện ở dòng ~698-769)
- `checkout` (hiện ở dòng ~771-928)
- `bulkCheckout` (hiện ở dòng ~930-1088)
- `resolvePromotion` private (hiện ở dòng ~1449-1463)

Thay thế khung class trống bằng 3 method thật. Trong mỗi method:
- Giữ nguyên toàn bộ logic.
- `$this->safeDispatch(...)` vẫn hoạt động vì class đã `use DispatchesSafely`.
- Xóa `use Inertia\Inertia;` nếu không còn dùng (checkout/bulkCheckout không render Inertia — chỉ trả JSON/back).

Bổ sung các import cần thiết cho 3 method (kiểm tra từng symbol dùng trong method, bổ sung `use`):
- `IngredientStockUpdated`, `TableStatusUpdated` (events) — đã có
- `Order`, `Table`, `MenuItem` — đã có
- Cần thêm nếu dùng: `App\Models\Deposit` (bulkCheckout dùng qua CheckoutService — KHÔNG cần trực tiếp)

Xác minh bằng cách đọc lại từng method sau khi dán: mọi `Model::` đều có `use` tương ứng, mọi event đều có `use`.

- [ ] **Step 3: Sửa POSPromotionRejectReasonTest trỏ PaymentController**

Trong `tests/Feature/POSPromotionRejectReasonTest.php`, thay toàn bộ:
- `use App\Http\Controllers\Staff\POSController;` → `use App\Http\Controllers\Staff\PaymentController;`
- `resolve(POSController::class)` → `resolve(PaymentController::class)`
- `app(POSController::class)` → `app(PaymentController::class)`

(4 chỗ `POSController` → `PaymentController` trong file.)

- [ ] **Step 4: Chạy test PaymentController**

Run: `php artisan test tests\Feature\POSPromotionRejectReasonTest.php tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\PromotionApplyTest.php`
Expected: PASS toàn bộ (validatePromotion/checkout/bulkCheckout vẫn chạy — route vẫn trỏ POSController cho tới Task 6, nhưng test reflect PaymentController::resolvePromotion phải pass).

- [ ] **Step 5: Pint dọn import**

Run: `vendor/bin/pint app/Http/Controllers/Staff/PaymentController.php`
Expected: dọn import không dùng.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Staff/PaymentController.php tests/Feature/POSPromotionRejectReasonTest.php
git commit -m "feat: PaymentController (validatePromotion/checkout/bulkCheckout)"
```

---

## Task 3: ReservationController

**Files:**
- Create: `app/Http/Controllers/Staff/ReservationController.php`
- Test: `tests/Feature/POSReservationDepositTest.php` (giữ nguyên — regression qua route)

**Interfaces:**
- Consumes: Task 1 (`DispatchesSafely`, `GeneratesOrderCode`); models `Deposit`, `Employee`, `MenuItem`, `Order`, `OrderItem`, `Table`; event `TableStatusUpdated`; `App\Services\OrderActivityLogger`.
- Produces: `ReservationController` với `reserve`, `checkInReservation`, `cancelReservation`, `deposit`. Routes trỏ tới (Task 6): `/pos/reserve`, `/pos/reservation/check-in`, `/pos/reservation/cancel`, `/pos/deposit`.

- [ ] **Step 1: Tạo ReservationController**

Từ `app/Http/Controllers/Staff/POSController.php`, copy **nguyên vẹn** vào `app/Http/Controllers/Staff/ReservationController.php`:
- `reserve` (dòng ~323-457)
- `checkInReservation` (dòng ~266-321)
- `cancelReservation` (dòng ~181-264)
- `deposit` (dòng ~459-511)

Class khởi tạo:

```php
<?php

namespace App\Http\Controllers\Staff;

use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Http\Controllers\Staff\Concerns\GeneratesOrderCode;
use App\Models\Deposit;
use App\Models\Employee;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use App\Services\OrderActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ReservationController extends Controller
{
    use DispatchesSafely, GeneratesOrderCode;

    // reserve, checkInReservation, cancelReservation, deposit (copy nguyên vẹn)
}
```

**Lưu ý:** `reserve` dùng `$this->generateOrderCode($table)` (trait đã có) và `$this->safeDispatch(...)` (trait đã có). Xác minh mọi `use` đủ sau khi dán.

- [ ] **Step 2: Chạy regression reservation**

Run: `php artisan test tests\Feature\POSReservationDepositTest.php`
Expected: PASS (route vẫn trỏ POSController tới Task 6; class mới chưa được route dùng nhưng không vỡ gì).

- [ ] **Step 3: Pint**

Run: `vendor/bin/pint app/Http/Controllers/Staff/ReservationController.php`
Expected: dọn import không dùng.

- [ ] **Step 4: Commit**

```bash
git add app/Http/Controllers/Staff/ReservationController.php
git commit -m "feat: ReservationController (reserve/checkIn/cancelReservation/deposit)"
```

---

## Task 4: TableOperationController

**Files:**
- Create: `app/Http/Controllers/Staff/TableOperationController.php`
- Test: `tests/Feature/POSTableOperationsTest.php` (giữ nguyên — regression qua route)

**Interfaces:**
- Consumes: Task 1 (`DispatchesSafely`); models `Order`, `Table`; events `TableStatusUpdated`, `TableTransferred`.
- Produces: `TableOperationController` với `transferTable`, `mergeTables`, `unmergeTable`. Routes trỏ tới (Task 6): `/pos/transfer-table`, `/pos/merge-tables`, `/pos/unmerge-table`.

- [ ] **Step 1: Tạo TableOperationController**

Từ `app/Http/Controllers/Staff/POSController.php`, copy **nguyên vẹn** vào `app/Http/Controllers/Staff/TableOperationController.php`:
- `transferTable` (dòng ~1091-1180)
- `mergeTables` (dòng ~1182-1230)
- `unmergeTable` (dòng ~1232-1288)

Class khởi tạo:

```php
<?php

namespace App\Http\Controllers\Staff;

use App\Events\TableStatusUpdated;
use App\Events\TableTransferred;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Models\Order;
use App\Models\Table;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TableOperationController extends Controller
{
    use DispatchesSafely;

    // transferTable, mergeTables, unmergeTable (copy nguyên vẹn)
}
```

**Lưu ý:** 3 method đều dùng `$this->safeDispatch(...)` (trait). Không cần `generateOrderCode`. Xác minh `use` đủ.

- [ ] **Step 2: Chạy regression table operations**

Run: `php artisan test tests\Feature\POSTableOperationsTest.php tests\Feature\TableCacheTest.php`
Expected: PASS.

- [ ] **Step 3: Pint**

Run: `vendor/bin/pint app/Http/Controllers/Staff/TableOperationController.php`
Expected: dọn import không dùng.

- [ ] **Step 4: Commit**

```bash
git add app/Http/Controllers/Staff/TableOperationController.php
git commit -m "feat: TableOperationController (transfer/merge/unmerge table)"
```

---

## Task 5: Shrink POSController + xóa dead serving + xóa POSServingTab

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php`
- Delete: `resources/js/pages/staff/pos/components/POSServingTab.tsx`

**Interfaces:**
- Consumes: Task 1 (`DispatchesSafely`, `GeneratesOrderCode`); Task 2-4 (methods đã chuyển đi).
- Produces: `POSController` chỉ còn `index`, `sendToKitchen`, `cancelOrder` + 2 trait. Các method serving (`servingQueue`, `markServed`) BỊ XÓA.

- [ ] **Step 1: Xóa 18 methods đã chuyển đi khỏi POSController**

Từ `app/Http/Controllers/Staff/POSController.php`, XÓA các method (đã được Task 2-4 copy sang controller mới):
- `cancelReservation`, `checkInReservation`, `reserve`, `deposit` (→ ReservationController)
- `validatePromotion`, `checkout`, `bulkCheckout` (→ PaymentController)
- `transferTable`, `mergeTables`, `unmergeTable` (→ TableOperationController)
- `servingQueue`, `markServed` (dead — xóa hẳn)
- `orderLines`, `discountFor`, `resolvePromotion` (helpers dead — resolvePromotion đã ở PaymentController)

**GIỮ NGUYÊN:** `index`, `sendToKitchen`, `cancelOrder`.

- [ ] **Step 2: Thêm 2 trait vào POSController**

Thêm `use` + khai báo trait vào đầu class:

```php
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Http\Controllers\Staff\Concerns\GeneratesOrderCode;
```

```php
class POSController extends Controller
{
    use DispatchesSafely, GeneratesOrderCode;
```

- [ ] **Step 3: Xóa 2 method private dead**

Xóa `generateOrderCode` (đã thành trait `GeneratesOrderCode`), `safeDispatch` (đã thành trait `DispatchesSafely`), `orderLines`, `discountFor`, `resolvePromotion` khỏi cuối class POSController.

- [ ] **Step 4: Xóa file POSServingTab.tsx**

Run: `Remove-Item resources/js/pages/staff/pos/components/POSServingTab.tsx`
Xác minh không ai import nó: `Get-ChildItem resources/js -Recurse -Filter *.tsx | Select-String -Pattern 'POSServingTab'`
Expected: chỉ còn (nếu có) trong chính file đã xóa — không còn match nào.

- [ ] **Step 5: Pint + kiểm tra syntax**

Run: `vendor/bin/pint app/Http/Controllers/Staff/POSController.php`
Expected: dọn import thừa (nhiều `use` giờ không còn dùng vì methods đã đi).

Run: `php -l app/Http/Controllers/Staff/POSController.php`
Expected: "No syntax errors detected".

- [ ] **Step 6: Chạy full suite (route vẫn trỏ POSController)**

Run: `php artisan test`
Expected: FAIL ở các test checkout/bulk/reservation/table — vì route `/pos/checkout` vẫn trỏ `[POSController::class, 'checkout']` mà method đã bị xóa → route 500/error. **Đây là trạng thái trung gian DỰ KIẾN.**

Xác minh đúng tiến triển: chạy `php artisan route:list` — các route `/pos/checkout`, `/pos/bulk-checkout`, `/pos/reserve`, `/pos/transfer-table` vẫn hiển thị trỏ `POSController` (chưa đổi). Ghi nhận kết quả fail này làm baseline; KHÔNG rollback. Task 6 đổi route sang class mới sẽ hồi phục.

KHÔNG chạy toàn bộ test tới khi Task 6 xong.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php resources/js/pages/staff/pos/components/POSServingTab.tsx
git commit -m "refactor: POSController chi giu index/sendToKitchen/cancelOrder, xoa dead serving"
```

---

## Task 6: Cập nhật routes/web.php

**Files:**
- Modify: `routes/web.php`

**Interfaces:**
- Consumes: Task 2-4 (3 controller mới).
- Produces: route trỏ class đúng; xóa 2 route serving dead.

- [ ] **Step 1: Thêm 3 import controller mới**

Thêm vào đầu `routes/web.php` (cùng khối `use`):

```php
use App\Http\Controllers\Staff\PaymentController;
use App\Http\Controllers\Staff\ReservationController;
use App\Http\Controllers\Staff\TableOperationController;
```

- [ ] **Step 2: Đổi class trong 9 route**

Trong `routes/web.php`, sửa từng route (URL GIỮ NGUYÊN):

```php
Route::post('/pos/reserve', [ReservationController::class, 'reserve'])->middleware('permission:pos.create');
Route::post('/pos/reservation/check-in', [ReservationController::class, 'checkInReservation'])->middleware('permission:pos.create');
Route::post('/pos/reservation/cancel', [ReservationController::class, 'cancelReservation'])->middleware('permission:pos.create');
Route::post('/pos/deposit', [ReservationController::class, 'deposit'])->middleware('permission:pos.create');
Route::post('/pos/validate-promotion', [PaymentController::class, 'validatePromotion'])->middleware('permission:pos.create');
Route::post('/pos/checkout', [PaymentController::class, 'checkout'])->middleware('permission:pos.create');
Route::post('/pos/bulk-checkout', [PaymentController::class, 'bulkCheckout'])->middleware('permission:pos.create');
Route::post('/pos/transfer-table', [TableOperationController::class, 'transferTable'])->middleware('permission:pos.create');
Route::post('/pos/merge-tables', [TableOperationController::class, 'mergeTables'])->middleware('permission:pos.create');
Route::post('/pos/unmerge-table', [TableOperationController::class, 'unmergeTable'])->middleware('permission:pos.create');
```

- [ ] **Step 3: Xóa 2 route serving dead**

Xóa 2 dòng (servingQueue + markServed POS đã bị xóa ở Task 5):

```php
Route::get('/pos/serving-queue', [POSController::class, 'servingQueue'])->middleware('permission:pos.view');
Route::post('/pos/mark-served', [POSController::class, 'markServed'])->middleware('permission:pos.create');
```

**GIỮ NGUYÊN:** `/pos`, `/pos/send-to-kitchen`, `/pos/cancel-order` (vẫn trỏ `POSController`).

- [ ] **Step 4: Chạy full suite**

Run: `php artisan test`
Expected: PASS toàn bộ (giờ route trỏ đúng class; các test reservation/checkout/bulk/table gọi URL cũ vẫn pass).

- [ ] **Step 5: Commit**

```bash
git add routes/web.php
git commit -m "feat: route staff/pos tro 4 controller, xoa route serving dead"
```

---

## Task 7: Chuyển ServingQueueTest sang ServingController

**Files:**
- Modify: `tests/Feature/ServingQueueTest.php`

**Interfaces:**
- Consumes: `ServingController::markServed` (`POST /staff/serving/mark-served`, trả `served_count`, chấp nhận `item_ids` + optional `idempotency_key`); `ServingController::index` (`GET /staff/serving`, trả Inertia prop `servingQueue`).
- Produces: 5 test gọi ServingController thay vì endpoint POS đã xóa.

- [ ] **Step 1: Sửa 3 test markServed — đổi endpoint**

Trong `tests/Feature/ServingQueueTest.php`, 3 test đang gọi `/staff/pos/mark-served`:
- `markServed chỉ đánh dấu các món completed chưa phục vụ`
- `markServed không đánh dấu lặp món đã phục vụ trước đó`
- `markServed yêu cầu danh sách item_ids hợp lệ`

Đổi toàn bộ URL `/staff/pos/mark-served` → `/staff/serving/mark-served`.

Kiểm tra: `ServingController::markServed` validation chấp nhận `item_ids` (`required|array|min:1`, `item_ids.*` `exists:order_items,id`) — khớp test. Test validation (`item_ids:[]` → error `item_ids`, `[999999]` → error `item_ids.0`) vẫn pass.

- [ ] **Step 2: Sửa 2 test lọc hàng chờ — dùng Inertia prop**

2 test `hàng chờ phục vụ...` và `đơn Mang đi...` đang gọi `/staff/pos/serving-queue` (JSON). `ServingController::index` trả queue qua **prop Inertia** — không có JSON endpoint. Sửa 2 test này:

```php
test('hàng chờ phục vụ chỉ chứa món completed chưa phục vụ của đơn trong ngày', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'B50', 'status' => 'occupied']);
    $item = posMenuItem();

    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'status' => 'completed'],
        ['item' => $item, 'qty' => 2, 'status' => 'pending'],
    ]);

    $servedOrder = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);
    $servedOrder->items->first()->forceFill(['served_at' => now()])->save();

    $oldOrder = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);
    $oldOrder->forceFill(['created_at' => now()->subDay()])->save();

    $response = $this->get('/staff/serving');
    $response->assertInertia(fn ($page) => $page
        ->component('staff/serving/ServingDisplay')
        ->has('servingQueue', 1)
        ->where('servingQueue.0.order_id', $order->id)
        ->where('servingQueue.0.table_number', 'B50')
        ->has('servingQueue.0.items', 1)
        ->where('servingQueue.0.items.0.quantity', 1));
});

test('đơn Mang đi trong hàng chờ hiển thị nhãn "Mang về"', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem();
    posOrder(null, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);

    $response = $this->get('/staff/serving');
    $response->assertInertia(fn ($page) => $page
        ->component('staff/serving/ServingDisplay')
        ->has('servingQueue', 1)
        ->where('servingQueue.0.table_number', 'Mang về'));
});
```

**Kiểm tra:** User `posAdmin()` phải có permission `serving.view` (route `/serving` dùng `permission:serving.view`). Nếu chưa có, bổ sung permission cho user trong test hoặc đổi thành user có quyền serving. Xác minh bằng cách chạy test.

- [ ] **Step 3: Chạy ServingQueueTest**

Run: `php artisan test tests\Feature\ServingQueueTest.php`
Expected: PASS (5 tests).

- [ ] **Step 4: Chạy full suite**

Run: `php artisan test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add tests/Feature/ServingQueueTest.php
git commit -m "test: ServingQueueTest chuyen sang ServingController endpoint"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (kỳ vọng 230/230, giữ nguyên)
- [ ] `npm run types:check` — pass
- [ ] `npm run build` — pass
- [ ] `vendor/bin/pint --dirty` — không còn thay đổi (import sạch)
- [ ] `git status` — tree sạch, không có file lạ
