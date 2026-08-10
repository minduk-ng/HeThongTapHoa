# Hardening 5 Critical — Security & Financial Integrity Fixes

> Design spec cho phase sửa 5 lỗ hổng Critical từ audit (DB + Controller). Approach A: fix tối thiểu, đúng chỗ, không đổi kiến trúc. Important/Minor để phase khác.

**Goal:** Đóng 5 lỗ hổng tài chính/độ bền dữ liệu nghiêm trọng nhất. Không đổi KPI/report output, không refactor cấu trúc.

**Scope (5 Critical):**
1. Client-supplied money được tin tưởng end-to-end → recompute giá server-side từ DB
2. Kitchen ghi đè order đã thanh toán (race) → guard + lock trong transaction
3. Payment thành công nhưng báo "thất bại" → tách post-commit work khỏi try/catch
4. Migration destructive id=15 → xoá code data-migration nguy hiểm
5. Cascade xoá lịch sử tài chính → soft delete menu_items/ingredients

**Ngoài scope:** Important/Minor (float money, validate date range, leak exception, transaction import, reservation double-book, v.v.) — phase sau.

---

## Phần 1 — Migration id=15 an toàn (#4)

**File:** `database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php`

**Vấn đề:** `up()` chạy không điều kiện:
```php
DB::table('orders')->where('table_id', 15)->update(['table_id' => null]);
DB::table('tables')->where('id', 15)->delete();
```
Trên DB có bàn thật lên tới id 15 → xoá nhầm bàn/đơn đang hoạt động. Bàn id 15 "Mang đi" không còn tồn tại trong seeder (`DefaultTableSeeder` chỉ tạo "Bàn 01..10"), logic mang đi hiện dùng `table_id = null`. Migration này chưa chạy production (chỉ local/dev).

**Giải pháp:** Xoá 2 dòng data-migration khỏi `up()`. Giữ nguyên `Schema::create('order_activities', ...)` (bảng đang được app dùng). Bỏ import `DB` nếu không còn dùng. `down()` giữ nguyên (chỉ `dropIfExists('order_activities')`).

**Lý do xoá hẳn (thay vì guard):**
- Fresh install: seeder chỉ tạo id 1-10 → id 15 không tồn tại → code vốn no-op, chỉ mang rủi ro xoá nhầm.
- Local/dev: migration đã chạy, đơn table_id=15 đã null hoá + bàn 15 đã xoá → code cũ hết tác dụng.
- An toàn hơn guard (loại hẳn rủi ro, không phụ thuộc tên bàn).

**Lưu ý:** Sau khi sửa, local/dev cần `migrate:fresh` hoặc rollback+rất lại để bản an toàn có hiệu lực (migration đã chạy bản cũ).

**Test:** Không test trực tiếp (data migration one-time). Verify `php artisan migrate:fresh` chạy OK + full suite pass.

---

## Phần 2 — Giá cố định từ menu, recompute server-side (#1)

**Vấn đề:** `POSController::sendToKitchen` (`:160-185`) nhận `unit_price`/`subtotal`/`vat_amount`/`total` từ request, ghi thẳng vào `orders`/`order_items` (`:255-329`). User có `pos.create` có thể set `unit_price=0` thanh toán miễn phí. `PaymentController::checkout` (`:32-45`) cũng tin `items.*.unit_price` từ client để tính subtotal/promotion.

**Giải pháp:** recompute toàn bộ giá server-side từ `menu_items.price`, theo mẫu `ReservationController:211-245`.

**`POSController::sendToKitchen`:**
- Bỏ `items.*.unit_price`, `subtotal`, `vat_amount`, `total` khỏi `$request->validate` (`:162-179`).
- Load `MenuItem` theo `menu_item_id`; `unit_price = $item->price` (read-only từ DB).
- Recompute `subtotal = Σ (quantity × price)`, `vat_amount` theo `vat_rate`, `total = subtotal + vat - discount` — giữ nguyên công thức hiện có.
- Thay các chỗ ghi `unit_price => $item['unit_price']`, `subtotal => $validated['subtotal']`, `total => $validated['total']` (`:255-329`) bằng giá/giá trị tính từ DB.
- KHÔNG đổi `reduced_items` flow (chỉ giảm quantity, giá giữ snapshot order_item).

