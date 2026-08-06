# Sửa 6 lỗi audit controllers + thống kê cọc held — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 6 lỗi từ audit toàn diện controllers (2 Critical + 4 Important) và thêm thống kê cọc held trong báo cáo thanh toán.

**Architecture:** C1 tách `ShiftService::expectedCash` tính từ `payments`+`deposits` (thay vì `invoices.payment_method`). C2 chặn sendToKitchen trên đơn paid/cancelled. I3 CheckPermission hỗ trợ `|` OR. I4 sửa status KDS. I5 SalesInvoiceReport đọc invoice snapshot. I6 CheckoutService refresh orders.subtotal/vat. P5 thêm metric cọc held tách riêng (không trộn doanh thu).

**Tech Stack:** Laravel 11, PHP, Pest, Inertia/React, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-06-fix-controller-audit-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` / `npm run ...` như lệnh đơn.
- Mỗi task TDD: test RED → implement → pass → commit riêng.
- Test helpers trong `tests/Pest.php`: `posAdmin`, `posStaff($permissions, $pages)`, `posTable`, `posMenuItem`, `posOrder`, `posTable`. Dùng lại.
- **Không đổi shape frontend** ngoài việc THÊM `held_deposit_total` vào PaymentsReport.
- `payments.note` cọc applied = `'Tiền cọc đơn X'` (CheckoutService:163) — dùng `not like 'Tiền cọc%'` để loại.
- Không sửa các vấn đề cấu trúc khác từ audit (việc riêng).
- Test chạy: `php artisan test tests\Feature\<file>.php`

---

## File Structure

**Tạo mới:**
- `app/Services/Manager/ShiftService.php`

**Sửa:**
- `app/Http/Controllers/Staff/ShiftController.php` — expectedCash delegate tới service
- `app/Http/Controllers/Staff/POSController.php` — sendToKitchen guard paid/cancelled
- `app/Http/Middleware/CheckPermission.php` — hỗ trợ `|` OR
- `app/Services/Manager/DashboardService.php` — KDS status thật
- `app/Http/Controllers/Manager/Reports/SalesInvoiceReportController.php` — đọc invoice snapshot
- `app/Services/Checkout/CheckoutService.php` — refresh orders.subtotal/vat_amount
- `app/Http/Controllers/Reports/PaymentsReportController.php` — metric cọc held
- `resources/js/pages/reports/PaymentsReport.tsx` — metric card "Cọc đang giữ"

**Test:**
- `tests/Feature/ShiftControllerTest.php` — cập nhật + thêm case C1
- `tests/Feature/SendToKitchenPaidGuardTest.php` — mới (C2)
- `tests/Feature/POSPermissionDenialTest.php` — thêm case I3
- `tests/Feature/DashboardServiceKdsTest.php` — mới (I4)
- `tests/Feature/SalesInvoiceReportTest.php` — thêm case I5
- `tests/Feature/CheckoutServiceTest.php` — thêm case I6
- `tests/Feature/PaymentsReportTest.php` — thêm case P5

---

## Task 1: C1 — ShiftService::expectedCash tính từ payments + deposits

**Files:**
- Create: `app/Services/Manager/ShiftService.php`
- Modify: `app/Http/Controllers/Staff/ShiftController.php`
- Test: `tests/Feature/ShiftControllerTest.php` (cập nhật test cũ + thêm case)

**Interfaces:**
- Produces: `ShiftService::expectedCash(Shift $shift, CarbonInterface $until): float` — ShiftController delegate.
- **Lưu ý quan trọng:** test hiện có `current tính expected_cash theo amount_received của hóa đơn cash` (ShiftControllerTest.php:15-29) tạo invoice CASH 50000 NHƯNG KHÔNG tạo payment row — sau fix sẽ đọc 0. **Phải cập nhật test này** tạo `Payment` row (method cash, amount 50000).

- [ ] **Step 1: Cập nhật test cũ + viết test fail**

Sửa test `current tính expected_cash theo amount_received của hóa đơn cash trong ca` (hiện ShiftControllerTest.php:15-29) — thêm payment rows khớp invoice:

```php
test('current tính expected_cash theo payments cash trong ca (bỏ qua bank)', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => auth()->id()]);

    $invCash = App\Models\Invoice::create([
        'invoice_code' => 'INV-CASH', 'table_name' => 'B1', 'total_amount' => 45000, 'payment_method' => 'cash',
        'amount_received' => 50000, 'change_amount' => 5000, 'issued_at' => now(),
    ]);
    App\Models\Payment::create(['invoice_id' => $invCash->id, 'method' => 'cash', 'amount' => 50000]);

    $invBank = App\Models\Invoice::create([
        'invoice_code' => 'INV-BANK', 'table_name' => 'B1', 'total_amount' => 70000, 'payment_method' => 'bank_transfer',
        'amount_received' => 70000, 'change_amount' => 0, 'issued_at' => now(),
    ]);
    App\Models\Payment::create(['invoice_id' => $invBank->id, 'method' => 'bank_transfer', 'amount' => 70000]);

    $response = $this->getJson('/staff/shifts/current')->assertOk()->assertJsonPath('shift.status', 'open');
    expect((float) $response->json('expected_cash'))->toBe(150000.0); // 100k mở + 50k cash
});
```

Sửa test `đóng ca lưu đối soát và trả chênh lệch` (hiện :31-47) — thêm payment row cho invoice cash:

```php
    App\Models\Invoice::create([
        'invoice_code' => 'INV-CLOSE', 'table_name' => 'B1', 'total_amount' => 30000, 'payment_method' => 'cash',
        'amount_received' => 30000, 'change_amount' => 0, 'issued_at' => now(),
    ]);
