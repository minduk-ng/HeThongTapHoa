# Hardening 5 Critical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đóng 5 lỗ hổng tài chính/độ bền dữ liệu: giá từ DB, kitchen race, payment post-commit, migration id=15, soft delete.

**Architecture:** Fix cục bộ đúng chỗ (Approach A), không đổi kiến trúc. Giá món luôn tính server-side từ `menu_items.price`; kitchen guard + lock trong transaction; post-commit work bọc `safeDispatch`; migration destructive xoá data-migration; `menu_items`/`ingredients` thêm SoftDeletes.

**Tech Stack:** Laravel 13, PHP, Pest, SQLite (dev) / MySQL (prod).

**Spec:** `docs/superpowers/specs/2026-08-10-hardening-5-critical-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` như lệnh đơn.
- Không đổi KPI/report output — chỉ đổi nguồn giá client → DB.
- Không đổi signature public method/controller (Inertia frontend gọi theo tên hiện có).
- `unit_price`/`subtotal`/`vat_amount`/`total` trong request POS sẽ bị BỎ qua (không đọc, không validate) — client không cần gửi nữa.
- Laravel `$request->validate()` bỏ qua field không khai báo rule → test cũ gửi `unit_price` vẫn không lỗi validate, chỉ không được dùng.
- Mỗi task TDD: viết test fail → sửa → pass → commit.
- `default` DB cache driver trong test = array → `Cache::tags` hoạt động.

---

## File Structure

**Sửa:**
- `database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php`
- `database/seeders/DefaultMenuAndInventorySeeder.php`
- `app/Models/MenuItem.php`
- `app/Models/Ingredient.php`
- `app/Http/Controllers/Manager/ProductController.php`
- `app/Http/Controllers/Manager/IngredientController.php`
- `app/Http/Controllers/Staff/POSController.php`
- `app/Http/Controllers/Staff/PaymentController.php`
- `app/Http/Controllers/Staff/KitchenController.php`

**Tạo mới:**
- `database/migrations/2026_08_10_000001_add_soft_deletes_to_menu_and_inventory.php`
- `tests/Feature/Hardening/PriceFromMenuTest.php`
- `tests/Feature/Hardening/KitchenOrderStatusGuardTest.php`
- `tests/Feature/Hardening/SoftDeleteMenuInventoryTest.php`
- `tests/Feature/Hardening/PaymentPostCommitTest.php`

---

## Task 1: Migration id=15 an toàn

**Files:**
- Modify: `database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php:24-28`

**Interfaces:**
- Consumes: Không.
- Produces: `order_activities` schema (giữ nguyên), bỏ data-migration nguy hiểm.

- [ ] **Step 1: Sửa migration**

Xoá 2 dòng data-migration trong `up()`. Bỏ import `DB` nếu không còn dùng.

Từ:
```php
        // Migrate takeaway orders: table_id 15 → NULL
        DB::table('orders')->where('table_id', 15)->update(['table_id' => null]);

        // Remove "Mang đi" table record
        DB::table('tables')->where('id', 15)->delete();
```
thành: (xóa hẳn 5 dòng trên, để trống giữa `Schema::create(...)` và `}` của `up()`)

Bỏ `use Illuminate\Support\Facades\DB;` (line 5) nếu sau khi xoá không còn dùng DB.

- [ ] **Step 2: Xoá import DB không dùng**

Kiểm tra file: nếu `DB::` không còn xuất hiện trong file → xoá `use Illuminate\Support\Facades\DB;`.

- [ ] **Step 3: Verify migrate:fresh**

Run: `php artisan migrate:fresh` (dev DB sqlite)
Expected: chạy OK, `order_activities` bảng tồn tại, không lỗi.

- [ ] **Step 4: Full suite**

