# POS/Backend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loại bỏ race hoàn kho 2 lần giữa POS/Kiếp khi hủy `order_items`, soft delete khuyến mãi, phân biệt lý do lỗi mã KM, và bổ sung các test concurrency/permission/promotion+deposit/bulk-rollback/shift-boundary.

**Architecture:** Áp dụng **atomic status transition**: mọi cập nhật `order_items.status` dùng `UPDATE ... WHERE status` (hoặc `WHERE status <> cancelled`) và chỉ thực hiện tác động kho (restore/deduct) khi câu UPDATE thay đổi đúng 1 dòng. `resolvePromotion` chuyển sang trả `reason` thay vì `null`. `Promotion` dùng `SoftDeletes`. Thêm test Pest mô phỏng race tuần tự.

**Tech Stack:** Laravel 11, Eloquent (`lockForUpdate`, `update` truy vấn), Pest, PostgreSQL.

## Global Constraints

- `promotions.code` vẫn unique — sau soft delete không tạo lại mã cũ (giữ nguyên).
- `checkout`/`bulkCheckout` luôn trả lỗi generic; chỉ `validatePromotion` trả lý do chi tiết.
- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test --filter=...` như lệnh đơn.
- Mỗi task TDD: test RED → chạy fail → implement → run pass → commit riêng.
- Thứ tự khóa trong 1 transaction: `orders` → `order_items` → `ingredients` (chống deadlock). KHÔNG thêm khóa `orders` vào Kitchen endpoints.

---

## File Structure

- `database/migrations/2026_08_03_000004_add_deleted_at_to_promotions_table.php` — thêm soft-delete column.
- `app/Models/Promotion.php` — thêm `SoftDeletes`.
- `app/Http/Controllers/Staff/POSController.php` — `cancelOrder` atomic; `resolvePromotion` trả reason; `validatePromotion` bản đồ message; `checkout`/`bulkCheckout` đọc shape mới.
- `app/Http/Controllers/Staff/KitchenController.php` — `cancelItem`, `completeItems`, `completeOrder` atomic.
- Tests: `tests/Feature/PromotionSoftDeleteTest.php`, `tests/Feature/PromotionRejectReasonTest.php`, `tests/Feature/PosCancelRaceTest.php`, `tests/Feature/PosPermissionDenialTest.php`, `tests/Feature/PromotionDepositCheckoutTest.php`, `tests/Feature/BulkCheckoutRollbackTest.php`, `tests/Feature/ShiftBoundaryTest.php`.

---

### Task 1: Soft delete khuyến mãi

**Files:**
- Create: `database/migrations/2026_08_03_000004_add_deleted_at_to_promotions_table.php`
- Modify: `app/Models/Promotion.php`
- Test: `tests/Feature/PromotionSoftDeleteTest.php`

**Interfaces:**
- Produces: `promotions.deleted_at` nullable; `Promotion` khả năng dùng `withTrashed()`.
- Consumes: (none)

- [ ] **Step 1: Viết test fail**

```php
<?php

use App\Models\Promotion;

test('delete qua destroy la soft delete, ban ghi con trong DB', function () {
    $admin = posAdmin();
    $promo = Promotion::create([
        'code' => 'SD'.uniqid(), 'name' => 'Soft', 'discount_type' => 'fixed_amount', 'discount_value' => 1000,
    ]);

    $this->actingAs($admin)->delete("/manager/promotions/{$promo->id}", ['password' => 'password123'])
        ->assertSessionHasNoErrors();

    expect(Promotion::find($promo->id))->toBeNull();
    expect(Promotion::withTrashed()->find($promo->id)->deleted_at)->not->toBeNull();
});

test('resolvePromotion khong tra ve promotion da soft delete', function () {
    $promo = Promotion::create([
        'code' => 'GONE'.uniqid(), 'name' => 'Xoa', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ]);
    $promo->delete();

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 100000])
        ->assertStatus(422)->assertJson(['ok' => false, 'error' => 'Mã khuyến mãi không tồn tại.']);
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `php artisan test tests\Feature\PromotionSoftDeleteTest.php`
Expected: FAIL — `Promotion::find($promo->id)` non-null (chưa soft delete), status 200 thay vì 422.

- [ ] **Step 3: Implement — migration**

Tạo `database/migrations/2026_08_03_000004_add_deleted_at_to_promotions_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
```

- [ ] **Step 4: Chạy migration**

Run: `php artisan migrate`
Expected: `2026_08_03_000004_add_deleted_at_to_promotions_table .... OK`.

- [ ] **Step 5: Thêm trait vào model**

`app/Models/Promotion.php`: thêm `use Illuminate\Database\Eloquent\SoftDeletes;` + `use SoftDeletes;` trong class body (trên cùng, kế các use khác).

