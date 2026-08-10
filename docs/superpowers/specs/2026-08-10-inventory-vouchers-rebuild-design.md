# Kho phiếu nhập/xuất + Rebuild Migrations

> Design spec: nâng cấp hệ thống kho bằng phiếu nhập/xuất chuẩn hoá + tổ chức lại migrations (DB đã mất sạch dữ liệu → rebuild sạch, mỗi nhóm bảng 1 file, thứ tự FK chặt chẽ).

**Goal:** Thay `inventory_transactions` + `stock_checks` bằng bảng phiếu chuẩn (`stock_vouchers` + `stock_voucher_items`), trừ kho chuyển từ bếp sang checkout, thêm trang quản lý phiếu + nhập kho nhiều nguyên liệu, và rebuild toàn bộ migrations thành 15 file theo nhóm phụ thuộc.

**Scope:** DB (rebuild migrations + bảng kho mới), backend (models, controller, routes, permissions, checkout hook), frontend (trang phiếu, modal nhập nhiều nguyên liệu, filterbar). KHÔNG làm: kiểm kê kho (stock check — xoá, thêm lại khi phát triển), báo hết nguyên liệu phía bếp (tương lai).

---

## Phần 1 — Rebuild migrations (15 file, theo nhóm phụ thuộc)

Xoá toàn bộ `database/migrations/*` cũ (35 file), tạo bộ mới. Gộp mọi cột thêm sau này vào đúng file tạo bảng. KHÔNG có file backfill/data.

**Bảng XOÁ hẳn (không tạo lại):** `inventory_transactions`, `stock_checks`, `stock_check_items`, `reports`.

**Đổi FK sang `restrictOnDelete` (3 chỗ):** `order_items.menu_item_id`, `product_recipes.menu_item_id`, `product_recipes.ingredient_id` — chặn hard-delete món/nguyên liệu đã có lịch sử (soft-delete là đường normal; cascade cũ chỉ nguy hiểm khi hard-delete).

**SoftDeletes:** `menu_items`, `ingredients`, `promotions`.

### File structure

| # | File | Bảng | Phụ thuộc |
|---|------|------|-----------|
| 1 | `create_users_tables` | users, cache, jobs | — |
| 2 | `create_people_tables` | employees (→users), customers | users |
| 3 | `create_authorization_tables` | pages, roles, permissions, role_permissions, user_roles, role_pages | users |
| 4 | `create_menu_tables` | menu_categories, menu_items (softDeletes) | — |
| 5 | `create_tables_table` | tables (self-FK merged_into_table_id, reservation_*) | — |
| 6 | `create_promotions_table` | promotions (target_type/value, softDeletes) | — |
| 7 | `create_orders_tables` | orders, order_items | menu (4) |
| 8 | `create_invoices_tables` | invoices **+ thêm `orders.invoice_id` FK → invoices** | orders (7) |
| 9 | `create_payment_core_tables` | payments, invoice_lines, invoice_promotions | invoices (8) |
| 10 | `create_deposits_table` | deposits | payments (9) |
| 11 | `create_shifts_table` | shifts | users |
| 12 | `create_ingredients_table` | ingredients (softDeletes) | — |
| 13 | `create_product_recipes_table` | product_recipes | menu (4), ingredients (12) |
| 14 | `create_stock_vouchers_table` | stock_vouchers, stock_voucher_items | employees (2), ingredients (12) |
| 15 | `create_otp_codes_table` | otp_codes | — |

**Điểm mấu chốt thứ tự FK:**
- `orders.invoice_id` FK → invoices được thêm trong **file 8** (orders tạo ở file 7, invoices ở file 8 → phải thêm FK sau khi invoices tồn tại).
- `deposits.payment_id` trong file 10, sau payment_core (9).
- `stock_vouchers` file 14, sau employees (2) + ingredients (12).

### Cột gộp vào file gốc

