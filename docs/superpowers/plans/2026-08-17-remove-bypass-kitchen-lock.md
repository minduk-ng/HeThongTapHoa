# Bỏ `pos.bypass_kitchen_lock` (Duyệt khẩn cấp) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ hoàn toàn cơ chế "Duyệt khẩn cấp thanh toán" (`pos.bypass_kitchen_lock`): thanh toán (đơn lẻ + bulk) được phép khi đơn còn món đang `pending/processing` ở bếp; bếp/phục vụ vẫn hoàn thành món bình thường sau khi đơn đã `paid`. Xoá permission khỏi toàn bộ hệ thống.

**Architecture:** Xoá khối chặn kitchen lock trong `PaymentController` (checkout + bulkCheckout); bỏ `managerBypass`/`canBypassKitchen`/`isKitchenBlocked` + banner trong `POSCartPanel.tsx`; xoá permission khỏi seeder/RoleController/RolesManager + migration xoá 1 dòng bảng `permissions` (có WHERE, an toàn DB); cập nhật docs + tests.

**Tech Stack:** Laravel 13 (PHP 8.3), Pest, React 19 + TypeScript + Inertia.js.

## Global Constraints

- Bỏ chặn kitchen lock ở cả `checkout()` và `bulkCheckout()`.
- GIỮ NGUYÊN chặn món nháp chưa gửi bếp (`hasUnconfirmedChanges`) — frontend giữ.
- Sau thanh toán: bếp/phục vụ vẫn hiển thị + hoàn thành món (không tự hủy).
- Xoá hoàn toàn `pos.bypass_kitchen_lock` khỏi: seeder, RoleController `$systemPermissions`, RolesManager dictionary, bảng `permissions` (migration), README, PROJECT_CONTEXT_AND_ROUTING, tests.
- **AN TOÀN DB (bắt buộc):** migration chỉ chạy 1 câu `DELETE FROM permissions WHERE name='pos.bypass_kitchen_lock'`. KHÔNG drop/truncate/xoá toàn bộ permissions/roles hoặc bất kỳ bảng khác (users, orders, invoices, tables, promotions...). Không chạy DDL/DML nào khác.
- Bắt buộc chạy: `php artisan test` toàn bộ xanh, `npx eslint`, `npm run types:check`, `npm run build`.
- Commit message tiếng Việt. Không dùng emoji/inline SVG trong JSX.
- Sau migrate: `php artisan migrate:status` + verify số bản ghi permissions của quyền = 0, các bảng khác không đổi.

---

### Task 1: Backend — bỏ chặn kitchen lock (checkout + bulk) + migration xoá permission

**Files:**
- Create: `database/migrations/2026_08_17_000001_remove_bypass_kitchen_lock_permission.php`
- Modify: `app/Http/Controllers/Staff/PaymentController.php`
- Modify: `app/Http/Controllers/Staff/KitchenController.php`
- Test: `tests/Feature/POSCheckoutTest.php`, `tests/Feature/POSBulkCheckoutTest.php`, `tests/Feature/KitchenPaidGuardTest.php`

**Interfaces:**
- Consumes: `PaymentController@checkout`, `@bulkCheckout`, `KitchenController@completeItems` — giữ nguyên signature/route.
- Produces: thanh toán không còn phụ thuộc trạng thái món; bảng `permissions` không còn dòng `pos.bypass_kitchen_lock`; món của đơn `paid` vẫn được bếp đánh dấu `completed` (đơn giữ `paid`).

- [ ] **Step 1: Ghi nhận số bản ghi trước khi migrate**

```bash
php artisan tinker --execute="echo 'count=' . DB::table('permissions')->where('name','pos.bypass_kitchen_lock')->count();"
```
Ghi nhận kết quả (dùng cho kiểm chứng sau).

- [ ] **Step 2: Viết migration**

Tạo `database/migrations/2026_08_17_000001_remove_bypass_kitchen_lock_permission.php`:

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

- [ ] **Step 3: Bỏ khối chặn kitchen lock trong `checkout()`**

`app/Http/Controllers/Staff/PaymentController.php` (dòng ~189-197) — xoá toàn bộ:

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

- [ ] **Step 4: Bỏ khối chặn kitchen lock trong `bulkCheckout()`**

`app/Http/Controllers/Staff/PaymentController.php` (dòng ~360-369) — xoá toàn bộ:

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

- [ ] **Step 4b: Bỏ paid-guard trong KitchenController `completeItems`**