Run: `php artisan test`
Expected: PASS (order_activities vẫn được tạo → OrderActivityLogger không vỡ).

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php
git commit -m "fix: bo data-migration xoa ban id=15 trong migration order_activities"
```

---

## Task 2: Soft delete menu_items/ingredients

**Files:**
- Create: `database/migrations/2026_08_10_000001_add_soft_deletes_to_menu_and_inventory.php`
- Modify: `app/Models/MenuItem.php`, `app/Models/Ingredient.php`
- Modify: `app/Http/Controllers/Manager/ProductController.php:134`, `app/Http/Controllers/Manager/IngredientController.php:86`
- Modify: `database/seeders/DefaultMenuAndInventorySeeder.php:88`
- Test: `tests/Feature/Hardening/SoftDeleteMenuInventoryTest.php` (mới)

**Interfaces:**
- Consumes: `MenuItem`/`Ingredient` models, `ProductController::destroy`, `IngredientController::destroy`, seeder.
- Produces: `menu_items.deleted_at`, `ingredients.deleted_at`; 2 model dùng `SoftDeletes`; destroy → soft delete; seeder `withTrashed()->updateOrCreate`.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/Hardening/SoftDeleteMenuInventoryTest.php`:

```php
<?php

use App\Models\Ingredient;
use App\Models\InventoryTransaction;
use App\Models\MenuItem;
use App\Models\OrderItem;

test('xoá món qua ProductController la soft delete, lich su order con nguyen', function () {
    $admin = posAdmin();
    $item = posMenuItem();
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 2, 'price' => $item->price]]);

    $this->actingAs($admin)->delete('/manager/products/'.$item->id);

    expect(MenuItem::withTrashed()->find($item->id))->not->toBeNull();
    expect(MenuItem::find($item->id))->toBeNull();
    expect(OrderItem::where('menu_item_id', $item->id)->count())->toBe(1);
});

test('xoá nguyên liệu qua IngredientController la soft delete, inventory_transactions con nguyen', function () {
    $admin = posAdmin();
    $ing = Ingredient::create([
        'code' => 'test-'.uniqid(), 'name' => 'NL '.uniqid(),
        'stock_quantity' => 100, 'unit' => 'g', 'min_stock_alert' => 10, 'cost_price' => 1000,
    ]);
    InventoryTransaction::create([
        'ingredient_id' => $ing->id, 'type' => 'restock', 'quantity' => 100, 'unit' => 'g', 'note' => 'test',
    ]);

    $this->actingAs($admin)->delete('/manager/inventory/ingredients/'.$ing->id);

    expect(Ingredient::withTrashed()->find($ing->id))->not->toBeNull();
    expect(Ingredient::find($ing->id))->toBeNull();
    expect(InventoryTransaction::where('ingredient_id', $ing->id)->count())->toBe(1);
});

test('seed sau khi soft-delete khong vi pham unique name', function () {
    $item = posMenuItem(['name' => 'Cà phê đen']);
    $item->delete(); // soft delete

    $this->artisan('db:seed');

    expect(MenuItem::withTrashed()->where('name', 'Cà phê đen')->count())->toBe(1);
});
```