```php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Promotion extends Model
{
    use SoftDeletes;
    // ... giữ nguyên phần còn lại
}
```

- [ ] **Step 6: Chạy test pass**

Run: `php artisan test tests/Feature/PromotionSoftDeleteTest.php`
Expected: PASS (2 tests). Lưu ý test 2 cần message "Mã khuyến mãi không tồn tại." — Task 3 sẽ triển khai; nếu test 2 fail vì message chưa có, đánh dấu là OK cần task 2/3, chạy tiếp toàn bộ ở cuối.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_08_03_000004_add_deleted_at_to_promotions_table.php
git add app/Models/Promotion.php tests/Feature/PromotionSoftDeleteTest.php
git commit -m "feat: soft delete khuyen mai (deleted_at + SoftDeletes)"
```

---

### Task 2: resolvePromotion trả reason — phần core

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php:1567-1606` (`resolvePromotion`)

**Interfaces:**
- Produces: `resolvePromotion(?string $code, $lines, float $orderSubtotal, bool $lockForUpdate=false): ?array` trả về:
  - `null` khi `$code` rỗng
  - `['status' => 'ok', 'discount_amount' => float, 'promotion' => Promotion]`
  - `['status' => 'rejected', 'reason' => 'not_found'|'inactive'|'not_started'|'expired'|'out_of_uses'|'below_min'|'no_eligible_line']`
- Consumes: `Promotion::targetSubtotal`, `discountFor` (giữ nguyên).

Lưu ý: Task này đổi shape, các caller ở Task 4. Test message ở Task 3 — nhưng Task 2 phải giữ suite cũ còn pass (PromotionApplyTest hiện assert `ok:false` chung — vẫn pass nếu `validatePromotion` map đúng).

- [ ] **Step 1: Viết test fail cho shape mới (unit qua ReflectionMethod)**

Tạo `tests/Feature/POSPromotionRejectReasonTest.php`. Test gọi trực tiếp private `resolvePromotion` qua reflection để kiểm shape `['status'=>..., 'reason'=>...]` mà không phụ thuộc message của `validatePromotion` (Task 3 xử lý message).

```php
<?php

use App\Models\MenuCategory;
use App\Models\Promotion;
use App\Http\Controllers\Staff\POSController;

function posRejectReasonLines(): \Illuminate\Support\Collection
{
    // danh mục mặc định: không thuộc target category → phục vụ case no_eligible_line
    return collect([[
        'order_item_id' => 1,
        'menu_item_id' => null,
        'subtotal' => 100000.0,
        'category_id' => null,
    ]]);
}

test('resolvePromotion tra cac ly do tu choi rieng biet', function (array $attrs, string $expectReason) {
    $promo = Promotion::create(array_merge([
        'code' => 'RRR'.substr(uniqid(), -5), 'name' => 'RR', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ], $attrs));

    $controller = resolve(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);

    $result = $reflection->invoke($controller, $promo->code, posRejectReasonLines(), 100000.0, false);

    expect($result['status'])->toBe('rejected');
    expect($result['reason'])->toBe($expectReason);
})->with([
    'khong hoat dong' => [['is_active' => false], 'inactive'],
    'chua toi han' => [['starts_at' => now()->addDay()], 'not_started'],
    'het han' => [['expires_at' => now()->subDay()], 'expired'],
    'het luot' => [['max_uses' => 1, 'used_count' => 1], 'out_of_uses'],
    'duoi min' => [['min_order_amount' => 200000], 'below_min'],
]);

test('resolve_promotion khong tim thay ma tra not_found', function () {
    $controller = app(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);

    $result = $reflection->invoke($controller, 'NOEXIST'.substr(uniqid(), -5), posRejectReasonLines(), 100000.0, false);

    expect($result['status'])->toBe('rejected');
    expect($result['reason'])->toBe('not_found');
});

test('resolve_promotion khong co dong khop target tra no_eligible_line', function () {
    $category = MenuCategory::create(['name' => 'Cat RRR '.uniqid(), 'sort_order' => 1]);
    $promo = Promotion::create([
        'code' => 'RRC'.substr(uniqid(), -5), 'name' => 'RRC', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
        'target_type' => 'category', 'target_value' => $category->id,
    ]);

    // lines không thuộc category target → targetSubtotal = 0
    $lines = collect([[
        'order_item_id' => 1, 'menu_item_id' => null, 'subtotal' => 100000.0, 'category_id' => 99999,
    ]]);

    $controller = app(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);
    $result = $reflection->invoke($controller, $promo->code, $lines, 100000.0, false);

    expect($result['status'])->toBe('rejected');
    expect($result['reason'])->toBe('no_eligible_line');
});

test('resolve_promotion ok tra status ok, promotion va discount_amount', function () {
    $promo = Promotion::create([
        'code' => 'OKR'.substr(uniqid(), -5), 'name' => 'OK', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ]);

    $controller = app(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);
    $result = $reflection->invoke($controller, $promo->code, posRejectReasonLines(), 100000.0, false);

    expect($result['status'])->toBe('ok');
    expect($result['promotion']->id)->toBe($promo->id);
    expect($result['discount_amount'])->toBe(10000.0);
});
```

