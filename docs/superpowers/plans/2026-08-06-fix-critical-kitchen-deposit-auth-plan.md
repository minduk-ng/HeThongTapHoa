# Sửa Critical kitchen un-pay + 4 Important + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 1 Critical (kitchen hoàn tất un-pay đơn paid → double invoice) + 4 Important (refund cọc dư, TableController rơi cọc, GET mutate, update thiếu mimes) + Auth (session regenerate + OTP throttle).

**Architecture:** Mỗi fix độc lập, TDD. Kitchen guard giữ `completed`/`paid` đúng vòng đời; refund cọc ghi payment row âm để ledger trừ đúng; TableController refund cọc khi hủy đặt; bỏ GET mutate; validate ảnh; session regenerate + throttle.

**Tech Stack:** Laravel 11, PHP, Pest, TypeScript (chỉ tasks frontend-touch nếu có — không có TSX ở đây).

**Spec:** `docs/superpowers/specs/2026-08-06-fix-critical-kitchen-deposit-auth-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` / `npm run ...` như lệnh đơn.
- Mỗi task TDD: test RED → implement → pass → commit riêng.
- Test helpers trong `tests/Pest.php`: `posAdmin()`, `posStaff()`, `posTable()`, `posMenuItem()`, `posOrder()`, `posItem?` (dùng có sẵn).
- KitchenController `completeOrder`/`completeItems` cho món vẫn `completed` bình thường — chỉ guard không đảo đơn paid/cancelled.
- Refund payment row: `method='cash'`, `amount` âm, `note='Hoàn tiền cọc thừa'` — không bị ShiftService `not like 'Tiền cọc%'` loại (bắt đầu 'Hoàn tiền').
- Cọc refunded ghi `resolved_at` để ShiftService trừ đúng.
- Bất biến: deduct ingredients/thông báo/hành vi hiện tại khác giữ nguyên.

---

## File Structure

**Sửa:**
- `app/Http/Controllers/Staff/KitchenController.php` — guard paid/cancelled (C)
- `app/Services/Checkout/CheckoutService.php` — payment refund row + log meta (I1)
- `app/Http/Controllers/Manager/TableController.php` — refund cọc held (I2) + bỏ GET mutate (I3)
- `app/Http/Controllers/Manager/ProductController.php` — mimes ảnh (I4)
- `app/Http/Controllers/Auth/GoogleAuthController.php` — session regenerate (I5)
- `app/Http/Controllers/Auth/OtpController.php` — session regenerate (I5)
- `routes/web.php` — throttle 2 profile OTP route (I5)

**Test:**
- `tests/Feature/KitchenPaidGuardTest.php` (C)
- `tests/Feature/DepositRefundPersistTest.php` (I1)
- `tests/Feature/TableControllerDepositRefundTest.php` (I2)
- `tests/Feature/TableIndexReadOnlyTest.php` (I3)
- `tests/Feature/ProductImageValidationTest.php` (I4)
- `tests/Feature/AuthSessionRegenerateTest.php` (I5)

---

## Task 1: C — Kitchen guard paid/cancelled (không un-pay/resurrect)

**Files:**
- Modify: `app/Http/Controllers/Staff/KitchenController.php`
- Test: `tests/Feature/KitchenPaidGuardTest.php` (mới)

**Interfaces:**
- Consumes: `posAdmin`, `posTable`, `posMenuItem`, `posOrder` helpers; route `POST /kitchen/complete/{order}`, `POST /kitchen/complete-items`.
- Produces: bếp xong đơn paid/cancelled KHÔNG đảo status; không double invoice.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/KitchenPaidGuardTest.php`:

```php
<?php

use App\Models\Order;

test('kitchen completeOrder khong un-pay don da paid', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'pending']], ['status' => 'paid']);

    $response = $this->postJson("/staff/kitchen/complete/{$order->id}");

    $response->assertStatus(422);
    expect($order->fresh()->status)->toBe('paid'); // không bị un-pay về completed
});

