# Design: Bỏ chặn `pos.bypass_kitchen_lock` ("Duyệt khẩn cấp") — cho phép thanh toán khi món đang ở bếp

**Ngày:** 2026-08-17
**Phạm vi:** Bỏ hoàn toàn tính năng "Duyệt khẩn cấp thanh toán" (`pos.bypass_kitchen_lock`): thanh toán (đơn lẻ + bulk) được phép ngay cả khi đơn có món đang `pending/processing` ở bếp. Bếp/phục vụ vẫn hiển thị và hoàn thành món bình thường sau khi đơn đã `paid`. Xoá permission khỏi toàn bộ hệ thống (DB, seeder, roles, frontend, docs, tests).

---

## Bối cảnh & Vấn đề

Hiện tại hệ thống chặn thanh toán khi đơn có món đang ở bếp (trạng thái `pending`/`processing`), trừ khi người dùng có quyền `pos.bypass_kitchen_lock` ("Duyệt khẩn cấp"). Điều này gây phiền phức thực tế: khách muốn thanh toán luôn nhưng phải chờ bếp hoàn thành, hoặc phải có người có quyền bấm "Duyệt khẩn cấp".

Nhu cầu: bỏ hẳn cơ chế chặn này — thanh toán được ngay khi đơn vừa gửi xuống bếp. Sau khi thanh toán, bếp/phục vụ vẫn tiếp tục hoàn thành món (khách đã trả tiền nhưng món vẫn được làm và phục vụ).

## Quyết định

- **Bỏ chặn kitchen lock** ở cả `checkout()` (đơn lẻ) và `bulkCheckout()` (gộp).
- **Giữ nguyên chặn món nháp** chưa gửi bếp (`isConfirmed=false` / `hasUnconfirmedChanges`) — khách phải gửi toàn bộ món xuống bếp trước khi thanh toán.
- **Sau thanh toán**: bếp/phục vụ vẫn hiển thị + hoàn thành món bình thường (không tự hủy, không thay đổi luồng bếp).
- **Xoá hoàn toàn permission** `pos.bypass_kitchen_lock` khỏi hệ thống.

---

## Kiến trúc & Thay đổi

### 1. Backend — `app/Http/Controllers/Staff/PaymentController.php`

**`checkout()` (dòng ~189-197):** xoá khối kiểm tra kitchen lock:

```php
                // Check if this order is still pending/processing in kitchen
                $hasUncompletedItems = $order->items->contains(function ($item) {
                    return in_array($item->status, ['pending', 'processing']);
                });

                $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
                if ($hasUncompletedItems && ! $canBypass) {
                    throw new \Exception('Bạn không có quyền duyệt khẩn cấp thanh toán khi món chưa được Bếp hoàn tất.');
                }
```

→ Xoá toàn bộ khối này. Đơn có món pending/processing vẫn thanh toán bình thường.

**`bulkCheckout()` (dòng ~360-369):** xoá khối tương tự:

```php
                // Kitchen lock check
                $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
                if (! $canBypass) {
                    foreach ($orders as $ord) {
                        $hasUncompleted = $ord->items->contains(fn ($item) => in_array($item->status, ['pending', 'processing']));
                        if ($hasUncompleted) {
                            throw new \Exception("Đơn {$ord->order_code} còn món chưa được Bếp hoàn tất.");
                        }
                    }
                }
```

→ Xoá toàn bộ khối này.

**Lưu ý:** trạng thái món không bị đổi — món vẫn `pending/processing/completed`. Chỉ là thanh toán không còn phụ thuộc trạng thái món.

### 2. Frontend — `resources/js/pages/staff/pos/components/POSCartPanel.tsx`

- **Xoá `canBypassKitchen`** (dòng 87-89):
```ts
    const canBypassKitchen = !!(
        auth?.is_admin || auth?.permissions?.includes('pos.bypass_kitchen_lock')
    );
```
- **Xoá state `managerBypass`** (dòng 95): `const [managerBypass, setManagerBypass] = useState(false);`
- **Xoá `isKitchenBlocked`** (dòng 187): `const isKitchenBlocked = hasKitchenPendingOrders && !managerBypass;`
- **`isPaymentBlocked`** (dòng 188-191) đổi thành:
```ts
    const isPaymentBlocked =
        hasUnconfirmedChanges ||
        activeInvoiceId.startsWith('draft_');
```
- **Xoá banner kitchen** (dòng 751-766) — toàn bộ block `{hasKitchenPendingOrders && (...)}` với nút "Duyệt khẩn cấp"/"Bắt buộc khóa".
- **Button title** (dòng 904-905): bỏ nhánh `isKitchenBlocked`:
```ts
                                                    : isTakeaway
                                                    ? 'Thanh toán đơn hiện tại'
                                                    : 'Thanh toán tất cả đơn'
```
- Kiểm tra `hasKitchenPendingOrders` (dòng 183-185) còn dùng nơi khác không — nếu chỉ phục vụ banner/kitchen block thì xoá luôn biến (tránh dead code).