- **orders**: order_code, table_id, employee_id, customer_id, promotion_id, subtotal, discount_amount, vat_amount, total, has_additional_items, invoice_id (thêm ở file 8), status (string, default pending — không enum), reservation_name/phone/time/note, note, timestamps.
- **order_items**: order_id, menu_item_id (restrict), quantity, unit_price, subtotal, discount_amount, status (string default pending), note, cancellation_reason, cancelled_by_user_id, cancelled_at, served_at, timestamps.
- **invoices**: invoice_code, table_name, payment_method (enum cash/bank_transfer/e_wallet), amount_received, change_amount, total_amount, deposit_amount, subtotal_amount, vat_amount, discount_amount, external_no, external_ref, issued_at, timestamps.
- **tables**: table_number, capacity, area, status (enum available/occupied/reserved/maintenance), reservation_name/phone/time/note, merged_into_table_id.
- **ingredients**: code (unique nullable), name (unique), unit, stock_quantity, min_stock_alert, cost_price, expiry_date, deleted_at, timestamps.
- **menu_items**: category_id, name, price, vat_rate, image, description, is_available, deleted_at, timestamps.
- **promotions**: code, name, description, discount_type (enum percentage/fixed_amount), discount_value, target_type (string default 'order'), target_value, min_order_amount, max_discount_amount, max_uses, used_count, starts_at, expires_at, is_active, deleted_at, timestamps.

### Các bảng giữ nguyên cột hiện tại (không đổi)

users, cache, jobs, employees, customers, pages, roles, permissions, role_permissions, user_roles, role_pages, menu_categories, payments, invoice_lines, invoice_promotions, deposits, shifts, otp_codes.

---

## Phần 2 — Schema bảng kho mới

**`stock_vouchers`** (đầu phiếu):
```
id
voucher_code    string unique       // PN-YYYYMMDD-xxx / PX-YYYYMMDD-xxx
type            enum['import','export']
employee_id     FK employees nullOnDelete
transacted_at   dateTime
note            string nullable     // nhà cung cấp / lý do / số đơn
created_by      FK users nullOnDelete
timestamps
```

**`stock_voucher_items`** (từng dòng nguyên liệu):
```
id
voucher_id      FK stock_vouchers cascadeOnDelete
ingredient_id   FK ingredients restrictOnDelete
quantity        decimal(15,2)       // import: dương; export: âm
unit_price      decimal(15,2) nullable  // CHỈ phiếu nhập (tính WAC); export = null
timestamps
```

**Bất biến:**
- `ingredients.stock_quantity` = tổng `quantity` mọi `stock_voucher_items` → giữ làm **cache**, cập nhật trong cùng transaction khi ghi phiếu (mọi query hiện tại không đổi: POS max_servings, dashboard lowStock, ingredient list).
- Tồn kho tại thời điểm T = `SUM(quantity) WHERE transacted_at <= T` (truy vấn tổng, không cần bảng snapshot).
- Mỗi phiếu ghi 1 transaction duy nhất (đầu phiếu + items + update stock_quantity + cost_price WAC).

---

## Phần 3 — Data flow

### Phiếu nhập (thủ công)
1. UI: modal "Nhập kho" (từ filterbar) — nhiều nguyên liệu, mỗi dòng `{ingredient_id, quantity, unit_price}` + note.
2. `StockVoucherController::store` (type=import) trong 1 transaction:
   - Tạo `stock_vouchers` + `stock_voucher_items` (quantity dương, unit_price lưu).
   - Với mỗi item: `stock_quantity += quantity`; `cost_price` WAC = `(stock_cũ × cost_cũ + qty × unit_price) / stock_mới` (giữ logic `IngredientController::importStock:126-135`).
   - Flush `Cache::tags(['dashboard'])` (kpi low_stock).
3. **Bỏ** `IngredientController::importStock` + `StockImportModal` cũ (nút nhập 1 nguyên liệu ở từng dòng bảng).