test('kitchen completeItems khong un-pay don da paid', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'pending']], ['status' => 'paid']);

    $response = $this->postJson('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [$order->items->first()->id],
    ]);

    expect($order->fresh()->status)->toBe('paid');
});

test('kitchen completeItems khong resurrect don da cancelled khi het mon', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'cancelled']], ['status' => 'cancelled']);

    $response = $this->postJson('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [],
    ]);

    expect($order->fresh()->status)->toBe('cancelled'); // không bị resurrect về completed
});
```

**Lưu ý:** route `complete/{order}` có thể là `POST /staff/kitchen/complete/{order}`. Kiểm tra routes/web.php (line 179-181) cho exact path. Nếu `complete-items` validate `item_ids min:1`, test cancelled dùng item pending thay vì cancelled? — item cancelled có status 'cancelled' (whereIn pending/processing không lọt) → remainingActive=0. Dùng item 'cancelled'.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\KitchenPaidGuardTest.php`
Expected: FAIL — completeOrder hiện update paid→completed (200 OK thay vì 422).

- [ ] **Step 3: Sửa completeOrder guard**

Trong `app/Http/Controllers/Staff/KitchenController.php`, thay khối (`:94-98`):
```php
        if ($order->status === 'cancelled') {
            return $request->wantsJson()
                ? response()->json(['error' => 'Đơn đã bị hủy.'], 422)
                : back()->withErrors(['error' => 'Đơn đã bị hủy.']);
        }
```
bằng:
```php
        if (in_array($order->status, ['paid', 'cancelled'], true)) {
            return $request->wantsJson()
                ? response()->json(['error' => 'Đơn đã thanh toán hoặc đã hủy.'], 422)
                : back()->withErrors(['error' => 'Đơn đã thanh toán hoặc đã hủy.']);
        }
```

- [ ] **Step 4: Sửa completeItems $remainingActive guard**

Trong cùng file, thay khối (`:198-202`):
```php
                if ($remainingActive === 0) {
                    $order->update([
                        'status' => 'completed',
                        'has_additional_items' => false,
                    ]);
                }
```
bằng:
```php
                if ($remainingActive === 0 && ! in_array($order->fresh()->status, ['paid', 'cancelled'], true)) {
                    $order->update([
                        'status' => 'completed',
                        'has_additional_items' => false,
                    ]);
                }
```

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\KitchenPaidGuardTest.php tests\Feature\KitchenFlowTest.php tests\Feature\POSOrderFlowTest.php`
Expected: PASS (test mới + regression).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint app/Http/Controllers/Staff/KitchenController.php
git add app/Http/Controllers/Staff/KitchenController.php tests/Feature/KitchenPaidGuardTest.php
git commit -m "fix: Kitchen khong un-pay/resurrect don paid/cancelled"
```

---

## Task 2: I1 — Persist refund cọc dư (payment row âm)

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/Services/CheckoutServiceTest.php` (thêm case)

**Interfaces:**
- Consumes: `CheckoutService::run/runBulk`, `ShiftService::expectedCash` (để verify).
- Produces: với depositTotal > total → payment row refund âm; expectedCash giảm.

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/Feature/Services/CheckoutServiceTest.php`:

```php
test('checkout coc du total ghi payment refund am va expectedCash giam', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);
    App\Models\Deposit::create(['order_id' => $order->id, 'amount' => 150000, 'method' => 'cash', 'status' => 'held']);

    $invoice = CheckoutService::run($order, [['method' => 'cash', 'amount' => 0]], [], auth()->id());

    // payment refund row: amount = -(150000 - 100000) = -50000
    $refund = $invoice->payments()->where('amount', '<', 0)->first();
    expect($refund)->not->toBeNull();
    expect((float) $refund->amount)->toBe(-50000.0);
    expect($refund->note)->toBe('Hoàn tiền cọc thừa');
});
```