**`PaymentController::checkout`:**
- Bỏ `items.*.unit_price` khỏi validate; `subtotal`/`total` không còn `required` từ client (`:32-36`).
- Load `MenuItem` theo id, tính `unit_price` từ DB, recompute `subtotal = Σ qty × price` (`:45`).
- Giữ nguyên promotion resolution (`PromotionEngine::resolveAll` — nhận subtotal đã recompute).
- Fallback "không items → dùng subtotal client" (`:51-55`) cần xem lại: với giá từ menu, subtotal client không còn đáng tin → bỏ fallback hoặc recompute từ DB nếu có order items.

**Bất biến:** Không đổi output KPI/report. Chỉ đổi nguồn giá client → DB.

**Test:** Sửa test hiện có đang gửi `unit_price` client thành không gửi + assert giá = `menu_items.price`. Thêm test: client gửi `unit_price=0`/`subtotal=0` → vẫn tính đúng giá DB. Test POS checkout/bulk checkout vẫn pass (posMenuItem có price khớp).

---

## Phần 3 — Kitchen race (#2)

**Vấn đề:** `KitchenController::completeOrder` check `status` (`:96-100`) trước transaction, không `lockForUpdate`. Checkout có thể commit giữa lúc đọc và update → order bị set `completed` sau khi đã thu tiền, ingredients trừ sau thanh toán.

**Giải pháp:** chuyển guard vào trong transaction + lock, theo mẫu `PaymentController:123`.

```php
DB::transaction(function () use ($order, $request, &$completedItems) {
    $order = Order::where('id', $order->id)->lockForUpdate()->first();
    if (! $order || in_array($order->status, ['paid', 'cancelled', 'completed'], true)) {
        return; // hoặc throw — đơn đã thanh toán/huỷ/hoàn thành
    }
    $order->update(['status' => 'completed', 'has_additional_items' => false]);
    // ... phần còn lại giữ nguyên (items guard đã đúng) ...
});
```

- Guard `paid/cancelled/completed` nằm trong transaction + `lockForUpdate`.
- Bỏ check ngoài transaction (`:96-100`) hoặc giữ làm fast-fail nhanh (không đủ an toàn).
- `completeItems` (`:154+`): item-level guard `whereIn(['pending','processing'])` đã đúng; thêm `lockForUpdate` trên order nếu method đọc/ghi status order.

**Test:** Giữ test hiện có (`KitchenFlowTest`) — guard paid/cancelled vẫn pass. Thêm test: order `completed` → không thể complete lại (assert không throw + status không đổi). Race test khó trong Pest — không bắt buộc.

---

## Phần 4 — Payment báo "thất bại" sau commit (#3)

**Vấn đề:** `PaymentController` cache flush `pos_tables` + event nằm trong `try` nhưng ngoài transaction (`:119`, `:220`, `:234`, `:384`). Redis down sau commit → throw → 422 "Thanh toán thất bại" dù đã trừ tiền; client retry → idempotency trả success nhưng UX vỡ.

**Giải pháp:** tách toàn bộ post-commit work ra khỏi try/catch, bọc `safeDispatch` (đã có `Staff/Concerns/DispatchesSafely.php`):

```php
$result = DB::transaction(function () use (...) { ... });  // hết trong try, trả $result

// SAU catch — post-commit work, không được throw:
$this->safeDispatch(fn () => Cache::tags(['pos_tables'])->flush());
$this->safeDispatch(fn () => PaymentSuccessful::dispatch(...));
```

**Áp dụng tại:**
- `checkout` (`:119-234`)
- `checkoutDeposit` / deposit refund (`:220-234`, `:384-404`)
- `bulkCheckout` (`:384-404`)