### Phiếu xuất (tự động tại checkout)
1. `CheckoutService::runBulk` — trong transaction hiện có, trước `return $invoice`, thêm `createStockExportVoucher($orders, $userId)`:
   - Aggregate toàn bộ `order_items` của các order trong hoá đơn → theo `ingredient_id` qua `product_recipes`: `total_used = Σ (recipe.amount × order_item.quantity)`.
   - Tạo 1 phiếu export (type=export) với từng dòng `quantity = -total_used`, `unit_price = null`.
   - Với mỗi dòng: `ingredient.stock_quantity -= total_used` (có thể âm — guard `max_servings` đã chặn order quá lượng từ POS).
2. **Bỏ hoàn toàn:**
   - `KitchenController::deductIngredients` (`:254-273`)
   - `InventoryIngredientService` (file `app/Services/InventoryIngredientService.php`) + `restoreIngredients` gọi tại `KitchenController:318` và `POSController:390`
   - `use InventoryIngredientService` + constructor injection ở 2 controller

**Thay đổi behavior (đã chấp nhận):** kho trừ tại checkout thay vì khi bếp hoàn thành món → trong lúc món đang nấu, `max_servings` ở POS tính trên tồn kho chưa trừ → nhiều bàn cùng dùng chung nguyên liệu có thể order vượt lượng thực có. Chấp nhận; sau này bổ sung nút báo hết nguyên liệu phía bếp.

---

## Phần 4 — Backend

**Models (mới):**
- `StockVoucher`: `$fillable`, relations `items` (hasMany), `employee` (belongsTo Employee), `creator` (belongsTo User).
- `StockVoucherItem`: relations `voucher` (belongsTo), `ingredient` (belongsTo Ingredient).

**Controller (mới):** `Manager\StockVoucherController`
- `index()` — danh sách phiếu + filter (type, date range, search theo code/note), kèm `transacted_at`/`note`/type/employee.
- `store()` — tạo phiếu nhập. Validate: `type=import` (fix), `items` array min:1, `items.*.ingredient_id exists:ingredients,id`, `items.*.quantity numeric|gt:0`, `items.*.unit_price numeric|min:0`, `note nullable|string|max:255`. Transaction như Phần 3. Trả về back/redirect + success.
- `show()` — chi tiết phiếu (items kèm ingredient), pivot data: danh sách ingredient + giá trị từng dòng.

**CheckoutService::runBulk** — thêm private static `createStockExportVoucher(Collection $orders, ?int $userId): void`:
- Gom order_items → ingredient_id → total_used.
- Tạo phiếu export + items âm + decrement stock.
- Gọi trước `return $invoice;` trong transaction.

**Routes** (group `/manager`, sau `/inventory/ingredients`, `:120-129`):
```
GET    /inventory/vouchers           permission:inventory.vouchers.view
POST   /inventory/vouchers           permission:inventory.vouchers.create
GET    /inventory/vouchers/{id}      permission:inventory.vouchers.view
```

**Permissions mới:** `inventory.vouchers.view`, `inventory.vouchers.create` — thêm vào `AuthorizationSeeder` + `RoleController` allowed list (tìm chỗ khai báo permission list hiện tại để thêm đồng bộ).

**Page record mới:** group `/manager` có middleware `CheckPageAccess` (routes/web.php:98) — cần thêm record vào bảng `pages` (seed trong `AuthorizationSeeder`): `name = 'Phiếu kho'`, `route_path = '/manager/inventory/vouchers'`, `group_name = 'Kho'` (khớp nhóm sidebar hiện tại), `sort_order` hợp lý. Thiếu record này → CheckPageAccess chặn + sidebar không hiện link.

**Voucher code sinh:** `PN-`/`PX-` + `Ymd` + `-` + sequence (3 chữ số), lockForUpdate theo pattern `GeneratesOrderCode`; ví dụ `PN-20260810-001`.