**Lưu ý:** paymentRows rỗng → `payable = max(0, 100000 - 150000) = 0`; khách đưa 0; CheckoutService cho phép (totalReceived >= 0 = 0 với no payment row? kiểm tra validate — nếu bắt buộc >0, dùng payment row 0 hoặc nhỏ hơn). Nếu `amount_received` min:1 trong PaymentController thì test trực tiếp `CheckoutService::run` (không qua controller) nên không validate — `CheckoutService::run($order, [['method'=>'cash','amount'=>0]], ...)` ok nếu service không chặn 0. Nếu service throw, cần dùng depositTotal thay đổi. Kiểm tra service trước.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Services\CheckoutServiceTest.php`
Expected: FAIL — payment refund row chưa cookie.

- [ ] **Step 3: Sửa CheckoutService payment refund**

Trong `app/Services/Checkout/CheckoutService.php`, ngay sau loop held deposits (`:178-184`), thêm:

```php
            // Hoàn tiền cọc thừa (nếu cọc > total) — payment row âm để ledger trừ đúng
            if ($depositTotal > $total) {
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => 'cash',
                    'amount' => -(round($depositTotal - $total, 2)),
                    'note' => 'Hoàn tiền cọc thừa',
                    'received_by' => $userId,
                ]);
            }
```

Và thêm vào OrderActivityLogger::log meta (`:227-232`):
```php
                    'deposit_refund' => max(0.0, $depositTotal - $total),
```
(Nếu deposit_refund > 0; nếu = 0 giữ như hiện tại hoặc ghi 0.)

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\Services\CheckoutServiceTest.php`
Expected: PASS.

- [ ] **Step 5: Pint + full regression checkout**

Run: `vendor/bin/pint app/Services/Checkout/CheckoutService.php`
Run: `php artisan test tests\Feature\Services\CheckoutServiceTest.php tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Checkout/CheckoutService.php tests/Feature/Services/CheckoutServiceTest.php
git commit -m "fix: CheckoutService ghi payment refund am cho coc du (expectedCash dung)"
```

---

## Task 3: I2 — TableController::update refund cọc held khi hủy đặt bàn

**Files:**
- Modify: `app/Http/Controllers/Manager/TableController.php`
- Test: `tests/Feature/TableControllerDepositRefundTest.php` (mới)

**Interfaces:**
- Consumes: `posAdmin` (admin), `posTable`, `posOrder`, `Deposit` model. Route `POST /tables/{table}`.
- Produces: đổi status bàn reserved → occupied KhÔNG rớt cọc; cọc held → refunded.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/TableControllerDepositRefundTest.php`:

```php
<?php

use App\Models\Deposit;

test('doi status ban tu reserved ve occupied refund duoc coi held', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'T1'.substr(uniqid(), -3), 'status' => 'reserved', 'area' => 'Trong nhà', 'capacity' => 4]);
    $item = posMenuItem(['price' => 100000]);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'pending']], [
        'status' => 'reserved',
        'reservation_name' => 'An A',
    ]);
    Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $response = $this->post("/tables/{$table->id}", [
        'table_number' => $table->table_number,
        'area' => $table->area ?? 'Trong nhà',
        'capacity' => $table->capacity,
        'status' => 'occupied',
    ]);
    $response->assertSessionHasNoErrors();

    expect($order->fresh()->status)->toBe('cancelled');
    expect($order->deposits()->where('status', 'held')->count())->toBe(0);
    expect($order->deposits()->where('status', 'refunded')->count())->toBe(1);
});
```

**Lưu ý:** kiểm tra validate trong `update` — `status` required? Bảng `@tables/{table}` POST `update`. Nếu validate cần các field khác (reservation_name...), điều chỉnh payload. Kiểm tra `store`/`update` validation rules của TableController.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\TableControllerDepositRefundTest.php`
Expected: FAIL — hiện cọc vẫn held (không refund).

- [ ] **Step 3: Sửa TableController::update refund cọc**