- [ ] **Step 2: Chạy fail**

Run: `php artisan test tests/Feature/POSPromotionRejectReasonTest.php`
Expected: FAIL — hiện `resolvePromotion` trả `['promotion'=>..., 'discount_amount'=>...]` không có `status`; `$result['status']` = null nên test báo `not 'rejected'`.

- [ ] **Step 3: Implement resolvePromotion**

Thay toàn bộ thân hàm `resolvePromotion`:

```php
private function resolvePromotion(?string $code, $lines, float $orderSubtotal, bool $lockForUpdate = false): ?array
{
    if (! $code) {
        return null;
    }

    $query = Promotion::query()->whereRaw('UPPER(code) = ?', [mb_strtoupper(trim($code))]);
    if ($lockForUpdate) {
        $query->lockForUpdate();
    }
    $promotion = $query->first();

    if (! $promotion) {
        return ['status' => 'rejected', 'reason' => 'not_found'];
    }
    if (! $promotion->is_active) {
        return ['status' => 'rejected', 'reason' => 'inactive'];
    }

    $now = now();
    if ($promotion->starts_at && $now->lt($promotion->starts_at)) {
        return ['status' => 'rejected', 'reason' => 'not_started'];
    }
    if ($promotion->expires_at && $now->gt($promotion->expires_at)) {
        return ['status' => 'rejected', 'reason' => 'expired'];
    }

    if ($promotion->max_uses !== null && $promotion->used_count >= $promotion->max_uses) {
        return ['status' => 'rejected', 'reason' => 'out_of_uses'];
    }
    if ($promotion->min_order_amount !== null && $orderSubtotal < (float) $promotion->min_order_amount) {
        return ['status' => 'rejected', 'reason' => 'below_min'];
    }

    $targetSubtotal = Promotion::targetSubtotal($promotion, $lines);
    if ($targetSubtotal <= 0) {
        return ['status' => 'rejected', 'reason' => 'no_eligible_line'];
    }

    return [
        'status' => 'ok',
        'promotion' => $promotion,
        'discount_amount' => $this->discountFor($promotion, $targetSubtotal),
    ];
}
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests/Feature/POSPromotionRejectReasonTest.php`
Expected: PASS (ok test: 10% của 100000 = 10000.0; discountFor round về 2 chữ số → 10000.0).

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/POSPromotionRejectReasonTest.php
git commit -m "feat: resolvePromotion tra ly do tu choi chi tiet"
```

---

### Task 3: Message chi tiết validatePromotion + checkout/bulkCheckout dùng generic

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php:711-762` (`validatePromotion`), `:764-971` (`checkout`), `:1002-1191` (`bulkCheckout`)
- Test: `tests/Feature/POSPromotionRejectMessagesTest.php`, `tests/Feature/PromotionDepositCheckoutTest.php`

**Interfaces:**
- Consumes: `resolvePromotion` shape mới (Task 2).
- Produces: `validatePromotion` JSON với trường `error` = message VN cụ thể khi `rejected`.

- [ ] **Step 1: Viết test fail — validate trả message chi tiết**

```php
<?php

use App\Models\Promotion;

test('validate-promotion tra the thong bao rieng do ly do khac nhau', function (array $attrs, string $message) {
    $promo = Promotion::create(array_merge([
        'code' => 'VLD'.substr(uniqid(), -5), 'name' => 'TL', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ], $attrs));

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 50000])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => $message]);
})->with([
    'khong ton tai m' => [[], 'Mã khuyến mãi không tồn tại.'],
    'tat ngung' => [['is_active' => false], 'Mã khuyến mãi đang tạm ngưng.'],
    'chua toi han' => [['starts_at' => now()->addDay()], 'Mã khuyến mãi chưa tới hạn áp dụng.'],
    'het han' => [['expires_at' => now()->subDay()], 'Mã khuyến mãi đã hết hạn.'],
    'het luot' => [['max_uses' => 1, 'used_count' => 1], 'Mã khuyến mãi đã hết lượt sử dụng.'],
    'duoi min' => [['min_order_amount' => 200000], 'Đơn hàng chưa đạt giá trị tối thiểu.'],
]);

test('validate-promotion khong co dong khop target tra loi ro rang', function () {
    $cat = App\Models\MenuCategory::create(['name' => 'Cat N'.$uniqid ?? 'Cat1', 'sort_order' => 1]);
    $promo = Promotion::create([
        'code' => 'CAT'.substr(uniqid(), -5), 'name' => 'Cat scope', 'discount_type' => 'percentage',
        'discount_value' => 10, 'target_type' => 'category', 'target_value' => $cat->id,
    ]);
    $other = posMenuItem(); // khac danh muc

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', [
            'code' => $promo->code, 'subtotal' => 50000,
            'items' => [['menu_item_id' => $other->id, 'quantity' => 1, 'unit_price' => 50000]],
        ])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => 'Không có món trong đơn thuộc đối tượng áp dụng.']);
});

test('validate-promotion ma hop le giam 0 dong van ok true (phuc vu frontend)', function () {
    $promo = Promotion::create([
        'code' => 'ZERO'.substr(uniqid(), -5), 'name' => '0d', 'discount_type' => 'percentage',
        'discount_value' => 0, 'is_active' => true,
    ]);
    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 50000])
        ->assertOk()->assertJson(['ok' => true, 'discount_amount' => 0]);
});
```