**Lưu ý:** Kiểm tra tên route destroy thực tế — `ProductController`/`IngredientController` dùng `resource` hay route đặt tên gì (`php artisan route:list | Select-String "products|ingredients"`). Nếu không phải `route('manager.products.destroy')`, dùng URL trực tiếp hoặc tên route đúng. `posAdmin()`/`posTable()` helper có sẵn trong `tests/Pest.php`. `InventoryTransaction` cần check cột bắt buộc (`type`, `quantity`, `unit`...) — đọc model trước khi viết.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Hardening\SoftDeleteMenuInventoryTest.php`
Expected: FAIL — chưa có `deleted_at` column (`no such column`), destroy xoá cứng (order_items bị cascade), seeder tạo trùng.

- [ ] **Step 3: Tạo migration soft delete**

Tạo `database/migrations/2026_08_10_000001_add_soft_deletes_to_menu_and_inventory.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->softDeletes();
        });
        Schema::table('ingredients', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
        Schema::table('ingredients', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
```

- [ ] **Step 4: Thêm SoftDeletes vào models**

`app/Models/MenuItem.php`:
```php
use Illuminate\Database\Eloquent\SoftDeletes;

class MenuItem extends Model
{
    use SoftDeletes;
    // ...
}
```

`app/Models/Ingredient.php`: tương tự (`use SoftDeletes;`).

- [ ] **Step 5: Sửa seeder dùng withTrashed**

`database/seeders/DefaultMenuAndInventorySeeder.php:88` — đổi:
```php
$p = MenuItem::updateOrCreate(
```
thành:
```php
$p = MenuItem::withTrashed()->updateOrCreate(
```
(và tương tự phần ingredients nếu có `updateOrCreate` — kiểm tra phần sau file).

- [ ] **Step 6: Chạy test pass**

Run: `php artisan test tests\Feature\Hardening\SoftDeleteMenuInventoryTest.php`
Expected: PASS (destroy giờ soft delete; cascade không chạy vì không xoá vật lý; seeder không trùng unique).

- [ ] **Step 7: Regression + pint**

Run: `php artisan test tests\Feature\ManagerTest.php` (hoặc test ProductController/IngredientController hiện có — tìm file test tương ứng)
Run: `php artisan test`
Run: `vendor/bin/pint app/Models/MenuItem.php app/Models/Ingredient.php app/Http/Controllers/Manager/ProductController.php app/Http/Controllers/Manager/IngredientController.php database/seeders/DefaultMenuAndInventorySeeder.php`

- [ ] **Step 8: Commit**

```bash
git add database/migrations/2026_08_10_000001_add_soft_deletes_to_menu_and_inventory.php app/Models/MenuItem.php app/Models/Ingredient.php app/Http/Controllers/Manager/ProductController.php app/Http/Controllers/Manager/IngredientController.php database/seeders/DefaultMenuAndInventorySeeder.php tests/Feature/Hardening/SoftDeleteMenuInventoryTest.php
git commit -m "fix: soft delete menu_items/ingredients + seeder withTrashed"
```

---

## Task 3: POSController recompute giá từ menu

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php:160-345`
- Test: `tests/Feature/Hardening/PriceFromMenuTest.php` (mới)

**Interfaces:**
- Consumes: `MenuItem` model (đã có), `Order`, `OrderItem`, `Employee`, `OrderActivityLogger`, `IdempotencyGuard`.
- Produces: `sendToKitchen` không đọc `unit_price`/`subtotal`/`vat_amount`/`total` từ request; tính từ `menu_items.price`.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/Hardening/PriceFromMenuTest.php`:

```php
<?php

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;

test('sendToKitchen tinh gia tu menu_items.price, bo qua unit_price client', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $item = posMenuItem(['price' => 25000]);  // giá DB
    $table = posTable();

    // Client cố tình gửi unit_price=1, subtotal=1, total=1
    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 2, 'unit_price' => 1, 'note' => null]],
        'subtotal' => 1,
        'vat_amount' => 0,
        'total' => 1,
    ]);

    $orderItem = OrderItem::latest()->first();
    expect($orderItem->unit_price)->toBe(25000.0);
    expect($orderItem->subtotal)->toBe(50000.0);

    $order = $orderItem->order;
    expect((float) $order->subtotal)->toBe(50000.0);
    expect((float) $order->total)->toBe(50000.0);
});

test('sendToKitchen moi order moi duoc tao voi gia dung', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $item = posMenuItem(['price' => 30000]);
    $table = posTable();

    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 3, 'unit_price' => 0, 'note' => null]],
        'subtotal' => 0,
        'vat_amount' => 0,
        'total' => 0,
    ]);

    $order = Order::latest()->first();
    expect((float) $order->subtotal)->toBe(90000.0);
    expect(OrderItem::where('order_id', $order->id)->first()->unit_price)->toBe(30000.0);
});
```

**Lưu ý:** Kiểm tra tên route thực (`'/staff/pos/send-to-kitchen'` hay URL `/staff/pos/send-to-kitchen` — `php artisan route:list | Select-String "send-to-kitchen"`). Nếu test cũ dùng URL thật, dùng URL đó. `posStaff(['pos.view','pos.create'])` — helper có sẵn. Cần permission `pos.create` cho endpoint.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Hardening\PriceFromMenuTest.php`
Expected: FAIL — `unit_price` lấy từ client (`=1`, `=0`), subtotal/total sai.

- [ ] **Step 3: Sửa validate — bỏ field giá client**

`POSController::sendToKitchen` (`:162-179`) — bỏ các dòng:
```php
            'items.*.unit_price' => 'required_with:items|numeric|min:0',
```
```php
            'subtotal' => 'required|numeric|min:0',
            'vat_amount' => 'required|numeric|min:0',
            'total' => 'required|numeric|min:0',
```