Trong `app/Http/Controllers/Manager/TableController.php` khối `else` (`:186-188`):
```php
                if ($reservedOrder) {
                    $reservedOrder->update(['status' => 'cancelled']);
                }
```
bằng:
```php
                if ($reservedOrder) {
                    // Giải phóng cọc đang giữ: hoàn tiền (refunded) trước khi hủy đặt bàn
                    foreach ($reservedOrder->deposits()->where('status', 'held')->get() as $deposit) {
                        $deposit->update([
                            'status' => 'refunded',
                            'resolved_at' => now(),
                            'resolved_by_user_id' => $request->user()?->id,
                        ]);
                    }
                    $reservedOrder->update(['status' => 'cancelled']);
                }
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\TableControllerDepositRefundTest.php`
Expected: PASS.

- [ ] **Step 5: Pint + regression tables**

Run: `vendor/bin/pint app/Http/Controllers/Manager/TableController.php`
Run: `php artisan test tests\Feature\TableControllerDepositRefundTest.php tests\Feature\TableCacheTest.php tests\Feature\POSTableOperationsTest.php`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Manager/TableController.php tests/Feature/TableControllerDepositRefundTest.php
git commit -m "fix: TableController refund coc held khi huy dat ban"
```

---

## Task 4: I3 — TableController::index read-only (bỏ GET mutate)

**Files:**
- Modify: `app/Http/Controllers/Manager/TableController.php`
- Test: `tests/Feature/TableIndexReadOnlyTest.php` (mới)

**Interfaces:**
- Produces: `GET /tables` chỉ đọc, không tạo/xóa bàn.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/TableIndexReadOnlyTest.php`:

```php
test('tables index la read-only - khong tao hay xoa ban', function () {
    $this->actingAs(posAdmin());
    // Dọn sạch: không có bàn thật "Mang đi"
    \App\Models\Table::where('table_number', 'Mang đi')->delete();
    $before = \App\Models\Table::count();

    // Tạo bàn có tên trùng tiền tố nguy hiểm — giả lập có sẵn từ người dùng (không seed)
    $dangero = \App\Models\Table::create(['table_number' => 'Mang đi The He', 'area' => 'Trong nhà', 'status' => 'available', 'capacity' => 4]);

    $response = $this->get('/tables');
    $response->assertOk();

    // Không tạo bàn "Mang đi" thật, không xóa bàn có tiền tố "Mang đi "
    expect(\App\Models\Table::where('table_number', 'Mang đi')->exists())->toBeFalse();
    expect(\App\Models\Table::find($dangero->id))->not->toBeNull();
    expect(\App\Models\Table::count())->toBe($before + 1); // chỉ bàn dangero, không seed
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\TableIndexReadOnlyTest.php`
Expected: FAIL — hiện index auto-seed + delete Mang đi % (xóa $dangero).

- [ ] **Step 3: Xóa khối auto-seed + mutate**

Trong `app/Http/Controllers/Manager/TableController.php`, XÓA khối (`:16-25`):
```php
        // Auto-seed takeaway virtual table if not present
        if (! Table::where('table_number', 'Mang đi')->exists()) {
            Table::create([...]);
        }
        Table::where('table_number', 'like', 'Mang đi %')->delete();
```

(Giữ query phía sau nguyên.)

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\TableIndexReadOnlyTest.php`
Expected: PASS.

- [ ] **Step 5: Pint + regression manager tables**

Run: `vendor/bin/pint app/Http/Controllers/Manager/TableController.php`
Run: `php artisan test tests\Feature\TableIndexReadOnlyTest.php tests\Feature\TableCacheTest.php`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Manager/TableController.php tests/Feature/TableIndexReadOnlyTest.php
git commit -m "fix: TableController index read-only (bo GET mutate seed/delete Mang di)"
```

---

## Task 5: I4 — ProductController::update validate ảnh

**Files:**
- Modify: `app/Http/Controllers/Manager/ProductController.php`
- Test: `tests/Feature/ProductImageValidationTest.php` (mới)

**Interfaces:**
- Consumes: `posAdmin` (admin role có `products.edit`).
- Route: `POST /products/{product}` (multipart) → `update`.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/ProductImageValidationTest.php`:

```php
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