`app/Http/Controllers/Staff/KitchenController.php` — `completeItems()` (dòng ~180), đổi:

```php
                if (! $order || in_array($order->status, ['paid', 'cancelled'], true)) {
                    $skipped = true;

                    return;
                }
```

thành:

```php
                if (! $order || $order->status === 'cancelled') {
                    $skipped = true;

                    return;
                }
```

→ Món của đơn `paid` vẫn được `completed`. Đơn `cancelled` vẫn chặn.

**GIỮ NGUYÊN** guard flip status đơn (dòng ~201): `! in_array($order->status, ['paid', 'cancelled'], true)` — đơn `paid` không bị đổi thành `completed`.

Cập nhật `tests/Feature/KitchenPaidGuardTest.php`:
- Test `kitchen completeItems khong un-pay don da paid` (dòng 15-27): giữ assert đơn vẫn `paid`; THÊM assert món `completed` (hành vi mới cho phép hoàn thành món của đơn paid).
- Các test còn lại (`completeOrder khong un-pay`, `khong resurrect cancelled`, `cancelItem khong huy paid`) — giữ nguyên.

- [ ] **Step 5: Chạy migration**

```bash
php artisan migrate
```
Expected: migration `2026_08_17_000001...` chạy thành công.

- [ ] **Step 6: Verify DB an toàn**

```bash
php artisan tinker --execute="echo 'after=' . DB::table('permissions')->where('name','pos.bypass_kitchen_lock')->count();"
php artisan tinker --execute="echo 'perms=' . DB::table('permissions')->count() . ' roles=' . DB::table('roles')->count() . ' users=' . DB::table('users')->count();"
```
Expected: `after=0`; `perms` giảm đúng 1 (hoặc giữ nguyên nếu ban đầu 0), `roles`/`users` không đổi.

- [ ] **Step 7: Cập nhật test checkout**

`tests/Feature/POSCheckoutTest.php`:
- XOÁ test `người có quyền bypass_kitchen_lock được duyệt khẩn cấp thanh toán món chưa hoàn tất` (dòng ~43-60).
- ĐỔI test `nhân viên thường không thể thanh toán khi món chưa được bếp hoàn tất` (dòng ~23-41) thành:

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
- Cập nhật comment đầu file (dòng ~13-14): bỏ "Khóa bếp... (thiếu quyền bypass)" + "Quyền pos.bypass_kitchen_lock cho phép duyệt khẩn cấp", thay bằng "Thanh toán được ngay khi đơn còn món ở bếp; sau khi paid bếp vẫn hoàn thành món".

- [ ] **Step 8: Cập nhật test bulk-checkout**

`tests/Feature/POSBulkCheckoutTest.php` — ĐỔI test `khóa bếp: thanh toán gộp bị chặn...` (dòng ~141-161) thành:

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
- Cập nhật comment đầu file (dòng ~17): bỏ "Khóa bếp áp dụng cho từng đơn trong danh sách".

- [ ] **Step 9: Thêm test "bếp vẫn hoàn thành món sau khi đơn đã paid"**

Thêm vào `tests/Feature/POSCheckoutTest.php` (cuối file):

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

    $orderItem = $order->items()->first();
    $this->actingAs(posAdmin())->post('/staff/kitchen/complete-items', [
        'item_ids' => [$orderItem->id],
    ])->assertOk();

    expect($orderItem->fresh()->status)->toBe('completed');
});
```

- [ ] **Step 10: Chạy test + commit**

```bash
php artisan test --filter="POSCheckoutTest|POSBulkCheckoutTest|KitchenPaidGuardTest"
php artisan test
git add database/migrations/2026_08_17_000001_remove_bypass_kitchen_lock_permission.php app/Http/Controllers/Staff/PaymentController.php app/Http/Controllers/Staff/KitchenController.php tests/Feature/POSCheckoutTest.php tests/Feature/POSBulkCheckoutTest.php tests/Feature/KitchenPaidGuardTest.php
git commit -m "feat: bo chan kitchen lock - thanh toan duoc khi mon dang o bep, bep van hoan thanh mon sau paid"
```
Expected: toàn bộ xanh.

---

### Task 2: Frontend — bỏ banner "Duyệt khẩn cấp" + kitchen block

**Files:**
- Modify: `resources/js/pages/staff/pos/components/POSCartPanel.tsx`

**Interfaces:**
- Consumes: `usePage` (auth), `cartItems`, `hasUnconfirmedChanges`, `activeInvoiceId`, `selectedTable`, `onOpenPayment`, `isCheckoutLocked`, `checkoutLockedBy` — tất cả đã có.
- Produces: bỏ `canBypassKitchen`, `managerBypass`, `isKitchenBlocked`, `hasKitchenPendingOrders` (nếu chỉ dùng cho kitchen), banner. `isPaymentBlocked` = `hasUnconfirmedChanges || activeInvoiceId.startsWith('draft_')`.

- [ ] **Step 1: Xoá `canBypassKitchen`**

`POSCartPanel.tsx` (dòng 87-89) — xoá:

```ts
    const canBypassKitchen = !!(
        auth?.is_admin || auth?.permissions?.includes('pos.bypass_kitchen_lock')
    );