---

## Phần 5 — Frontend

**Trang mới `StockVouchersManager`** (route `/manager/inventory/vouchers`, Inertia):
- Danh sách phiếu: voucher_code, type badge (Nhập/Xuất), transacted_at, note, người tạo.
- Filter: type (tất cả/nhập/xuất), khoảng ngày (start/end), search code/note.
- Xem chi tiết phiếu: **pivot bảng ngang** — cột = nguyên liệu (chỉ các nguyên liệu trong phiếu), 1 dòng, giá trị dương (nhập) / âm (xuất).
- Nút "Tạo phiếu nhập" → mở modal nhập nhiều nguyên liệu.

**`IngredientsManager.tsx`**:
- Bỏ nút "Nhập kho" ở từng dòng `IngredientTable.tsx:214` + `StockImportModal` cũ + `importIngredient` state.
- `IngredientFilterBar.tsx` thêm nút "Nhập kho" → mở modal nhập nhiều nguyên liệu.

**Modal mới `StockImportModal`** (thay cái cũ, trong trang ingredients + dùng chung cho voucher page):
- Nhiều dòng: select nguyên liệu (từ danh sách ingredients), quantity, unit_price.
- Preview: tổng tiền, tồn kho sau nhập từng nguyên liệu, WAC mới.
- Submit → POST `/manager/inventory/vouchers` (type=import).

**Menu/sidebar:** thêm link "Phiếu kho" vào phân hệ Quản lý Kho (cùng nhóm IngredientsManager).

---

## Chiến lược kiểm thử

- **Rebuild migrations:** `php artisan migrate:fresh` chạy 15 file OK; full suite (test hiện có dùng schema này) pass. Bảng `inventory_transactions`/`stock_checks`/`reports` không tồn tại.
- **FK restrict:** test xoá hard menu_item/ingredient có lịch sử → DB chặn (exception); soft-delete vẫn OK + lịch sử giữ nguyên.
- **Phiếu nhập:** `StockVoucherController::store` tạo voucher + items + update stock + WAC đúng; test WAC giữ logic importStock cũ.
- **Phiếu xuất:** checkout tạo 1 phiếu export với lượng âm aggregate đúng; stock giảm đúng; đơn không recipe → không phiếu.
- **Bỏ trừ bếp:** `completeOrder`/`completeItems`/`cancelItem`/`cancelOrder` không còn tạo inventory_transactions/restore (các test cũ về deduct/restore phải cập nhật).
- **Frontend:** typecheck + build pass; trang voucher + modal nhập nhiều nguyên liệu render.

## File Structure

**Sửa:**
- `database/migrations/*` — xoá toàn bộ, tạo 15 file mới
- `app/Http/Controllers/Staff/KitchenController.php` — bỏ deductIngredients + restore block + service import
- `app/Http/Controllers/Staff/POSController.php` — bỏ restore block + service import
- `app/Services/Checkout/CheckoutService.php` — thêm createStockExportVoucher
- `app/Http/Controllers/Manager/IngredientController.php` — bỏ importStock
- `routes/web.php` — thêm 3 route vouchers
- `database/seeders/AuthorizationSeeder.php` + `RoleController.php` — thêm 2 permissions
- `resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx`, `IngredientFilterBar.tsx`, `IngredientTable.tsx` — bỏ nút nhập dòng, thêm nút filterbar
- Menu/sidebar layout — thêm link "Phiếu kho"

**Tạo mới:**
- `app/Models/StockVoucher.php`, `app/Models/StockVoucherItem.php`
- `app/Http/Controllers/Manager/StockVoucherController.php`
- `resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx`
- `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx` (mới, thay cũ)
- Tests: migration rebuild, voucher import, voucher export at checkout, FK restrict

**Xoá:**
- `app/Services/InventoryIngredientService.php`
- `database/migrations/*` cũ (thay bằng 15 file mới)