- [ ] **Step 4: Thêm MenuItem import + load prices**

Đầu file `POSController.php` đã import `MenuItem` (dòng dùng `MenuItem::find` ở `:309`). Kiểm tra có sẵn.

Trong transaction, sau `$table = ...` (`:193`), thêm:
```php
            $menuPrices = MenuItem::whereIn('id', collect($validated['items'] ?? [])->pluck('menu_item_id'))->pluck('price', 'id');
```
Sau đó tính (trước phần handle items, sau reduced_items block, ~`$validated['items']`):
```php
            $computedSubtotal = collect($validated['items'] ?? [])->sum(
                fn ($i) => (float) $i['quantity'] * (float) ($menuPrices[$i['menu_item_id']] ?? 0)
            );
```

- [ ] **Step 5: Thay thế các chỗ dùng validated subtotal/vat/total**

Thay từng chỗ (GIỮ NGUYÊN cấu trúc, chỉ đổi nguồn giá trị):

| Dòng hiện tại | Đổi thành |
|---|---|
| `'subtotal' => $validated['subtotal'],` (`:255`, `:283`) | `'subtotal' => $computedSubtotal,` |
| `'vat_amount' => $validated['vat_amount'],` (`:256`, `:284`) | `'vat_amount' => 0,` |
| `'total' => $validated['subtotal'],` (`:257`, `:285`) | `'total' => $computedSubtotal,` |
| `'subtotal' => $createdOrder->subtotal + $validated['subtotal'],` (`:262`) | `'subtotal' => $createdOrder->subtotal + $computedSubtotal,` |
| `'vat_amount' => $createdOrder->vat_amount + $validated['vat_amount'],` (`:263`) | `'vat_amount' => $createdOrder->vat_amount,` |
| `'total' => $createdOrder->subtotal + $validated['subtotal'],` (`:264`) | `'total' => $createdOrder->subtotal + $computedSubtotal,` |
| `'unit_price' => $item['unit_price'],` (`:300`) | `'unit_price' => $menuPrices[$item['menu_item_id']] ?? 0,` |
| `'subtotal' => $item['quantity'] * $item['unit_price'],` (`:301`) | `'subtotal' => $item['quantity'] * ($menuPrices[$item['menu_item_id']] ?? 0),` |
| `'price' => $i['unit_price'],` (`:311`) | `'price' => $menuPrices[$i['menu_item_id']] ?? 0,` |
| `'total' => $validated['total'],` (`:318`) | `'total' => $computedSubtotal,` |
| `'total_added' => $validated['total'],` (`:329`) | `'total_added' => $computedSubtotal,` |

**Lưu ý vat_amount:** trước đây client gửi `vat_amount` (thường 0 vì menu_items vat_rate=0 mặc định). Giữ `0` để không đổi hành vi hiện tại — vat chỉ áp dụng khi menu item có vat_rate, đây là ngoài phạm vi (Important).

- [ ] **Step 6: Chạy test pass**

Run: `php artisan test tests\Feature\Hardening\PriceFromMenuTest.php`
Expected: PASS.

- [ ] **Step 7: Regression POS tests**

Run: `php artisan test tests\Feature\POSOrderFlowTest.php tests\Feature\SendToKitchenPaidGuardTest.php tests\Feature\POSReservationDepositTest.php tests\Feature\POSPromotionRejectMessagesTest.php tests\Feature\PromotionApplyTest.php`
Expected: PASS. (Các test này gửi `unit_price` = price thật — sau khi bỏ rule, Laravel bỏ qua field, giá vẫn từ DB = price thật → kết quả không đổi.)