### 3. Permission — xoá hoàn toàn `pos.bypass_kitchen_lock`

- **`database/seeders/AuthorizationSeeder.php:208`** — bỏ `'pos.bypass_kitchen_lock',` khỏi mảng.
- **`app/Http/Controllers/Admin/RoleController.php:30`** — bỏ `'pos.bypass_kitchen_lock',` khỏi `$systemPermissions`.
- **`resources/js/pages/admin/RolesManager.tsx:22`** — bỏ `bypass_kitchen_lock: 'Duyệt khẩn cấp thanh toán',` khỏi `PERMISSION_LABEL_DICTIONARY`.
- **Migration mới** (`2026_08_17_000001_remove_bypass_kitchen_lock_permission.php`): xoá bản ghi quyền còn tồn tại trong DB (nếu có — user đã gán ở các role cũ):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->where('name', 'pos.bypass_kitchen_lock')->delete();
    }

    public function down(): void
    {
        // Không khôi phục — quyền đã bị loại khỏi hệ thống có chủ đích.
    }
};
```
Kiểm tra tên bảng: `permissions` + pivot `role_permissions` — nếu có FK cascade thì xoá 1 dòng `permissions` tự dọn pivot; nếu không, xoá pivot trước. Đọc migration tạo bảng `permissions` để xác định.

**RÀNG BUỘC AN TOÀN DB (bắt buộc — không được ảnh hưởng dữ liệu khác):**
- Migration CHỈ được phép chạy 1 câu DELETE có `WHERE name = 'pos.bypass_kitchen_lock'` trên bảng `permissions`.
- KHÔNG dùng `Schema::dropIfExists`, KHÔNG drop bảng, KHÔNG xoá toàn bộ `permissions`/`roles`/`role_permissions`, KHÔNG truncate.
- KHÔNG đụng các bảng khác (users, orders, invoices, tables, promotions, pages, ...) — tuyệt đối không chạy bất kỳ lệnh DDL/DML nào ngoài 1 DELETE có WHERE ở trên.
- Pivot `role_permissions` có `cascadeOnDelete` (migration `0001_01_01_000002_create_authorization_tables.php:36-37`) → xoá 1 dòng `permissions` tự động dọn pivot liên quan. Không cần xoá pivot thủ công.
- Trước khi viết migration, xác nhận tên bảng bằng `php artisan tinker --execute="echo DB::table('permissions')->where('name','pos.bypass_kitchen_lock')->count();"` và đếm bản ghi bị ảnh hưởng. Nếu count = 0, migration vẫn chạy được (no-op, không lỗi).
- Sau khi migrate, chạy `php artisan migrate:status` + test toàn bộ xanh để xác nhận không break.

### 4. Docs

- **`README.md:18,55`** — bỏ 2 dòng nhắc "Duyệt khẩn cấp" / `pos.bypass_kitchen_lock` (dòng 18 mô tả khóa nút, dòng 55 ví dụ RBAC).
- **`docs/PROJECT_CONTEXT_AND_ROUTING.md:159,167,178,223`** — bỏ `pos.bypass_kitchen_lock` khỏi ví dụ permission + mục 8.4 "Khóa khi món đang chế biến... bấm Duyệt khẩn cấp" (thay bằng mô tả mới: thanh toán được ngay, bếp vẫn hoàn thành).

### 5. Tests

- **`tests/Feature/POSCheckoutTest.php`:**
  - XOÁ test `người có quyền bypass_kitchen_lock được duyệt khẩn cấp thanh toán món chưa hoàn tất` (dòng 43-60) — quyền không còn.
  - ĐỔI test `nhân viên thường không thể thanh toán khi món chưa được bếp hoàn tất` (dòng 23-41) thành `thanh toán được khi đơn còn món pending/processing (không cần quyền)`:
```php
test('thanh toán được khi đơn còn món pending/processing ở bếp', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $this->actingAs($staff);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'pending']]);

    $response = $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasNoErrors();
    expect($order->fresh()->status)->toBe('paid');
    expect(Invoice::count())->toBe(1);
});
```
  - Cập nhật comment đầu file (dòng 13-14).
- **`tests/Feature/POSBulkCheckoutTest.php`:**
  - ĐỔI test `khóa bếp: thanh toán gộp bị chặn nếu bất kỳ đơn nào còn món chưa hoàn tất` (dòng 141-161) thành `thanh toán gộp được khi đơn còn món chưa hoàn tất`:
```php
test('thanh toán gộp được khi đơn còn món pending/processing', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $this->actingAs($staff);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $doneOrder = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);
    $cookingOrder = posOrder($table, [['item' => $item, 'status' => 'processing']]);

    $response = $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$doneOrder->id, $cookingOrder->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 40000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasNoErrors();
    expect(Invoice::count())->toBe(1);
});
```
  - Cập nhật comment đầu file (dòng 17).
- **Thêm test mới:** `sau thanh toán, bếp vẫn hoàn thành món của đơn đã paid`:
```php
test('bếp vẫn hoàn thành món sau khi đơn đã thanh toán', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'status' => 'pending']]);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();
    expect($order->fresh()->status)->toBe('paid');

    // Bếp hoàn thành món của đơn đã paid
    $orderItem = $order->items()->first();
    $this->actingAs(posAdmin())->post('/staff/kitchen/complete-items', [
        'item_ids' => [$orderItem->id],
    ])->assertOk();

    expect($orderItem->fresh()->status)->toBe('completed');
});
```
Route thật: `POST /staff/kitchen/complete-items` (KitchenController@completeItems, middleware `kitchen.update`). Xem `tests/Feature/KitchenFlowTest.php` để lấy pattern gọi chuẩn.

### 6. `tests/Pest.php:83` — comment helper

Bỏ nhắc `pos.bypass_kitchen_lock` trong comment nếu có (dòng 83 nói "ví dụ thiếu pos.bypass_kitchen_lock") — đổi ví dụ sang `pos.cancel_item`.

---

## Error handling

- Không còn lỗi "Bạn không có quyền duyệt khẩn cấp..." / "Đơn ... còn món chưa được Bếp hoàn tất." — các throw này bị xoá.
- Vẫn giữ các chặn hợp lệ khác: đơn đã paid/cancelled, đơn reserved chưa check-in, tiền không đủ, giỏ nháp chưa gửi bếp (frontend).

## Testing

- `php artisan test` toàn bộ xanh.
- `npx eslint`, `npm run types:check`, `npm run build` pass.
- Kiểm tra thủ công POS: gửi đơn xuống bếp (món pending) → bấm Thanh toán được ngay; sau đó vào màn hình Bếp thấy món vẫn hiện và hoàn thành bình thường.
- **Kiểm tra DB an toàn:**
  - Trước migrate: `php artisan tinker --execute="echo DB::table('permissions')->where('name','pos.bypass_kitchen_lock')->count();"` — ghi nhận số bản ghi.
  - Sau migrate: `php artisan tinker --execute="echo DB::table('permissions')->where('name','pos.bypass_kitchen_lock')->count();"` → phải bằng 0.
  - Xác nhận các bảng khác KHÔNG đổi: `users`, `orders`, `invoices`, `roles`, `role_permissions` (ngoài pivot của quyền bị xoá), `tables`, `promotions` — đếm bản ghi trước/sau giống nhau.
  - `php artisan migrate:status` — migration mới hiển thị Ran.
  - Test toàn bộ xanh = không có migration khác bị ảnh hưởng.

---

## Không nằm trong phạm vi

- Thay đổi luồng bếp/phục vụ (vẫn làm và hoàn thành món).
- Bỏ chặn món nháp chưa gửi bếp (giữ nguyên).
- Thay đổi trạng thái món khi thanh toán (không tự hủy).
- Các permission khác (`pos.cancel_item`, `kitchen.cancel_item`, ...).
- **TUYỆT ĐỐI KHÔNG**: xoá sạch/toàn bộ DB, drop bảng, truncate, xoá dữ liệu bảng khác. Migration chỉ xoá 1 dòng `permissions` cụ thể (có WHERE).