**Bất biến:** `safeDispatch` đã catch lỗi nội bộ. Không đổi response shape (success/error), không đổi luồng transaction. Post-commit work chỉ chạy khi commit thành công.

**Test:** Test checkout hiện có vẫn pass. Thêm test (nếu khả thi): `Cache::shouldReceive('tags')->andThrow()` → assert response vẫn success. Nếu không khả thi trong Pest, bỏ qua (ghi chú trong plan).

---

## Phần 5 — Soft delete menu_items/ingredients (#5)

**Vấn đề:** `order_items.menu_item_id` cascadeOnDelete (`140600:29`) + `inventory_transactions.ingredient_id`/`stock_check_items.ingredient_id` cascadeOnDelete (`140700:22,42`) — xoá món/nguyên liệu xoá sạch lịch sử. Chỉ `promotions` có SoftDeletes.

**Giải pháp:**
1. **Migration mới** `add_soft_deletes_to_menu_and_inventory`: `menu_items.deleted_at` + `ingredients.deleted_at` (nullable timestamp).
2. **Models**: `MenuItem` + `Ingredient` thêm `use Illuminate\Database\Eloquent\SoftDeletes;`.
3. **UI destroy → soft delete**: `ProductController::destroy` (`:134`) + `IngredientController::destroy` (`:86`) gọi `$model->delete()` → SoftDeletes tự set `deleted_at`, không cascade. Route-model binding Eloquent tự loại deleted.
4. **Seeder conflict — BẮT BUỘC xử lý:** `DefaultMenuAndInventorySeeder:88` dùng `MenuItem::updateOrCreate(['name'=>...])` (và tương tự ingredients). Sau soft-delete, Eloquent `updateOrCreate` bỏ qua dòng deleted → tạo mới trùng `menu_items.name` (unique) → lỗi. **Sửa:** `withTrashed()->updateOrCreate(...)` — update dòng cũ (kể cả deleted); nếu cần món hiện lại sau seed, `restore()` dòng đó.
5. **Query raw check:** `DashboardService::topProducts` join `invoice_lines` (snapshot `name_snapshot`) — an toàn. `lowStock` dùng Eloquent — tự exclude deleted. `POSController` load menu items Eloquent — tự exclude.
6. **Unique khi re-create:** `ingredients.code` unique nullable (`180000:14`) + `menu_items.name` unique. Flow hiện không có `firstOrCreate` trên ingredient theo code (IngredientController chỉ `destroy`) → không va chạm ở đường code hiện tại.

**Test:**
- Xoá món → `order_items` lịch sử còn nguyên; list menu không hiện món đã xoá.
- Xoá nguyên liệu → `inventory_transactions` còn nguyên.
- `db:seed` (hoặc `updateOrCreate`) sau khi soft-delete → không lỗi unique.

---

## Chiến lược kiểm thử

- **TDD** mỗi phần: viết test fail trước, sửa, test pass.
- Regression: full suite (`php artisan test`) — 264 test hiện có không vỡ.
- `vendor/bin/pint --dirty`, `npm run types:check`, `npm run build`.
- PowerShell Windows: không `&&`.

## File Structure

**Sửa:**
- `database/migrations/2026_07_29_000000_create_order_activities_and_migrate_takeaway.php`
- `app/Http/Controllers/Staff/POSController.php`
- `app/Http/Controllers/Staff/PaymentController.php`
- `app/Http/Controllers/Staff/KitchenController.php`
- `app/Models/MenuItem.php`
- `app/Models/Ingredient.php`
- `app/Http/Controllers/Manager/ProductController.php`
- `app/Http/Controllers/Manager/IngredientController.php`
- `database/seeders/DefaultMenuAndInventorySeeder.php`

**Tạo mới:**
- `database/migrations/2026_08_10_000001_add_soft_deletes_to_menu_and_inventory.php`
- `tests/Feature/PriceFromMenuTest.php` (hoặc gộp vào test POS hiện có)
- `tests/Feature/KitchenOrderStatusGuardTest.php`
- `tests/Feature/SoftDeleteMenuInventoryTest.php`