- [ ] **Step 2: Chạy fail**

Run: `php artisan test tests/Feature/POSPromotionRejectReasonTest.php`
Expected: FAIL — validate còn message generic.

- [ ] **Step 3: Implement mapping trong validatePromotion**

Đổi khối xử lý sau khi gọi `resolvePromotion` (dòng ~745-750):

```php
$resolved = $this->resolvePromotion($validated['code'], $lines, (float) $validated['subtotal']);

if (! $resolved || $resolved['status'] === 'rejected') {
    $reason = $resolved ? ($resolved['reason'] ?? 'not_found') : 'not_found';
    $map = [
        'not_found' => 'Mã khuyến mãi không tồn tại.',
        'inactive' => 'Mã khuyến mãi đang tạm ngưng.',
        'not_started' => 'Mã khuyến mãi chưa tới hạn áp dụng.',
        'expired' => 'Mã khuyến mãi đã hết hạn.',
        'out_of_uses' => 'Mã khuyến mãi đã hết lượt sử dụng.',
        'below_min' => 'Đơn hàng chưa đạt giá trị tối thiểu.',
        'no_eligible_line' => 'Không có món trong đơn thuộc đối tượng áp dụng.',
    ];

    return response()->json([
        'ok' => false,
        'error' => $map[$reason] ?? 'Mã khuyến mãi không hợp lệ.',
    ], 422);
}

return response()->json([
    'ok' => true,
    'discount_amount' => $resolved['discount_amount'],
    'total' => (float) $validated['subtotal'] - $resolved['discount_amount'],
    'promotion' => [
        'id' => $resolved['promotion']->id,
        'name' => $resolved['promotion']->name,
        'code' => $resolved['promotion']->code,
    ],
]);
```

- [ ] **Step 4: Cập nhật checkout dungf shape m̂ói**

Thay đoạn `if (! empty($validated['promotion_code']))` trong `checkout` (line ~834-841):

```php
if (! empty($validated['promotion_code'])) {
    $resolved = $this->resolvePromotion($validated['promotion_code'], $this->orderLines($activeItems), $subtotal, true);
    if (! $resolved || $resolved['status'] === 'rejected') {
        throw new \Exception('Mã khuyến mãi không hợp lệ hoặc đã hết hạn.');
    }
    $promotion = $resolved['promotion'];
    $discountAmount = $resolved['discount_amount'];
}
```

Tương tự trong `bulkCheckout` (line ~1043-1050).

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests/Feature/POSPromotionRejectReasonTest.php`
Expected: PASS.

- [ ] **Step 6: Chạy lại toàn suite promotion/checkout cũ để xác nhận không regress**

Run: `php artisan test tests/Feature/PromotionApplyTest.php tests/Feature/PromotionControllerTest.php tests/Feature/POSCheckoutTest.php`
Expected: PASS (nếu fail — fix shape ở caller cho đến pass).

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/POSPromotionRejectReasonTest.php
git commit -m "feat: phan biet ly do loi ma khuyen mai o validate, checkout giu generic"
```

---

### Task 4: Atomic status transition cho Kitchen cancelItem

**Files:**
- Modify: `app/Http/Controllers/Staff/KitchenController.php:203-284` (`cancelItem`)
- Test: `tests/Feature/POSCancelRaceTest.php`

**Interfaces:**
- Produces: `cancelItem` atomic: chỉ restore khi `UPDATE order_items SET status='cancelled' WHERE id=? AND status<>'cancelled'` thay đổi 1 dòng.