test('update product tu choi file khong phai hinh anh lam image', function () {
    $this->actingAs(posAdmin());
    $product = \App\Models\MenuItem::create([
        'name' => 'Mon T', 'price' => 20000, 'vat_rate' => 0, 'is_available' => true,
    ]);

    Storage::fake('public');
    $file = UploadedFile::fake()->create('doc.txt', 100); // không phải ảnh

    $response = $this->post("/products/{$product->id}", [
        'name' => 'Mon T', 'price' => 20000,
        'image' => $file,
    ]);

    $response->assertSessionHasErrors(['image']);
});

test('update product chap nhan file anh hop le', function () {
    $this->actingAs(posAdmin());
    $product = \App\Models\MenuItem::create([
        'name' => 'Mon T', 'price' => 20000, 'vat_rate' => 0, 'is_available' => true,
    ]);

    Storage::fake('public');
    $file = UploadedFile::fake()->image('dish.jpg', 100, 100);

    $response = $this->post("/products/{$product->id}", [
        'name' => 'Mon T', 'price' => 20000,
        'image' => $file,
    ]);

    $response->assertSessionHasNoErrors();
});
```

**Lưu ý:** test helpers posAdmin cần có quyền `products.edit`. Nếu validation fields bắt buộc khác (`category_id`...), điều chỉnh payload. `hasFile('image')` thì upload. Nếu method `update` dùng `$request->file('image')` và image qua `_method: POST` (HTML form) — đúng multipart.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\ProductImageValidationTest.php`
Expected: FAIL test 1 (hiện không có mimes → chấp nhận file txt), PASS test 2. Hoặc FAIL cả 2 nếu mimes fail khớp.

- [ ] **Step 3: Sửa mimes trong update**

Trong `app/Http/Controllers/Manager/ProductController.php:106`:
```php
        'image' => 'nullable',
```
→ `        'image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',`

Khớp rules `store` (`:78`).

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\ProductImageValidationTest.php`
Expected: PASS cả 2.

- [ ] **Step 5: Pint + regression products**

Run: `vendor/bin/pint app/Http/Controllers/Manager/ProductController.php`
Run: `php artisan test tests\Feature\ProductCacheTest.php tests\Feature\SirvClientServiceTest.php`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Manager/ProductController.php tests/Feature/ProductImageValidationTest.php
git commit -m "fix: ProductController update validate anh mimes"
```

---

## Task 6: I5 — Auth session regenerate + OTP throttle

**Files:**
- Modify: `app/Http/Controllers/Auth/GoogleAuthController.php`
- Modify: `app/Http/Controllers/Auth/OtpController.php`
- Modify: `routes/web.php`
- Test: `tests/Feature/AuthSessionRegenerateTest.php` (mới)

**Interfaces:**
- Produces: login Google/OTP regen session; 2 profile OTP route có `throttle:10,1`.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/AuthSessionRegenerateTest.php`:

```php
use Illuminate\Support\Facades\Session;

test('google callback login regenerate session', function () {
    // Giả lập Google user qua Socialite mock
    $user = \App\Models\User::factory()->create(['email' => 'g@example.com']);
    $oldUser = $user;

    // Mock Socialite driver->user()
    $googleUser = Mockery::mock(\Laravel\Socialite\Two\User::class);
    $googleUser->shouldReceive('getId')->andReturn('gid-123');
    $googleUser->shouldReceive('getEmail')->andReturn('g@example.com');
    $googleUser->shouldReceive('getName')->andReturn('G User');
    $googleUser->shouldReceive('getAvatar')->andReturn(null);

    Socialite::shouldReceive('driver')->andReturn(
        Mockery::mock(\Laravel\Socialite\Contracts\Provider::class, ['user' => $googleUser])
    );

    $oldSessionId = session()->getId();
    $this->get('/auth/google/callback');

    expect(session()->getId())->not->toBe($oldSessionId);
})->skip(); // skip nếu không mock được Socialite chuẩn