```
→ thêm sau đó:
```php
    $invClose = App\Models\Invoice::where('invoice_code', 'INV-CLOSE')->first();
    App\Models\Payment::create(['invoice_id' => $invClose->id, 'method' => 'cash', 'amount' => 30000]);
```
(Kỳ vọng expected_cash vẫn 130000.)

Thêm test mới — cọc cash trong ca + cọc applied không đếm 2 lần:

```php
test('expected_cash gom coc cash nhan trong ca, khong dem lai coc da applied', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);

    // Cọc cash held nhận trong ca → phải đếm
    $item = posMenuItem(['price' => 100000]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']]);
    App\Models\Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $response = $this->getJson('/staff/shifts/current')->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(30000.0);
});

test('expected_cash khong dem lai coc da applied (payment row Tiền cọc)', function () {
    $this->actingAs(posAdmin());
    $shift = Shift::create(['opened_at' => now()->subMinute(), 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);

    $item = posMenuItem(['price' => 100000]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']]);
    $deposit = App\Models\Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    // Cọc applied qua checkout: payment row 'Tiền cọc đơn X' + deposit trả lại đếm lúc nhận
    $inv = App\Models\Invoice::create([
        'invoice_code' => 'INV-APP', 'table_name' => 'B1', 'total_amount' => 70000, 'payment_method' => 'mixed',
        'amount_received' => 40000, 'change_amount' => 0, 'issued_at' => now(),
    ]);
    App\Models\Payment::create(['invoice_id' => $inv->id, 'method' => 'cash', 'amount' => 40000]); // trả thêm
    App\Models\Payment::create(['invoice_id' => $inv->id, 'method' => 'cash', 'amount' => 30000, 'note' => 'Tiền cọc đơn '.$order->id]);

    // expected = cọc 30000 (nhận) + trả thêm 40000 = 70000 (không đếm lại 30000 applied)
    $response = $this->getJson('/staff/shifts/current')->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(70000.0);
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\ShiftControllerTest.php`
Expected: FAIL — test cũ (không payment row) đọc 0; test cọc mới fail (expectedCash chưa đọc deposits).

- [ ] **Step 3: Tạo ShiftService**

Tạo `app/Services/Manager/ShiftService.php`:

```php
<?php

namespace App\Services\Manager;

use App\Models\Deposit;
use App\Models\Payment;
use App\Models\Shift;
use Carbon\CarbonInterface;

final class ShiftService
{
    /**
     * Tiền mặt kỳ vọng trong ca = opening_cash + cash checkout (payments method=cash,
     * loại row cọc applied vì đã đếm lúc nhận) + cọc tiền mặt nhận trong ca.
     */
    public function expectedCash(Shift $shift, CarbonInterface $until): float
    {
        $checkoutCash = Payment::query()
            ->join('invoices', 'invoices.id', '=', 'payments.invoice_id')
            ->where('payments.method', 'cash')
            ->where('payments.note', 'not like', 'Tiền cọc%')
            ->whereBetween('invoices.issued_at', [$shift->opened_at, $until])
            ->sum('payments.amount');

        $depositCash = Deposit::query()
            ->where('method', 'cash')
            ->whereBetween('created_at', [$shift->opened_at, $until])
            ->sum('amount');

        return round((float) $shift->opening_cash + (float) $checkoutCash + (float) $depositCash, 2);
    }
}
```

- [ ] **Step 4: Sửa ShiftController delegate**

Trong `app/Http/Controllers/Staff/ShiftController.php`, thay private method `expectedCash` (hiện :118-126) bằng:

```php
    private function expectedCash(Shift $shift, CarbonInterface $until): float
    {
        return (new \App\Services\Manager\ShiftService)->expectedCash($shift, $until);
    }
```

`current()` và `close()` giữ nguyên (đã gọi `$this->expectedCash(...)`).

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\ShiftControllerTest.php`
Expected: PASS (5 test — 3 cũ cập nhật + 2 mới).

- [ ] **Step 6: Pint + commit**

Run: `vendor/bin/pint app/Services/Manager/ShiftService.php app/Http/Controllers/Staff/ShiftController.php`
Expected: clean (gỡ import Invoice/Carbon không còn dùng trong ShiftController nếu có).

```bash
git add app/Services/Manager/ShiftService.php app/Http/Controllers/Staff/ShiftController.php tests/Feature/ShiftControllerTest.php
git commit -m "fix: ShiftService expectedCash tinh tu payments + deposits (dung split/coc)"
```

---

## Task 2: C2 — sendToKitchen chặn đơn paid/cancelled

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php`
- Test: `tests/Feature/SendToKitchenPaidGuardTest.php` (mới)

**Interfaces:**
- Consumes: `posAdmin`, `posTable`, `posMenuItem`, `posOrder` helpers.
- Produces: sendToKitchen từ chối (422) khi order `paid`/`cancelled`; reduction bỏ qua order `paid`/`cancelled`.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/SendToKitchenPaidGuardTest.php`:

```php
<?php

use App\Models\Order;

test('sendToKitchen tu choi gui mon vao don da paid', function () {
    $this->actingAs(posAdmin());
    $itemA = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $itemA, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'paid']);

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'items' => [['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 30000]],
        'subtotal' => 30000, 'vat_amount' => 0, 'total' => 30000,
    ]);

    $response->assertSessionHasErrors('error');
    expect($order->fresh()->status)->toBe('paid');
    expect($order->fresh()->items()->count())->toBe(1); // không thêm món
});

test('sendToKitchen reduction bo qua don da paid', function () {
    $this->actingAs(posAdmin());
    $itemA = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $itemA, 'qty' => 4, 'price' => 30000, 'status' => 'pending']], ['status' => 'paid']);
    $orderItem = $order->items->first();

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [[
            'order_item_id' => $orderItem->id,
            'reduce_quantity' => 1,
            'cancellation_reason' => 'Khach doi y',
        ]],
        'subtotal' => 0, 'vat_amount' => 0, 'total' => 0,
    ]);

    expect($orderItem->fresh()->quantity)->toBe(4); // không bị giảm
    expect($order->fresh()->status)->toBe('paid');
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\SendToKitchenPaidGuardTest.php`
Expected: FAIL — hiện sendToKitchen nhận order paid, set lại pending + thêm món.

- [ ] **Step 3: Sửa POSController::sendToKitchen**

Trong `app/Http/Controllers/Staff/POSController.php`:

**Reduction branch** (hiện :199):
```php
                        if (! $orderItem || $orderItem->status === 'completed' || $orderItem->order?->status === 'completed') {
                            continue;
                        }
```
đổi thành:
```php
                        if (! $orderItem || $orderItem->status === 'completed' || in_array($orderItem->order?->status, ['paid', 'cancelled', 'completed'], true)) {
                            continue;
                        }
```

**Item-creation branch** (hiện :248):
```php
                        $createdOrder = Order::lockForUpdate()->findOrFail($validated['order_id']);
                        $wasDraft = $createdOrder->status === 'draft';
```
đổi thành:
```php
                        $createdOrder = Order::lockForUpdate()->findOrFail($validated['order_id']);
                        if (in_array($createdOrder->status, ['paid', 'cancelled'], true)) {
                            throw new \Exception('Đơn đã thanh toán hoặc đã hủy, không thể gửi bếp.', 422);
                        }
                        $wasDraft = $createdOrder->status === 'draft';
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\SendToKitchenPaidGuardTest.php tests\Feature\POSOrderFlowTest.php tests\Feature\KitchenFlowTest.php`
Expected: PASS (2 test mới + regression).

- [ ] **Step 5: Pint + commit**

Run: `vendor/bin/pint app/Http/Controllers/Staff/POSController.php`

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/SendToKitchenPaidGuardTest.php
git commit -m "fix: sendToKitchen chan don paid/cancelled (tranh double invoice)"
```

---

## Task 3: I3 — CheckPermission hỗ trợ `|` OR

**Files:**
- Modify: `app/Http/Middleware/CheckPermission.php`
- Test: `tests/Feature/POSPermissionDenialTest.php` (thêm case)

**Interfaces:**
- Produces: `CheckPermission` xử lý `permission:pos.cancel_item|kitchen.cancel_item` đúng nghĩa OR.

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/Feature/POSPermissionDenialTest.php`:

```php
test('nhan vien co pos.cancel_item (khong co kitchen.cancel_item) duoc cancel-item', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'pos.cancel_item'], ['/staff/pos']);
    $item = posMenuItem();
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'pending']], ['status' => 'pending']);

    $this->actingAs($staff)
        ->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'x'])
        ->assertSessionHasNoErrors(); // hiện 403
});

test('nhan vien khong co quyen cancel-item van bi chan 403', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $this->actingAs($staff)
        ->post('/staff/pos/cancel-order', ['table_id' => 1, 'cancellation_reason' => 'x'])
        ->assertStatus(403);
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\POSPermissionDenialTest.php`
Expected: FAIL — test 1 hiện 403 (permission literal không match), test 2 pass.

- [ ] **Step 3: Sửa CheckPermission**

`app/Http/Middleware/CheckPermission.php` — toàn bộ handle:

```php
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        if (! $request->user()) {
            abort(403, 'Unauthorized');
        }

        foreach (explode('|', $permission) as $perm) {
            if ($request->user()->hasPermission($perm)) {
                return $next($request);
            }
        }

        abort(403, 'You do not have permission to access this resource.');
    }
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\POSPermissionDenialTest.php`
Expected: PASS (cả case mới + case cũ).

- [ ] **Step 5: Pint + commit**

```bash
git add app/Http/Middleware/CheckPermission.php tests/Feature/POSPermissionDenialTest.php
git commit -m "fix: CheckPermission ho tro permission OR (|) - staff cancel duoc"
```

---

## Task 4: I4 — DashboardService KDS status thật

**Files:**
- Modify: `app/Services/Manager/DashboardService.php`
- Test: `tests/Feature/DashboardServiceKdsTest.php` (mới)

**Interfaces:**
- Consumes: `posAdmin`, `posTable`, `posMenuItem`, `posOrder` helpers.
- Produces: KDS đếm `['pending','processing']` (đang chế biến) và `['completed']` (xong).

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/DashboardServiceKdsTest.php`:

```php
<?php

use App\Models\OrderItem;

test('dashboard kds dem processing la dang che bien va completed la xong', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem();
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'processing'],
        ['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'completed'],
    ], ['status' => 'processing']);

    $service = new App\Services\Manager\DashboardService;
    $today = \Carbon\Carbon::today();
    $ops = $service->liveOperations('today');

    expect($ops['kds']['pending_count'])->toBe(1);
    expect($ops['kds']['completed_count'])->toBe(1);
});
```

**Lưu ý:** helper `posOrder` đặt `created_at` = now (hôm nay) — đủ cho `whereDate('created_at', today())`. Nếu `posOrder` không mặc định today, thêm `forceFill(['created_at' => now()])->save()` cho order.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\DashboardServiceKdsTest.php`
Expected: FAIL — hiện đếm `['pending','cooking']`/`['ready','served']` → pending_count=0 (processing không match), completed_count=0.

- [ ] **Step 3: Sửa DashboardService**

`app/Services/Manager/DashboardService.php`:
- `:93` `['pending', 'cooking']` → `['pending', 'processing']`
- `:95` `['ready', 'served']` → `['completed']`

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\DashboardServiceKdsTest.php tests\Feature\DashboardTest.php`
Expected: PASS.

- [ ] **Step 5: Pint + commit**

```bash
git add app/Services/Manager/DashboardService.php tests/Feature/DashboardServiceKdsTest.php
git commit -m "fix: Dashboard KDS dung status that (processing/completed)"
```

---

## Task 5: I5 — SalesInvoiceReport đọc invoice snapshot

**Files:**
- Modify: `app/Http/Controllers/Manager/Reports/SalesInvoiceReportController.php`
- Test: `tests/Feature/Reports/SalesInvoiceReportTest.php` (thêm case)

**Interfaces:**
- Consumes: `Invoice` model; `InvoiceLine` (seed).
- Produces: `gross_amount`/`discount_amount` từ `invoice.subtotal_amount`/`invoice.discount_amount`; giữ `orders_count` (frontend dùng).

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/Feature/Reports/SalesInvoiceReportTest.php`:

```php
public function test_gross_discount_doc_tu_invoice_snapshot_khong_phai_orders_child()
{
    $this->actingAs($this->adminUser());
    $invoice = \App\Models\Invoice::create([
        'invoice_code' => 'SIR1', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 90000, 'change_amount' => 0, 'total_amount' => 90000,
        'subtotal_amount' => 100000, 'discount_amount' => 10000,
    ]);
    $invoice->forceFill(['issued_at' => '2026-07-15 10:00:00'])->save();

    $this->get('/sales-invoices?start_date=2026-07-01&end_date=2026-07-31')
        ->assertInertia(fn ($page) => $page
            ->has('invoices', 1)
            ->where('invoices.0.gross_amount', 100000)
            ->where('invoices.0.discount_amount', 10000)
        );
}
```

**Lưu ý:** route đúng là `/sales-invoices` (web.php:148). Test file PHPUnit style — `adminUser()` helper đã có trong file.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Reports\SalesInvoiceReportTest.php`
Expected: FAIL — hiện gross từ `orders->sum('subtotal')` = 0 (không có orders child).

- [ ] **Step 3: Sửa SalesInvoiceReportController**

Trong `app/Http/Controllers/Manager/Reports/SalesInvoiceReportController.php`:
- Bỏ `->with(['orders' => fn ($q) => $q->select('invoice_id', 'subtotal', 'discount_amount')])`.
- GIỮ `withCount('orders')` (frontend dùng orders_count).
- Đổi:
```php
                'gross_amount' => (float) $invoice->subtotal_amount,
                'discount_amount' => (float) $invoice->discount_amount,
```
(thay vì `$invoice->orders->sum('subtotal')` / `sum('discount_amount')`)

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\Reports\SalesInvoiceReportTest.php`
Expected: PASS.

- [ ] **Step 5: Pint + commit**

```bash
git add app/Http/Controllers/Manager/Reports/SalesInvoiceReportController.php tests/Feature/Reports/SalesInvoiceReportTest.php
git commit -m "fix: SalesInvoiceReport gross/discount doc tu invoice snapshot"
```

---

## Task 6: I6 — CheckoutService refresh orders.subtotal/vat_amount

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/Services/CheckoutServiceTest.php` (thêm case)

**Interfaces:**
- Consumes: `OrderTotals::vatInPrice`, `Order::items`, `OrderItem`.
- Produces: sau checkout, `orders.subtotal − discount == total` và `vat_amount` khớp VAT-trong-giá.

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/Feature/Services/CheckoutServiceTest.php`:

```php
test('checkout refresh subtotal va vat_amount cho order (khong lech sau reduce)', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 10]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'completed']], ['status' => 'completed']);

    // Giả lập: order subtotal snapshot cũ lệch (như sau reduce-items)
    $order->update(['subtotal' => 90000, 'vat_amount' => 0, 'total' => 90000]);

    $invoice = CheckoutService::run($order, [['method' => 'cash', 'amount' => 60000]], [], auth()->id());

    $fresh = $order->fresh();
    expect((float) $fresh->subtotal)->toBe(60000.0);       // 2 x 30000
    expect((float) $fresh->discount_amount)->toBe(0.0);
    expect((float) $fresh->total)->toBe(60000.0);
    // VAT trong giá: 60000 -> net=floor(60000/1.1)=54545, vat=5455
    expect((float) $fresh->vat_amount)->toBe(5455.0);
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Services\CheckoutServiceTest.php`
Expected: FAIL — subtotal giữ 90000 (không refresh), vat_amount 0.

- [ ] **Step 3: Sửa CheckoutService**

Trong `app/Services/Checkout/CheckoutService.php` loop update (`:206-225`), sau khi tính `$orderSubtotal` (đã có :207) và `$orderDiscount`, thêm tính `$orderVat` và ghi thêm:

```php
                $orderSubtotal = (float) $order->items()->where('status', '!=', 'cancelled')->sum('subtotal');
                $orderVat = (float) $order->items()->where('status', '!=', 'cancelled')->with('menuItem')->get()
                    ->sum(fn ($item) => OrderTotals::vatInPrice((float) $item->subtotal, (float) ($item->menuItem?->vat_rate ?? 0)));
                // ...giữ nguyên tính $orderDiscount/$orderTotal...

                $order->update([
                    'status' => 'paid',
                    'invoice_id' => $invoice->id,
                    'promotion_id' => $promotionRows[0]['promotion_id'] ?? null,
                    'subtotal' => $orderSubtotal,
                    'vat_amount' => $orderVat,
                    'discount_amount' => $orderDiscount,
                    'total' => $orderTotal,
                ]);
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\Services\CheckoutServiceTest.php tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php`
Expected: PASS (test mới + regression checkout).

- [ ] **Step 5: Pint + commit**

```bash
git add app/Services/Checkout/CheckoutService.php tests/Feature/Services/CheckoutServiceTest.php
git commit -m "fix: CheckoutService refresh subtotal/vat_amount cho order sau checkout"
```

---

## Task 7: P5 — PaymentsReport metric cọc held

**Files:**
- Modify: `app/Http/Controllers/Reports/PaymentsReportController.php`
- Modify: `resources/js/pages/reports/PaymentsReport.tsx`
- Test: `tests/Feature/Reports/PaymentsReportTest.php` (thêm case)

**Interfaces:**
- Consumes: `Deposit` model; `posAdmin`, `posTable`, `posMenuItem`, `posOrder` helpers.
- Produces: metrics mới `held_deposit_total`, `held_deposit_cash`, `held_deposit_bank`, `held_deposit_count`; frontend metric card "Cọc đang giữ".

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/Feature/Reports/PaymentsReportTest.php` (PHPUnit style — dùng `adminUser()` helper, KHÔNG dùng Pest helpers; deposit cần `order_id` hợp lệ nên tạo order qua `App\Models\Order::create` tối thiểu hoặc query model):

```php
    public function test_metrics_gom_coc_held_tao_trong_ky()
    {
        $this->actingAs($this->adminUser());

        // Tạo 2 đơn tối thiểu để có order_id hợp lệ cho deposits
        $item = \App\Models\MenuItem::firstOrCreate(['name' => 'Cf held'], ['price' => 100000, 'vat_rate' => 0, 'is_available' => true]);
        $table = \App\Models\Table::create(['table_number' => 'BH'.uniqid(), 'area' => 'Trong nhà', 'status' => 'available', 'capacity' => 4]);

        $order1 = \App\Models\Order::create(['order_code' => 'H1'.uniqid(), 'table_id' => $table->id, 'status' => 'pending', 'total' => 100000]);
        $order2 = \App\Models\Order::create(['order_code' => 'H2'.uniqid(), 'table_id' => $table->id, 'status' => 'pending', 'total' => 100000]);

        \App\Models\Deposit::create(['order_id' => $order1->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);
        \App\Models\Deposit::create(['order_id' => $order2->id, 'amount' => 50000, 'method' => 'bank_transfer', 'status' => 'held']);
        \App\Models\Deposit::create(['order_id' => $order2->id, 'amount' => 20000, 'method' => 'cash', 'status' => 'applied']);

        $this->get('/payments?start_date='.today()->toDateString().'&end_date='.today()->toDateString())
            ->assertInertia(fn ($page) => $page
                ->where('metrics.held_deposit_total', 80000)
                ->where('metrics.held_deposit_cash', 30000)
                ->where('metrics.held_deposit_bank', 50000)
                ->where('metrics.held_deposit_count', 2)
            );
    }
```

**Lưu ý:** kiểm tra `App\Models\Order` fillable (order_code/table_id/status/total) — nếu model yêu cầu thêm field (`employee_id` nullable ok), điều chỉnh. Route đúng là `/payments`. Deposits `created_at` = now (hôm nay) — khớp `whereBetween(created_at, today)`. Cọc `applied` (20000) KHÔNG tính vào held.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Reports\PaymentsReportTest.php`
Expected: FAIL — metrics chưa có held_deposit_total.

- [ ] **Step 3: Sửa PaymentsReportController**

Trong `app/Http/Controllers/Reports/PaymentsReportController.php`, thêm import `use App\Models\Deposit;` và sau phần tính `$bankTotal`:

```php
        // Cọc đang giữ tạo trong kỳ (chưa có invoice — tiền thật đã thu)
        $heldDeposits = Deposit::query()
            ->where('status', 'held')
            ->whereBetween('created_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->get();

        $heldCash = (float) $heldDeposits->where('method', 'cash')->sum('amount');
        $heldBank = (float) $heldDeposits->where('method', 'bank_transfer')->sum('amount');
        $heldTotal = (float) $heldDeposits->sum('amount');
```

Thêm vào `metrics`:
```php
                'held_deposit_total' => $heldTotal,
                'held_deposit_cash' => $heldCash,
                'held_deposit_bank' => $heldBank,
                'held_deposit_count' => $heldDeposits->count(),
```

- [ ] **Step 4: Sửa PaymentsReport.tsx**

Trong `resources/js/pages/reports/PaymentsReport.tsx`:
- `Metrics` interface thêm `held_deposit_total: number;`
- Thêm metric card (sau "Chuyển khoản", icon Banknote):
```tsx
        {
            label: 'Cọc đang giữ',
            value: formatVND(metrics.held_deposit_total),
            icon: Banknote,
            color: 'text-violet-600 dark:text-violet-400',
        },
```

- [ ] **Step 5: Chạy test pass + types**

Run: `php artisan test tests\Feature\Reports\PaymentsReportTest.php`
Expected: PASS.

Run: `npm run types:check; if ($?) { npm run build }`
Expected: PASS cả 2.

- [ ] **Step 6: Pint + commit**

```bash
git add app/Http/Controllers/Reports/PaymentsReportController.php resources/js/pages/reports/PaymentsReport.tsx tests/Feature/Reports/PaymentsReportTest.php
git commit -m "feat: PaymentsReport them metric coc held (tach rieng khoi doanh thu)"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (234 + các test mới)
- [ ] `npm run types:check` — pass
- [ ] `npm run build` — pass
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `git status` — tree sạch, không file lạ