```
LƯU Ý: giữ `const { auth } = usePage<any>().props;` (dòng 86) — vẫn dùng cho `canCancel` (dòng 90-94).

- [ ] **Step 2: Xoá state `managerBypass`**

Dòng 95 — xoá: `const [managerBypass, setManagerBypass] = useState(false);`

- [ ] **Step 3: Xoá `hasKitchenPendingOrders` + `isKitchenBlocked`**

Dòng 183-187 — xoá toàn bộ:

```ts
    const hasKitchenPendingOrders = confirmedItems.some(
        (i) => !i.isKitchenCompleted,
    );

    const isKitchenBlocked = hasKitchenPendingOrders && !managerBypass;
```

LƯU Ý: kiểm tra `confirmedItems` (dòng 182) còn dùng nơi khác không trước khi xoá; nếu chỉ phục vụ `hasKitchenPendingOrders` thì xoá luôn, nếu không thì giữ.

- [ ] **Step 4: Sửa `isPaymentBlocked`**

Dòng 188-191 — đổi thành:

```ts
    const isPaymentBlocked =
        hasUnconfirmedChanges ||
        activeInvoiceId.startsWith('draft_');
```

- [ ] **Step 5: Xoá banner kitchen**

Dòng 751-766 — xoá toàn bộ block:

```tsx
                {hasKitchenPendingOrders && (
                    <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <span>Đang chờ Bếp hoàn tất món ăn...</span>
                        {canBypassKitchen && (
                            <button
                                type="button"
                                onClick={() => setManagerBypass(!managerBypass)}
                                className="ml-2 font-semibold text-amber-700 hover:underline dark:text-amber-300"
                            >
                                {managerBypass
                                    ? 'Bắt buộc khóa'
                                    : 'Duyệt khẩn cấp'}
                            </button>
                        )}
                    </div>
                )}
```

- [ ] **Step 6: Sửa button title**

Dòng 904-905 — bỏ nhánh `isKitchenBlocked`, còn:

```ts
                                                    : isTakeaway
                                                    ? 'Thanh toán đơn hiện tại'
                                                    : 'Thanh toán tất cả đơn'
```

- [ ] **Step 7: Verify lint + types + build**

```bash
npx eslint resources/js/pages/staff/pos/components/POSCartPanel.tsx
npm run types:check
npm run build
```
Expected: 0 lỗi mới, pass. Nếu `confirmedItems`/`hasKitchenPendingOrders` để lại dead code, dọn.

- [ ] **Step 8: Chạy test + commit**

```bash
php artisan test
git add resources/js/pages/staff/pos/components/POSCartPanel.tsx
git commit -m "feat: POS bo nut duyet khan cap va banner cho bep, thanh toan duoc ngay"
```
Expected: toàn bộ xanh.

---

### Task 3: Xoá permission khỏi hệ thống + docs

**Files:**
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `app/Http/Controllers/Admin/RoleController.php`
- Modify: `resources/js/pages/admin/RolesManager.tsx`
- Modify: `tests/Pest.php`
- Modify: `README.md`
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md`

**Interfaces:**
- Consumes: kết quả Task 1 (migration đã xoá bản ghi DB).
- Produces: không còn tham chiếu `pos.bypass_kitchen_lock` ở bất kỳ đâu trong code/docs.

- [ ] **Step 1: Xoá khỏi seeder**

`database/seeders/AuthorizationSeeder.php:208` — xoá `'pos.bypass_kitchen_lock',` khỏi mảng (giữ nguyên các quyền khác `pos.view`, `pos.create`, `pos.cancel_item`...).

- [ ] **Step 2: Xoá khỏi RoleController**