[Giải thích race: `cancelItem` hiện dùng `lockForUpdate()+read+update`, nhưng `POS cancelOrder` không khóa item; cả 2 cùng đọc `status='completed'` rồi restore 2 lần. Giải pháp guard WHERE.]

- [ ] **Step 1: Viết test fail (mô phỏng 2 nguồn cùng cancel 1 item completed)**

```php
<?php

use App\Models\Ingredient;
use App\Models\InventoryTransaction;
use App\Models\OrderItem;
use App\Models\ProductRecipe;

test('cancel hai nguon cung mot item completed chi hoan kho mot lan', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = Ingredient::create(['name' => 'NL CancelRace '.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 20, 'unit' => 'g']);
    $order = posOrder($table, [['item' => $item, 'qty' => 3, 'status' => 'completed']]);

    // Nguon 1: POS cancelOrder
    $this->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'Khach bo ve'])
        ->assertSessionHasNoErrors();

    $orderItem = $order->items->first();

    // Nguon 2: Kitchen cancelItem tren cung order_item
    $this->post('/staff/kitchen/cancel-item', ['order_item_id' => $orderItem->id, 'cancellation_reason' => 'Trung huy'])
        ->assertSessionHasNoErrors();

    // Chi 1 ban ghi import (hoan kho)
    expect(InventoryTransaction::where('ingredient_id', $ingredient->id)->where('type', 'import')->count())->toBe(1);
    expect((float) Ingredient::find($ingredient->id)->stock_quantity)->toBe(1000.0 + 60.0);
});
```

- [ ] **Step 2: Chạy fail**

Run: `php artisan test --filter=cancel đ u`
Expected: hiện tại count `import` = 2 (double restore) — FAIL.

- [ ] **Step 3: Implement atomic guard trong cancelItem**

Thay khối transaction (bên trong `cancelItem`, sau phần lấy `$validated` và `$reasonStr`):

```php
DB::transaction(function () use ($validated, $request, &$targetTable, &$targetOrder) {
    $item = OrderItem::where('id', $validated['order_item_id'])->first();

    if (! $item) {
        throw new \InvalidArgumentException('Món không tồn tại.');
    }

    $order = $item->order;
    if ($order) {
        $targetOrder = $order;
        $targetTable = $order->table ?? Table::find($order->table_id);
    }

    $reasonStr = $validated['cancellation_reason'].(! empty($validated['note']) ? ': '.$validated['note'] : '');

    // Atomic transition: chi thang neu chua cancelled
    $updated = OrderItem::where('id', $item->id)
        ->where('status', '<>', 'cancelled')
        ->update([
            'status' => 'cancelled',
            'cancellation_reason' => $reasonStr,
            'cancelled_by_user_id' => $request->user()?->id,
            'cancelled_at' => now(),
        ]);

    if ($updated === 0) {
        return; // da huy boi nguon khac — khong restore
    }

    // Chi restore neu item thuc su dang completed truoc khi huy
    if ($item->status === 'completed') {
        $this->inventoryIngredientService->restoreIngredients(
            $item,
            $request->user()?->id,
            $order?->order_code ?? ''
        );
    }

    if ($order) {
        $remainingActiveCount = $order->items()->where('status', '!=', 'cancelled')->count();
        if ($remainingActiveCount === 0) {
            $order->update(['status' => 'cancelled']);
            if ($targetTable) {
                $hasOtherActiveOrders = Order::where('table_id', $targetTable->id)
                    ->where('id', '!=', $order->id)
                    ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                    ->whereHas('items', fn ($q) => $q->where('status', '!=', 'cancelled'))
                    ->exists();
                if (! $hasOtherActiveOrders) {
                    $targetTable->update(['status' => 'available', 'merged_into_table_id' => null]);
                }
            }
        }
    }
});
```

**Quan trọng:** ý nghĩa `status` — hiện `cancelItem` restore khi `item->status === 'completed'` (đọc trước khi update). Với guard, ta đọc `$item->status` TRƯỚC update và dùng nó để quyết restore. Phải capture `$wasCompleted = $item->status === 'completed'` TRƯỚC câu update, vì sau `UPDATE ... SET status='cancelled'` thì `$item->status` trong instance cũ vẫn là giá trị cũ (Eloquent không tự refresh), nhưng an toàn dùng biến capture:

```php
$wasCompleted = $item->status === 'completed';
// ... update ...
if ($updated === 1 && $wasCompleted) { restore; }
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests/Feature/POSCancelRaceTest.php`
Expected: PASS (count import = 1, stock 1060).

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/KitchenController.php tests/Feature/POSCancelRaceTest.php
git commit -m "fix: atomc status guard trong kitchen cancelItem chong hoan kho 2 lan"
```

---

### Task 5: Atomic guard trong POS `cancelOrder`

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php:1442-1460`
- Test: mở rộng `tests/Feature/POSCancelRaceTest.php`