**Nếu test nào fail do gửi unit_price khác price DB:** cập nhật test đó bỏ `unit_price` khỏi payload (giá giờ lấy từ DB). Chạy lại.

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/Hardening/PriceFromMenuTest.php
git commit -m "fix: POS tinh gia tu menu_items.price, khong tin unit_price client"
```

---

## Task 4: PaymentController validatePromotion recompute giá từ DB

**Files:**
- Modify: `app/Http/Controllers/Staff/PaymentController.php:26-97`
- Test: `tests/Feature/Hardening/PriceFromMenuTest.php` (thêm test)

**Interfaces:**
- Consumes: `PromotionEngine::resolveAll`, `MenuItem`.
- Produces: `validatePromotion` tính `subtotal` mỗi dòng từ DB price, bỏ `unit_price` client.

- [ ] **Step 1: Thêm test fail**

Thêm vào `tests/Feature/Hardening/PriceFromMenuTest.php`:

```php
test('validatePromotion tinh subtotal tu gia menu, bo qua unit_price client', function () {
    $cat = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'price' => 300000]);
    $promo = makePromotion(['discount_value' => 10, 'target_type' => 'item', 'target_value' => $itemA->id]);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 1,   // client gửi sai
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 1],
            ['menu_item_id' => $itemB->id, 'quantity' => 1, 'unit_price' => 1],
        ],
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 10000, 'total' => 390000]);
});
```

**Lưu ý:** `makePromotion` helper — kiểm tra có trong `tests/Pest.php` hay cần tạo trực tiếp (`App\Models\Promotion::create([...])` với `target_type => 'item'`, `target_value => $itemA->id`, `discount_value => 10`). Dùng cách test cũ trong `PromotionApplyTest.php:51` làm mẫu.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Hardening\PriceFromMenuTest.php`
Expected: FAIL — discount tính trên subtotal=1 (client), không phải 400000.

- [ ] **Step 3: Sửa validatePromotion**

`PaymentController::validatePromotion`:
- Bỏ `'items.*.unit_price' => 'required_with:items|numeric|min:0',` (line 36)
- Bỏ `'subtotal' => 'required|numeric|min:0',` (line 32) — hoặc đổi thành `'subtotal' => 'nullable|numeric|min:0'` (dùng cho fallback không-items)
- Sửa block `:39-48`: thay `(float) $it['unit_price']` bằng price từ DB:

```php
        $lines = collect($validated['items'] ?? [])->map(function ($it) {
            $mi = MenuItem::find($it['menu_item_id']);

            return [
                'order_item_id' => null,
                'menu_item_id' => (int) $it['menu_item_id'],
                'subtotal' => (float) $it['quantity'] * (float) ($mi?->price ?? 0),
                'category_id' => $mi?->category_id,
            ];
        });

        if ($lines->isEmpty()) {
            // Fallback: không có items — dùng subtotal client làm 1 dòng order scope
            $lines = collect([[
                'order_item_id' => null,
                'menu_item_id' => null,
                'subtotal' => (float) ($validated['subtotal'] ?? 0),
                'category_id' => null,
            ]]);
        }
```

- Các chỗ dùng `$validated['subtotal']` sau đó (`:62`, `:93`): thay bằng tổng lines khi có items:

```php
        $linesSubtotal = $lines->sum('subtotal');
        $resolved = PromotionEngine::resolveAll($codes, $lines, (float) $linesSubtotal);
```
và `:93`:
```php
            'total' => (float) $linesSubtotal - $resolved['total_discount'],
```

- [ ] **Step 4: Chạy test pass + regression**

Run: `php artisan test tests\Feature\Hardening\PriceFromMenuTest.php`
Run: `php artisan test tests\Feature\PromotionApplyTest.php tests\Feature\POSPromotionRejectMessagesTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/PaymentController.php tests/Feature/Hardening/PriceFromMenuTest.php
git commit -m "fix: validatePromotion tinh subtotal tu gia menu, khong tin client"
```

---

## Task 5: Kitchen race guard

**Files:**
- Modify: `app/Http/Controllers/Staff/KitchenController.php:96-152` (completeOrder), `:174-212` (completeItems)
- Test: `tests/Feature/Hardening/KitchenOrderStatusGuardTest.php` (mới)

**Interfaces:**
- Consumes: `Order`, `OrderItem`, `Employee`, `OrderActivityLogger`, `DispatchesSafely`.
- Produces: `completeOrder`/`completeItems` guard trạng thái + lock trong transaction.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/Hardening/KitchenOrderStatusGuardTest.php`:

```php
<?php

use App\Models\Order;
use App\Models\OrderItem;