`app/Http/Controllers/Admin/RoleController.php:30` — xoá `'pos.bypass_kitchen_lock',` khỏi `$systemPermissions`.

- [ ] **Step 3: Xoá khỏi RolesManager dictionary**

`resources/js/pages/admin/RolesManager.tsx:22` — xoá dòng `bypass_kitchen_lock: 'Duyệt khẩn cấp thanh toán',`.

- [ ] **Step 4: Cập nhật comment Pest.php**

`tests/Pest.php:83` — comment `posStaff()` đổi ví dụ:
```php
 * Dùng để kiểm thử các ràng buộc phân quyền (ví dụ thiếu pos.cancel_item).
```

- [ ] **Step 5: Cập nhật README**

`README.md:18` — xoá/bỏ mô tả "Tự động khóa nút Thanh toán khi bàn có món đang chế biến tại Bếp trừ khi Admin/Quản lý mở nút 'Duyệt khẩn cấp' (`pos.bypass_kitchen_lock`)." — thay bằng mô tả mới: "Thanh toán được ngay cả khi đơn còn món đang chế biến tại Bếp; Bếp/Phục vụ vẫn hoàn thành món sau khi thanh toán."
`README.md:55` — bỏ `pos.bypass_kitchen_lock` khỏi ví dụ RBAC (còn `products.export`, `users.edit`).

- [ ] **Step 6: Cập nhật PROJECT_CONTEXT**

`docs/PROJECT_CONTEXT_AND_ROUTING.md`:
- Dòng 159 (ví dụ `permission:{name}`): đổi `permission:pos.bypass_kitchen_lock` → `permission:products.export`.
- Dòng 167 (ví dụ permission): bỏ `pos.bypass_kitchen_lock,`.
- Dòng 178 (`PERMISSION_LABEL_DICTIONARY` ví dụ): bỏ `bypass_kitchen_lock → "Duyệt khẩn cấp thanh toán"` (giữ `cancel_item`).
- Dòng 223 (mục 8.4 "Khóa khi món đang chế biến"): thay bằng:
```
- **Thanh toán khi món đang chế biến**: Đơn có món đang chờ Bếp làm (`hasKitchenPendingOrders`) VẪN thanh toán được. Sau khi thanh toán (`paid`), Bếp/Phục vụ tiếp tục hoàn thành món bình thường.
```
Kiểm tra mục 8.4 có mô tả 2 phần (giỏ nháp + món chế biến) — giữ phần giỏ nháp chưa gửi bếp nguyên vẹn, chỉ sửa phần món chế biến.

- [ ] **Step 7: Grep verify không còn sót**

```bash
rg -n "bypass_kitchen_lock" --glob "!vendor/**" --glob "!node_modules/**" --glob "!.git/**" --glob "!docs/superpowers/**"
```
Expected: KHÔNG có kết quả nào (hoặc chỉ còn trong docs/superpowers cũ — gitignored).

- [ ] **Step 8: Chạy test + lint + build + commit**

```bash
php artisan test
npx eslint resources/js/pages/admin/RolesManager.tsx
npm run types:check
npm run build
git add database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php resources/js/pages/admin/RolesManager.tsx tests/Pest.php README.md docs/PROJECT_CONTEXT_AND_ROUTING.md
git commit -m "chore: xoa permission pos.bypass_kitchen_lock khoi he thong va docs"
```
Expected: tất cả xanh.

---

## Self-Review Notes

- **Spec coverage:** Task 1 = backend + migration + tests; Task 2 = frontend; Task 3 = permission + docs. Tất cả mục spec đều có task.
- **Không placeholder:** mọi bước có code/lệnh cụ thể.
- **Type consistency:** không thêm tên mới; chỉ xoá `canBypassKitchen`/`managerBypass`/`isKitchenBlocked`/`hasKitchenPendingOrders` đồng bộ. `auth` giữ (dùng cho `canCancel`).
- **An toàn DB:** migration Task 1 Step 5-6 — chỉ DELETE có WHERE, verify count trước/sau, không đụng bảng khác.
- **Kitchen paid-guard (quyết định user):** món của đơn `paid` vẫn được bếp đánh dấu `completed`; đơn GIỮ `paid` (không flip). Điều chỉnh `KitchenController@completeItems` + `KitchenPaidGuardTest`.
- **Lưu ý:** route kitchen là `/staff/kitchen/complete-items` (đã xác minh trong KitchenFlowTest). Nếu `confirmedItems` còn dùng chỗ khác thì giữ.