**Interfaces:**
- Consumes: `InventoryIngredientService::restoreIngredients` (giữ nguyên).
- Produces: `cancelOrder` chỉ restore khi `UPDATE ... WHERE status<>'cancelled'` thay đổi 1 dòng.

- [ ] **Step 1: Viết test fail (cancelItem trước rồi cancelOrder sau → chỉ 1 lần restore)**

Thêm vào `tests/Feature/POSCancelRaceTest.php`:

```php
test('huy theo kitchen roi pos van chi hoan kho 1 lan', function () {});
```

> Đặt test cụ thể: tạo order + 1 item completed. Gọi `kitchen/cancel-item` (hoàn lần 1, set cancelled). Rồi gọi `pos/cancel-order` — vì item đã cancelled nên guard bỏ qua restore. Assert import count = 1.

```php
test('kitchen cancelItem truoc POS cancelOrder chi hoan kho mot lan', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = App\Models\Ingredient::create(['name' => 'NL RC '.uniqid(), 'unit' => 'g', 'stock_quantity' => 500]);
    App\Models\ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 10, 'unit' => 'g']);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'status' => 'completed']]);
    $orderItem = $order->items->first();

    $this->post('/staff/kitchen/cancel-item', ['order_item_id' => $orderItem->id, 'cancellation_reason' => 'Huy'])
        ->assertSessionHasNoErrors();

    $this->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'Khach bo ve'])
        ->assertSessionHasNoErrors();

    expect(App\Models\InventoryTransaction::where('ingredient_id', $ingredient->id)->where('type', 'import')->count())->toBe(1);
});
```

- [ ] **Step 2: Chạy fail**

Run: `php artisan test tests/Feature/POSCancelRaceTest.php`
Expected: hiện đơn order bị hủy lại item → double restore → count 2 FAIL.

- [ ] **Step 3: Implement atomic guard trong cancelOrder**

Thay vòng lặp items của `cancelOrder`:

```php
foreach ($orders as $order) {
    foreach ($order->items as $item) {
        $wasCompleted = $item->status === 'completed';

        $updated = OrderItem::where('id', $item->id)
            ->where('status', '<>', 'cancelled')
            ->update([
                'status' => 'cancelled',
                'cancellation_reason' => $reasonStr,
                'cancelled_by_user_id' => $request->user()->id,
                'cancelled_at' => now(),
            ]);

        if ($updated === 1 && $wasCompleted) {
            $this->inventoryIngredientService->restoreIngredients(
                $item,
                $request->user()?->id,
                $order->order_code ?? ''
            );
        }
    }

    $order->update(['status' => 'cancelled']);

    OrderActivityLogger::log($order, 'order_cancelled', $request->user()?->id, [
        'reason' => $reasonStr,
        'item_count' => $order->items->count(),
    ]);
}
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests/Feature/POSCancelRaceTest.php tests/Feature/POSTableOperationsTest.php`
Expected: PASS (POSTableOperations — reset hoàn kho 1 lần vẫn giữ).

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/POSCancelRaceTest.php
git commit -m "fix: atom guard cancelOrder chong hoan kho 2 lan"
```

---

### Task 6: Atomic transition cho Kitchen `completeItems` / `completeOrder`

**Files:**
- Modify: `app/Http/Controllers/Staff/KitchenController.php:139-166` (`completeItems`), `:91-109` (`completeOrder`)
- Test: thêm vào `tests/Feature/KitchenRaceTest.php`

- [ ] **Step 1: Viết test fail — completeItems sau khi order cancel không deduct**

```php
<?php

use App\Models\Ingredient;
use App\Models\InventoryTransaction;