test('completeOrder khong ghi de order da thanh toan', function () {
    $admin = posAdmin();
    $item = posMenuItem();
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => $item->price]], ['status' => 'paid']);
    $orderItem = $order->items->first();

    $this->actingAs($admin)->post('/staff/kitchen/complete/'.$order->id, []);

    $order->refresh();
    expect($order->status)->toBe('paid');
    expect($orderItem->fresh()->status)->not->toBe('completed');
});

test('completeOrder khong ghi de order da completed', function () {
    $admin = posAdmin();
    $item = posMenuItem();
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => $item->price]], ['status' => 'completed']);
    $orderItem = $order->items->first();

    $this->actingAs($admin)->post('/staff/kitchen/complete/'.$order->id, []);

    $order->refresh();
    expect($order->status)->toBe('completed');
    expect($orderItem->fresh()->status)->not->toBe('completed');
});
```

**Lưu ý:** Kiểm tra route `staff.kitchen.complete` tồn tại (`php artisan route:list | Select-String "kitchen"`). Test đầu (paid) với code hiện tại: guard ngoài transaction (`:96-100`) đã chặn `paid` → test pass ngay (không fail). Test thứ 2 (completed): code hiện tại check `['paid','cancelled']` — **bỏ sót `completed`** → nó sẽ set `has_additional_items=false` + update `status='completed'` (vô hại vì đã completed) NHƯNG items đã completed nên không trừ. Để test fail thật, test đầu nên kiểm tra race-path: dùng `completed` (bỏ sót guard) và assert `has_additional_items` không đổi — hoặc chấp nhận test đầu là guard-regression (pass cả cũ lẫn mới), test `completed` là cái chứng minh fix. Điều chỉnh test để có ít nhất 1 test fail trước fix: kiểm tra `has_additional_items` giữ nguyên khi order đã completed:
```php
    expect($order->fresh()->has_additional_items)->toBe(false);