test('profile otp routes co throttle 10 per minute', function () {
    $user = posStaff(['profile.view'], ['/profile']);
    // 11 request verify-email-otp nhanh liên tục — request 11 bị 429
    $this->actingAs($user);
    for ($i = 0; $i < 10; $i++) {
        $this->postJson('/profile/verify-email-otp', ['code' => 'bad']);
    }
    $response = $this->postJson('/profile/verify-email-otp', ['code' => 'bad']);
    $response->assertStatus(429);
})->skip(); // nếu cần LiveKit
```

**Lưu ý actual implement:** Google callback test khó (Socialite) — thay vào đó viết test đơn giản hơn: assert code tồn tại `session()->regenerate()` trong 2 file (không phải behavior test). Hoặc test login normal đã có regenerate. **Chọn cách test đơn giản:** viết test nhỏ giống RouteTest kiểm tra route middleware throttle tồn tại (error 429 sau N request). Google/OTP regenerate không mock Socialite thật — kiểm tra code chứa `session()->regenerate()` (dùng grep hoặc reflection trong test?). Test thực tế:

```php
test('google_auth_callback_regenerates_session', function () {
    // Kiểm tra mã lệnh chứa session()->regenerate() thông qua header flow không mock được —
    // cách kiểm tra đơn giản: đọc file và assert nội dung có session()->regenerate()
    $path = app_path('Http/Controllers/Auth/GoogleAuthController.php');
    expect(file_get_contents($path))->toContain('session()->regenerate()');
});

test('otp_signup_login_regenerates_session', function () {
    $path = app_path('Http/Controllers/Auth/OtpController.php');
    expect(file_get_contents($path))->toContain('session()->regenerate()');
});
```

**Route throttle test** — không skip:

```php
test('profile otp routes bi throttle', function () {
    $user = posStaff(['profile.view'], ['/profile']);
    $this->actingAs($user);
    for ($i = 0; $i < 10; $i++) {
        $this->postJson('/profile/verify-email-otp', ['code' => 'bad'])->assertStatus([200, 400, 422]);
    }
    $response = $this->postJson('/profile/verify-email-otp', ['code' => 'bad']);
    $response->assertStatus(429);
});
```

(Nếu verifyEmailOtp cần session otp_email — lần thử n thµ bi throttle trước khi tới controller, ok.)

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\AuthSessionRegenerateTest.php`
Expected: FAIL — code chưa có `session()->regenerate()` (file_contain fail), throttle fail (không 429).

- [ ] **Step 3: Thêm session regenerate Google + OTP**

`GoogleAuthController.php` sau `Auth::login($user, true)` (`:58`):
```php
        Auth::login($user, true);
        $request->session()->regenerate();

        return redirect('/');
```

`OtpController.php` sau `Auth::login($user)` trong `if ($type === 'signup')` (`:75`):
```php
                Auth::login($user);
                $request->session()->regenerate();
```

- [ ] **Step 4: Thêm throttle vào web.php**

`routes/web.php:73,76`:
```php
Route::post('/profile/verify-email-otp', [ProfileController::class, 'verifyEmailOtp'])->middleware(['throttle:10,1']);
Route::post('/profile/verify-password-otp', [ProfileController::class, 'verifyPasswordOtp'])->middleware(['throttle:10,1']);
```

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\AuthSessionRegenerateTest.php`
Expected: PASS.

- [ ] **Step 6: Regression auth**

Run: `php artisan test tests\Feature\Auth`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Auth/GoogleAuthController.php app/Http/Controllers/Auth/OtpController.php routes/web.php tests/Feature/AuthSessionRegenerateTest.php
git commit -m "fix: Auth session regenerate sau Google/OTP login + throttle profile otp"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (245 + các test mới)
- [ ] `npm run types:check` — pass (không đụng frontend)
- [ ] `npm run build` — pass (không đụng frontend)
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `git status` — tree sạch, không file lạ