test('completeItems khong deduct khi order item đa bi huy giua chung', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = Ingredient::create(['name' => 'NL CM '.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000]);
    App\Models\ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 20, 'unit' => 'g']);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'status' => 'processing']]);
    $orderItem = $order->items->first();

    // Huy tu POS
    $this->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'huy'])
        ->assertSessionHasNoErrors();

    // Kitchen muon complete item đã huy → phai khong deduct
    $this->post('/staff/kitchen/complete-items', ['order_id' => $order->id, 'item_ids' => [$orderItem->id]])
        ->assertSessionHasNoErrors();

    expect(InventoryTransaction::where('ingredient_id', $ingredient->id)->where('type', 'export')->count())->toBe(0);
    expect((float) $ingredient->allPoints()[0]->stock_quantity)->toBe(1000.0);
});
```

- [ ] **Step 2: Chạy fail** — hiện deduct vẫn chạy (item vẫn status processing trong query) → FAIL.

Run: `php artisan test tests/Feature/KitchenRaceTest.php`

- [ ] **Step 3: Implement guard trong `completeItems`**

Thay vòng lặp deduct:

```php
foreach ($completedItems as $del) {
    $updated = OrderItem::where('id', $del->id)
        ->whereIn('status', ['pending', 'processing'])
        ->update(['status' => 'completed']);

    if ($updated === 1) {
        $this->deductIngredients($del, $employeeId, $order->order_code);
    }
}
```

##### trong `completeOrder`

```php
foreach ($order->items as $it) {
    if ($it->status === 'cancelled' || $it->status === 'completed') {
        continue;
    }
    $updated = OrderItem::where('id', $it->id)
        ->whereIn('status', ['pending', 'processing'])
        ->update(['status' => 'completed']);
    if ($updated === 1) {
        $completedItems->push($it);
        $this->deductIngredients($it, $employeeId, $order->order_code);
    }
}
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests/Feature/KitchenRaceTest.php tests/Feature/KitchenFlowTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/KitchenController.php tests/Feature/KitchenRaceTest.php
git commit -m "fix: guard completeItems/completeOrder chong deduct sau khi mon bi huy"
```

---

### Task 7: Test permission denial

**Files:**
- Create: `tests/Feature/POSPermissionDenialTest.php`

**Interfaces:**
- Consumes: helper `posStaff`, `posAdmin` (có sẵn trong `tests/Pest.php`).

- [ ] **Step 1: Viết test**

```php
<?php

test('guest khong truy cap validate/cancel/checkout', function () {
    $this->get('/staff/pos/validate-promotion')->assertRedirect('/login');
});
```

Sử dụng `posStaff([])` — user không có quyền → cần 403 từ CheckPermission. Viết test không cần dữ liệu tồn tại (middleware chặn trước):

```php
test('nguoi khong co quyen pos.create bi chan validate-promotion 403', function () {
    $this->actingAs(posStaff([], []))
        ->postJson('/staff/pos/validate-promotion', ['code' => 'X', 'subtotal' => 100])
        ->assertStatus(403);
});

test('nguoi khong quyen pos.cancel_item|kitchen.cancel_item bi chan cancel-order 403', function () {
    $this->actingAs(posStaff([], []))
        ->post('/staff/pos/cancel-order', ['table_id' => 1, 'cancellation_reason' => 'x'])
        ->assertStatus(403);
});

test('nguoi khong quyen pos.create bi chan checkout 403', function () {
    $this->actingAs(posStaff([], []))
        ->postJson('/staff/pos/checkout', ['order_id' => 1])
        ->assertStatus(403);
});

test('nguoi khong quyen promotions.view bi chan danh sach khuyen mai 403', function () {
    $this->actingAs(posStaff([], []))
        ->get('/manager/promotions')
        ->assertStatus(403);
});
```

- [ ] **Step 2: Chạy pass**

Run: `php artisan test tests/Feature/POSPermissionDenialTest.php`
Expected: PASS — nếu một số test cần `promotions.view`... lưu ý route `/manager/promotions` cần `permission:promotions.view` — check nhân vật `posStaff([], [])` không có quyền → 403. Điều chỉnh nếu quyền `promotions.view` cho admin seed. Nếu `/manager/promotions` cần CheckPageAccess ngoài `permission`, điều chỉnh test dùng `posStaff([], ['/manager/promotions'])`.

- [ ] **Step 3: Commit**

```bash
git add tests/Feature/POSPermissionDenialTest.php
git commit -m "test: permission denial cho POS + promotions endpoints"
```

---

### Task 8: Test promotion kết hợp deposit

**Files:**
- Create: `tests/Feature/PromotionDepositCheckoutTest.php`

**Interfaces:**
- Consumes: `OrderItem/sud tip`, `Deposit`, `Invoice`.

- [ ] **Step 1: Viết test**

```php
<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\Promotion;

test('checkout w/ promotion + deposit held → total net, payable tru deposit', function () {
    $this->actingAs(posAdmin());
    $promo = Promotion::create(['code' => 'PD'.uniqid(), 'name' => 'PD', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true]);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem(['price' => 60000]);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 60000, 'status' => 'completed']], ['status' => 'completed']);
    Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 78000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $order->refresh();
    // subtotal 120000, discount 10% = 12000, total 108000, payable 108000-30000=78000
    expect((float) $order->total)->toBe(108000.0);
    expect((float) $order->discount_amount)->toBe(12000.0);
    expect((float) Invoice::firstOrFail()->total_amount)->toBe(108000.0);
    expect((float) Invoice::firstOrFail()->deposit_amount)->toBe(30000.0);
    expect(Deposit::where('order_id', $order->id)->where('status', 'applied')->exists())->toBeTrue();
    expect($promo->fresh()->used_count)->toBe(1);
});
```

- [ ] **Step 2: Chạy pass**

Run: `php artisan test tests/Feature/PromotionDepositCheckoutTest.php`
Expected: PASS (không cần code mới — đã sand).

- [ ] **Step 3: Commit**

```bash
git add tests/Feature/PromotionDepositCheckoutTest.php
git commit -m "test: checkout promotion ket hop deposit"
```

---

### Task 9: Test bulk rollback

**Files:**
- Create: `tests/Feature/BulkCheckoutRollbackTest.php`

- [ ] **Step 1: Viết test**

```php
<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\Promotion;