```
(với order tạo status=completed + has_additional_items=false → fix giữ nguyên, bug cũ set lại false → cũng false → không fail). Thay vào đó tạo order `status='processing'` có `has_additional_items=true`, gọi completeOrder, sau đó mô phỏng order thành paid GIỮA transaction là không khả thi trong test đơn luồng. → **Chấp nhận: test `completed`-guard là regression test pass-sau-fix, test `paid`-guard pass cả 2.** Phần race thật được bảo vệ bằng lockForUpdate (không test được đơn luồng). Ghi chú trong test.

- [ ] **Step 2: Chạy test**

Run: `php artisan test tests\Feature\Hardening\KitchenOrderStatusGuardTest.php`
Expected: hiện tại PASS hoặc FAIL — ghi nhận trạng thái.

- [ ] **Step 3: Sửa completeOrder**

`KitchenController::completeOrder` (`:96-152`):
- Bỏ guard ngoài transaction (`:96-100`) hoặc giữ làm fast-fail (không đủ an toàn).
- Trong `DB::transaction` (`:105`), đầu closure thêm lock + guard:

```php
            DB::transaction(function () use ($order, $request, &$completedItems) {
                $order = Order::where('id', $order->id)->lockForUpdate()->first();
                if (! $order || in_array($order->status, ['paid', 'cancelled', 'completed'], true)) {
                    return;
                }

                $order->update([
                    'status' => 'completed',
                    'has_additional_items' => false,
                ]);
                // ... phần còn lại giữ nguyên ...
```

- `$request->wantsJson()` ở cuối: sau khi `return;` trong closure, flow vẫn dispatch event `OrderCompleted` — kiểm tra: nếu order null/đã thanh toán, KHÔNG nên dispatch. Thêm flag:

```php
            $skipped = false;
            DB::transaction(function () use ($order, $request, &$completedItems, &$skipped) {
                $order = Order::where('id', $order->id)->lockForUpdate()->first();
                if (! $order || in_array($order->status, ['paid', 'cancelled', 'completed'], true)) {
                    $skipped = true;
                    return;
                }
                // ...
            });

            if (! $skipped) {
                $this->safeDispatch(fn () => OrderCompleted::dispatch($order));
                if ($completedItems->isNotEmpty()) {
                    $this->safeDispatch(fn () => ItemsReadyToServe::dispatch($order, $completedItems));
                }
            }
```

- [ ] **Step 4: Sửa completeItems**

`KitchenController::completeItems` (`:174-212`):
- Đầu `DB::transaction` (`:180`), thêm lock order:
```php
            DB::transaction(function () use ($validated, $order, $employeeId, $request, &$completedItems) {
                $order = Order::where('id', $order->id)->lockForUpdate()->first();
                if (! $order || in_array($order->status, ['paid', 'cancelled'], true)) {
                    return;
                }
                // ... phần còn lại giữ nguyên ...
```
- `$order->fresh()->status` (`:200`) giờ dùng `$order->status` trực tiếp (đã locked):
```php
                if ($remainingActive === 0 && ! in_array($order->status, ['paid', 'cancelled'], true)) {
```
- Event dispatch `:214-218` bọc `if` nếu bị skip (tương tự completeOrder) hoặc chấp nhận dispatch vô hại.

- [ ] **Step 5: Chạy test pass + regression**

Run: `php artisan test tests\Feature\Hardening\KitchenOrderStatusGuardTest.php`
Run: `php artisan test tests\Feature\KitchenFlowTest.php`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Staff/KitchenController.php tests/Feature/Hardening/KitchenOrderStatusGuardTest.php
git commit -m "fix: kitchen guard status + lockForUpdate tranh ghi de order da thanh toan"
```

---

## Task 6: Payment post-commit work tách khỏi try/catch

**Files:**
- Modify: `app/Http/Controllers/Staff/PaymentController.php:220,384`
- Test: `tests/Feature/Hardening/PaymentPostCommitTest.php` (mới)

**Interfaces:**
- Consumes: `DispatchesSafely` trait (đã có), `Cache`.
- Produces: cache flush `pos_tables` bọc `safeDispatch` — Redis down không làm mất response thành công.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/Hardening/PaymentPostCommitTest.php`:

```php
<?php

use Illuminate\Support\Facades\Cache;

test('checkout van tra success khi cache flush loi (redis down)', function () {
    // Giả lập Redis down: Cache::tags(['pos_tables']) throw, các tags khác (vd dashboard) vẫn chạy thật
    Cache::partialMock()
        ->shouldReceive('tags')
        ->with(['pos_tables'])
        ->andThrow(new \RedisException('Connection refused'));

    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);

    $response = $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
    ]);

    $response->assertStatus(200)->assertJson(['success' => true]);
    $this->assertDatabaseHas('invoices', ['total_amount' => 100000]);
});
```

**Lưu ý quan trọng (Mockery):** dùng `Cache::partialMock()` — với `shouldReceive()` thường, mọi call `Cache::tags()` không match expectation sẽ ném `BadMethodCallException`. Vì `CheckoutService::runBulk` cũng gọi `Cache::tags(['dashboard'])->flush()`, partialMock mới cho phép arg khác chạy thật. `with(['pos_tables'])` match đúng mảng 1 phần tử — KHÔNG dùng `with('pos_tables')` (string ≠ mảng, sẽ không match).

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Hardening\PaymentPostCommitTest.php`
Expected: FAIL — hiện tại flush ngoài safeDispatch trong try → throw → 422.

- [ ] **Step 3: Bọc cache flush bằng safeDispatch**

`PaymentController::checkout` (`:220`):
```php
            $this->safeDispatch(fn () => Cache::tags(['pos_tables'])->flush());
```

`PaymentController::bulkCheckout` (`:384`):
```php
            $this->safeDispatch(fn () => Cache::tags(['pos_tables'])->flush());
```

(các `safeDispatch` khác đã có sẵn — giữ nguyên)

- [ ] **Step 4: Chạy test pass + regression**

Run: `php artisan test tests\Feature\Hardening\PaymentPostCommitTest.php`
Run: `php artisan test tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php tests\Feature\POSReservationDepositTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/PaymentController.php tests/Feature/Hardening/PaymentPostCommitTest.php
git commit -m "fix: bao cache flush pos_tables bang safeDispatch - redis down khong lam mat response thanh cong"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (264 + test mới)
- [ ] `npm run types:check` — pass (không đụng frontend)
- [ ] `npm run build` — pass (không đụng frontend)
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `git status` — tree sạch, không file lạ