test('bulk-checkout loi thi toan bo rollback: khong hoa don, khong order paid, used_count khong tang', function () {
    $this->actingAs(posAdmin());
    $promo = Promotion::create(['code' => 'BR'.uniqid(), 'name' => 'BR', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true, 'max_uses' => 100, 'used_count' => 0]);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    // mot order da paid → hop le khong du huan
    $o1 = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'paid']);
    $o2 = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$o1->id, $o2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasErrors(['error']);

    expect(Invoice::count())->toBe(0);
    expect($o2->fresh()->status)->toBe('completed');
    expect($promo->fresh()->used_count)->toBe(0);
});
```

> Trường hợp deposit: dùng test tương tự nhưng thêm `Deposit::held` trên + assert không → `applied`.

- [ ] **Step 2: Chạy pass**

Run: `php artisan test tests/Feature/BulkCheckoutRollbackTest.php`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/Feature/BulkCheckoutRollbackTest.php
git commit -m "test: bulk checkout rollback khi 1 don khong hop le"
```

---

### Task 10: Test shift boundary + số ca

**Files:**
- Create: `tests/Feature/ShiftBoundaryTest.php`

- [ ] **Step 1: Viết test**

```php
<?php

use App\Models\Invoice;
use App\Models\Shift;

test('expectedCash tinh ca hoa don o cac thoi diem can cua ca', function () {
    $this->actingAs(posAdmin());
    $openedAt = now()->subMinutes(30);
    $closedAt = now();

    $shift = Shift::create(['opened_at' => $openedAt, 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);

    // Hóa đơn xuất khi mở (issued_at bằng opened_at)
    Invoice::create(['invoice_code' => 'INV-EDGE1', 'table_name' => 'B1', 'total_amount' => 40000, 'payment_method' => 'cash', 'amount_received' => 40000, 'change_amount' => 0, 'issued_at' => $openedAt]);
    // Hóa đơn ngay trước khi đóng
    Invoice::create(['invoice_code' => 'INV-EDGE2', 'table_name' => 'B2', 'total_amount' => 60000, 'payment_method' => 'cash', 'amount_received' => 60000, 'change_amount' => 0, 'issued_at' => $closedAt->format('Y-m-d H:i:s').'']);

    $response = $this->postJson('/staff/shifts/close', ['actual_cash' => 100000])->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(100000.0);
});

test('maziữchia ca dong tai cho khong tin them hoa don truoc khi mo', function () {
    $this->actingAs(posAdmin());
    $openedAt = now();
    $shift = Shift::create(['opened_at' => $openedAt, 'opening_cash' => 0, 'status' => 'open', 'opened_by' => auth()->id()]);
    // Hóa đơn phát sinh Trước opened_at (trong mốc cũ) → không tính vào ca này
    Invoice::create(['invoice_code' => 'PREV', 'table_name' => 'B0', 'total_amount' => 50000, 'payment_method' => 'cash', 'amount_received' => 50000, 'change_amount' => 0, 'issued_at' => $openedAt->copy()->subSecond()]);

    $response = $this->getJson('/staff/shifts/current')->assertOk();
    expect((float) $response->json('expected_cash'))->toBe(0.0);
});
```

- [ ] **Step 2: Chạy pass**

Run: `php artisan test tests/Feature/ShiftBoundaryTest.php tests/Feature/ShiftControllerTest.php`
Expected: PASS — note `whereBetween` bao gồm cả biên (>= <=) nếu chưa, chuyển `expectedCash` về `whereBetween('issued_at', [$shift->opened_at, $until])` (hiện đang đúng dạng `whereBetween` → đã bao gồm biên).

- [ ] **Step 3: Commit**

```bash
git add tests/Feature/ShiftBoundaryTest.php
git commit -m "test: boundary thoi gian ca (expectedCash lay ca hai dau)"
```

---

### Final verification

- [ ] **Chạy toàn bộ test**

Run: `php artisan test`
Expected: toàn bộ pass (~170+ tests). Nếu có fail do shape change — fix caller/`validate`.

- [ ] **Chạy lint/type-check (không có frontend thay đổi — kiểm chứng build JS vẫn ok nếu có)**. Không sửa front ở plan này.