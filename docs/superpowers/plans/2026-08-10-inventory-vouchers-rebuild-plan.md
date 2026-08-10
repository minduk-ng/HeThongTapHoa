# Kho phiếu nhập/xuất + Rebuild Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay `inventory_transactions`/`stock_checks` bằng bảng phiếu chuẩn (`stock_vouchers` + `stock_voucher_items`), trừ kho tại checkout, thêm trang quản lý phiếu + nhập kho nhiều nguyên liệu, và rebuild toàn bộ migrations thành 15 file theo nhóm phụ thuộc (DB đã mất sạch).

**Architecture:** DB sạch → rebuild migrations 15 file (xoá 4 bảng dead, 3 FK đổi `restrictOnDelete`). Phiếu nhập thủ công nhiều nguyên liệu (lưu `unit_price`, cập nhật `stock_quantity` + WAC `cost_price`). Phiếu xuất tự động tạo trong `CheckoutService::runBulk` transaction (aggregate order_items → ingredients qua `product_recipes`, ghi quantity âm). Bỏ trừ kho ở bếp (`deductIngredients`/`restoreIngredients`) + `inventory_transactions` + `InventoryIngredientService`. Trang `StockVouchersManager` (list + pivot bảng ngang), modal nhập nhiều nguyên liệu thay `StockImportModal` cũ, nút nhập chuyển từ dòng bảng lên filterbar.

**Tech Stack:** Laravel 13, PHP, Pest, Inertia + React + TypeScript, SQLite (test) / MySQL (dev).

**Spec:** `docs/superpowers/specs/2026-08-10-inventory-vouchers-rebuild-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` như lệnh đơn.
- DB đã mất sạch — `migrate:fresh` an toàn, không lo mất dữ liệu.
- Mỗi task TDD (migration schema test; voucher behavior test).
- **KHÔNG tạo lại:** `inventory_transactions`, `stock_checks`, `stock_check_items`, `reports`.
- **Đổi restrictOnDelete (3 FK):** `order_items.menu_item_id`, `product_recipes.menu_item_id`, `product_recipes.ingredient_id`.
- SoftDeletes: `menu_items`, `ingredients`, `promotions`.
- `orders.invoice_id` FK → invoices thêm trong file `create_invoices_tables` (sau khi invoices tồn tại).
- Bỏ hoàn toàn trừ kho ở bếp: `KitchenController::deductIngredients`, `InventoryIngredientService::restoreIngredients` (2 call site), `IngredientController::importStock`, `StockImportModal` cũ.
- Bảng mới `stock_vouchers.type` = `enum['import','export']`; `stock_voucher_items.quantity` dương (import) / âm (export); `unit_price` chỉ import.
- Trừ kho tại checkout: `CheckoutService::runBulk` tạo 1 phiếu export, quantity = `-(recipe.amount × order_item.quantity)`; stock có thể âm (guard `max_servings` chặn từ POS).
- Voucher code: `PN-`/`PX-` + `Ymd` + `-` + seq 3 số (pattern `GeneratesOrderCode`).
- **Verify MySQL thật:** sau rebuild, chạy `php artisan migrate:fresh` trên MySQL local (HeThongTapHoa) + `db:seed` + smoke POS/checkout/kho.

---

## File Structure

**Xoá:**
- `database/migrations/*` (35 file cũ → 15 file mới)
- `app/Services/InventoryIngredientService.php`
- `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx` (cũ)

**Tạo mới:**
- 15 file migration (theo bảng file structure ở Task 1)
- `app/Models/StockVoucher.php`, `app/Models/StockVoucherItem.php`
- `app/Http/Controllers/Manager/StockVoucherController.php`
- `resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx`
- `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx` (mới, nhập nhiều nguyên liệu)
- Tests: `MigrationRebuildTest.php`, `StockVoucherImportTest.php`, `StockVoucherExportTest.php`

**Sửa:**
- `app/Http/Controllers/Staff/KitchenController.php` — bỏ deductIngredients + restore block + service import/constructor
- `app/Http/Controllers/Staff/POSController.php` — bỏ restore block + service import/constructor
- `app/Services/Checkout/CheckoutService.php` — thêm createStockExportVoucher
- `app/Http/Controllers/Manager/IngredientController.php` — bỏ importStock
- `routes/web.php` — thêm 3 route vouchers, bỏ route import
- `database/seeders/AuthorizationSeeder.php` — 2 permissions + 1 page record
- `app/Http/Controllers/Admin/RoleController.php` — thêm 2 permissions vào allowed list
- `resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx`, `IngredientFilterBar.tsx`, `IngredientTable.tsx`
- Tests cũ dùng `inventory_transactions`: `KitchenFlowTest.php`, `KitchenServingIdempotencyTest.php`, `KitchenRaceTest.php`, `POSCancelRaceTest.php`, `POSTableOperationsTest.php`, `Hardening/SoftDeleteMenuInventoryTest.php`

**Lưu ý ratified (Task 1 đã thực hiện, plan cập nhật theo thực tế):**
- Migration = 15 base + 2 compat file (`backfill_payment_core_tables`, `add_report_performance_indexes`) — test `require` theo path cũ.
- `invoices.payment_method` + `tables.status` là `string` (không enum) — app ghi `'mixed'`/`'empty'`.
- `order_activities` (file 7) + framework tables `sessions`/`cache_locks`/`job_batches`/`failed_jobs` (file 1) được giữ.

---

## Task 1: Rebuild migrations (15 file)

**Files:**
- Delete: toàn bộ `database/migrations/*.php` cũ
- Create: 15 file migration mới
- Test: `tests/Feature/MigrationRebuildTest.php` (mới)

**Interfaces:**
- Produces: 15 file migration theo bảng phụ thuộc (chi tiết bên dưới). Các task sau phụ thuộc schema này.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/MigrationRebuildTest.php`:

```php
<?php

use Illuminate\Support\Facades\Schema;

test('migration rebuild tao cac bang chinh', function () {
    $tables = ['users', 'employees', 'customers', 'pages', 'roles', 'permissions',
        'role_permissions', 'user_roles', 'role_pages', 'menu_categories', 'menu_items',
        'tables', 'promotions', 'orders', 'order_items', 'invoices', 'payments',
        'invoice_lines', 'invoice_promotions', 'deposits', 'shifts', 'ingredients',
        'product_recipes', 'stock_vouchers', 'stock_voucher_items', 'otp_codes',
        'cache', 'jobs'];
    foreach ($tables as $table) {
        expect(Schema::hasTable($table))->toBeTrue();
    }
});

test('migration rebuild khong tao bang cu da bo', function () {
    expect(Schema::hasTable('inventory_transactions'))->toBeFalse();
    expect(Schema::hasTable('stock_checks'))->toBeFalse();
    expect(Schema::hasTable('stock_check_items'))->toBeFalse();
    expect(Schema::hasTable('reports'))->toBeFalse();
});

test('orders co invoice_id FK tro toi invoices', function () {
    expect(Schema::hasColumn('orders', 'invoice_id'))->toBeTrue();
    $indexes = collect(Schema::getIndexes('orders'))->pluck('name');
    expect($indexes->contains(fn ($i) => str_contains($i, 'invoice_id')))->toBeTrue();
});

test('stock_voucher_items co cac cot dung', function () {
    expect(Schema::hasColumns('stock_voucher_items', [
        'id', 'voucher_id', 'ingredient_id', 'quantity', 'unit_price', 'created_at', 'updated_at',
    ]))->toBeTrue();
});
```

**Lưu ý:** `Schema::getIndexes('orders')` trả về mảng index; kiểm tra signature Laravel 13 tại `vendor/laravel/framework/src/Illuminate/Database/Schema/Builder.php` (`getIndexes`). Nếu khác, dùng `Schema::hasIndex` với tên index thật (`orders_invoice_id_index`).

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\MigrationRebuildTest.php`
Expected: FAIL — các bảng cũ chưa có (migration cũ chạy xong nhưng schema khác / bảng mới chưa tồn tại). Ghi nhận RED.

- [ ] **Step 3: Xoá migration cũ + tạo 15 file mới**

Xoá toàn bộ `database/migrations/*.php`. Tạo 15 file theo bảng sau (MỖI file = 1 nhóm bảng phụ thuộc, gộp cột thêm sau vào file tạo bảng):

**File 1 `0001_01_01_000000_create_users_tables.php`** (users, cache, jobs — từ 3 file gốc Laravel cũ, giữ nguyên):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('google_id')->nullable()->unique()->index();
            $table->string('avatar')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('cache', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->mediumText('value');
            $table->integer('expiration');
        });

        Schema::create('jobs', function (Blueprint $table) {
            $table->id();
            $table->string('queue')->index();
            $table->longText('payload');
            $table->unsignedTinyInteger('attempts');
            $table->unsignedInteger('reserved_at')->nullable();
            $table->unsignedInteger('available_at');
            $table->unsignedInteger('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('jobs');
        Schema::dropIfExists('cache');
        Schema::dropIfExists('users');
    }
};
```
**Lưu ý:** xác nhận cột thật của `users` (google_id, avatar...) bằng cách đọc file gốc cũ trước khi xoá — copy đúng schema hiện tại, không đoán.

**File 2 `0001_01_01_000001_create_people_tables.php`** — employees, customers:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->string('employee_code', 20)->unique();
            $table->string('full_name', 100);
            $table->string('position', 50)->nullable();
            $table->decimal('base_salary', 15, 2)->default(0);
            $table->date('hire_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('customer_code', 20)->unique()->nullable();
            $table->string('full_name', 100);
            $table->string('phone', 15)->nullable();
            $table->integer('loyalty_points')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
        Schema::dropIfExists('employees');
    }
};
```

**File 3 `0001_01_01_000002_create_authorization_tables.php`** — pages, roles, permissions, role_permissions, user_roles, role_pages (gộp từ 2 file gốc `2026_07_10_110000_create_authorization_tables.php` + `2026_07_13_083736_create_role_pages_table.php`, giữ nguyên cột).

**File 4 `2026_08_10_000001_create_menu_tables.php`** — menu_categories + menu_items (kèm `softDeletes()`):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('menu_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->nullable()->constrained('menu_categories')->nullOnDelete();
            $table->string('name', 100);
            $table->decimal('price', 15, 2);
            $table->decimal('vat_rate', 5, 2)->default(0.00);
            $table->string('image', 255)->nullable();
            $table->text('description')->nullable();
            $table->boolean('is_available')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu_items');
        Schema::dropIfExists('menu_categories');
    }
};
```

**File 5 `2026_08_10_000002_create_tables_table.php`** — tables (gộp reservation_* + merged_into_table_id):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tables', function (Blueprint $table) {
            $table->id();
            $table->string('table_number', 10)->unique();
            $table->integer('capacity')->default(4);
            $table->string('area', 50)->nullable();
            $table->enum('status', ['available', 'occupied', 'reserved', 'maintenance'])->default('available');
            $table->string('reservation_name')->nullable();
            $table->string('reservation_phone', 20)->nullable();
            $table->dateTime('reservation_time')->nullable();
            $table->text('reservation_note')->nullable();
            $table->foreignId('merged_into_table_id')->nullable()->constrained('tables')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tables');
    }
};
```

**File 6 `2026_08_10_000003_create_promotions_table.php`** — promotions (gộp target_type/value + softDeletes):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->enum('discount_type', ['percentage', 'fixed_amount']);
            $table->decimal('discount_value', 15, 2);
            $table->string('target_type', 20)->default('order');
            $table->unsignedBigInteger('target_value')->nullable();
            $table->decimal('min_order_amount', 15, 2)->default(0);
            $table->decimal('max_discount_amount', 15, 2)->nullable();
            $table->integer('max_uses')->nullable();
            $table->integer('used_count')->default(0);
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('expires_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
    }
};
```

**File 7 `2026_08_10_000004_create_orders_tables.php`** — orders + order_items (gộp mọi cột thêm sau; `order_items.menu_item_id` = `restrictOnDelete`):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_code', 50)->unique();
            $table->foreignId('table_id')->nullable()->constrained('tables')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->boolean('has_additional_items')->default(false);
            $table->string('status', 50)->default('pending');
            $table->string('reservation_name', 100)->nullable();
            $table->string('reservation_phone', 20)->nullable();
            $table->dateTime('reservation_time')->nullable();
            $table->text('reservation_note')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained('menu_items')->restrictOnDelete();
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 15, 2);
            $table->decimal('subtotal', 15, 2);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->string('status', 50)->default('pending');
            $table->string('note', 255)->nullable();
            $table->string('cancellation_reason')->nullable();
            $table->foreignId('cancelled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('served_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
```

**File 8 `2026_08_10_000005_create_invoices_tables.php`** — invoices + thêm `orders.invoice_id`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_code', 50)->unique();
            $table->string('table_name')->nullable();
            $table->enum('payment_method', ['cash', 'bank_transfer', 'e_wallet']);
            $table->decimal('amount_received', 15, 2)->default(0);
            $table->decimal('change_amount', 15, 2)->default(0);
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->decimal('deposit_amount', 12, 2)->default(0);
            $table->decimal('subtotal_amount', 15, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->string('external_no')->nullable();
            $table->string('external_ref')->nullable();
            $table->dateTime('issued_at')->useCurrent();
            $table->timestamps();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('invoice_id')->nullable()->after('status');
            $table->index('invoice_id', 'orders_invoice_id_index');
            $table->foreign('invoice_id')->references('id')->on('invoices')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['invoice_id']);
            $table->dropIndex('orders_invoice_id_index');
            $table->dropColumn('invoice_id');
        });
        Schema::dropIfExists('invoices');
    }
};
```

**File 9 `2026_08_10_000006_create_payment_core_tables.php`** — payments, invoice_lines, invoice_promotions (copy nguyên từ `2026_08_05_000001_create_payment_core_tables.php`, giữ cột + index + FK).

**File 10 `2026_08_10_000007_create_deposits_table.php`** — deposits (gộp payment_id từ payment_core):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deposits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('method', 20);
            $table->string('status', 20)->default('held');
            $table->foreignId('received_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('resolved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('resolved_at')->nullable();
            $table->foreignId('payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deposits');
    }
};
```
**Lưu ý:** `deposits.amount` gốc là `decimal(12,0)` — xác nhận model `Deposit` cast gì (float?) và giữ đúng hoặc nâng thành (12,2) — ghi rõ quyết định trong report.

**File 11 `2026_08_10_000008_create_shifts_table.php`** — shifts (copy nguyên `2026_08_01_000000_create_shifts_table.php`).

**File 12 `2026_08_10_000009_create_ingredients_table.php`** — ingredients (gộp code/min_stock_alert/cost_price + softDeletes):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->nullable()->unique();
            $table->string('name', 100)->unique();
            $table->string('unit', 20);
            $table->decimal('stock_quantity', 10, 2)->default(0);
            $table->decimal('min_stock_alert', 10, 2)->default(50);
            $table->decimal('cost_price', 12, 2)->default(0);
            $table->date('expiry_date')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredients');
    }
};
```

**File 13 `2026_08_10_000010_create_product_recipes_table.php`** — product_recipes (2 FK restrict):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_recipes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('menu_item_id')->constrained('menu_items')->restrictOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients')->restrictOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('unit', 20);
            $table->timestamps();
            $table->unique(['menu_item_id', 'ingredient_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_recipes');
    }
};
```

**File 14 `2026_08_10_000011_create_stock_vouchers_table.php`** — stock_vouchers + stock_voucher_items (bảng MỚI):
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_vouchers', function (Blueprint $table) {
            $table->id();
            $table->string('voucher_code', 50)->unique();
            $table->enum('type', ['import', 'export']);
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->dateTime('transacted_at');
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('stock_voucher_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('voucher_id')->constrained('stock_vouchers')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients')->restrictOnDelete();
            $table->decimal('quantity', 15, 2);
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_voucher_items');
        Schema::dropIfExists('stock_vouchers');
    }
};
```

**File 15 `2026_08_10_000012_create_otp_codes_table.php`** — otp_codes (copy nguyên `2026_07_10_063838_create_otp_codes_table.php`).

- [ ] **Step 4: Chạy migrate:fresh + test pass**

Run: `php artisan migrate:fresh`
Expected: 15 migration chạy OK.

Run: `php artisan test tests\Feature\MigrationRebuildTest.php`
Expected: PASS.

- [ ] **Step 5: Verify MySQL thật**

Run: `php artisan migrate:fresh` (DB MySQL local HeThongTapHoa — cấu hình hiện tại)
Run: `php artisan db:seed`
Expected: 15 file migrate OK trên MySQL, seed OK.

- [ ] **Step 6: Chạy full suite**

Run: `php artisan test`
Expected: FAIL các test dùng `inventory_transactions` (KitchenFlowTest, KitchenServingIdempotencyTest, KitchenRaceTest, POSCancelRaceTest, POSTableOperationsTest, Hardening/SoftDeleteMenuInventoryTest) — **ghi nhận là expected** (Task 2 sẽ xử lý). Các test còn lại PASS.

- [ ] **Step 7: Commit**

```bash
git add database/migrations tests/Feature/MigrationRebuildTest.php
git commit -m "feat: rebuild 15 migration theo bang + xoa bang inventory_transactions/stock_checks/reports"
```

---

## Task 2: Bỏ trừ kho ở bếp + inventory_transactions (backend cleanup)

**Files:**
- Delete: `app/Services/InventoryIngredientService.php`
- Modify: `app/Http/Controllers/Staff/KitchenController.php` — bỏ deductIngredients + restore block + service import/constructor
- Modify: `app/Http/Controllers/Staff/POSController.php` — bỏ restore block + service import/constructor
- Modify: `app/Http/Controllers/Manager/IngredientController.php` — bỏ importStock
- Modify: `routes/web.php` — bỏ route `/inventory/ingredients/import`
- Modify: tests cũ — `KitchenFlowTest.php`, `KitchenServingIdempotencyTest.php`, `KitchenRaceTest.php`, `POSCancelRaceTest.php`, `POSTableOperationsTest.php`, `Hardening/SoftDeleteMenuInventoryTest.php`
- Delete: `app/Models/InventoryTransaction.php`

**Interfaces:**
- Consumes: schema Task 1 (không còn bảng `inventory_transactions`).
- Produces: không còn `InventoryTransaction` model/service; `completeOrder`/`completeItems`/`cancelItem`/`cancelOrder` không đụng kho; `importStock` route bỏ.

- [ ] **Step 1: Chạy full suite ghi nhận fail hiện tại**

Run: `php artisan test`
Expected: fail các test inventory_transactions (Task 1 Step 6). Ghi nhận danh sách fail.

- [ ] **Step 2: Bỏ deductIngredients + restore trong KitchenController**

`app/Http/Controllers/Staff/KitchenController.php`:
- Bỏ import: `use App\Models\InventoryTransaction;` (`:13`), `use App\Services\InventoryIngredientService;` (`:18`)
- Bỏ constructor param `private InventoryIngredientService $inventoryIngredientService` (`:31`)
- Bỏ method `deductIngredients` (`:254-273`) toàn bộ
- Bỏ 2 lời gọi `$this->deductIngredients(...)` (`:132`, `:210`)
- Bỏ block restore trong `cancelItem` (`:316-323`) — cả `if ($wasCompleted)` block
- Bỏ biến `$wasCompleted` (`:300`) nếu không còn dùng

- [ ] **Step 3: Bỏ restore trong POSController**

`app/Http/Controllers/Staff/POSController.php`:
- Bỏ import `use App\Services\InventoryIngredientService;` (`:17`)
- Bỏ constructor param (`:31`)
- Bỏ block restore trong `cancelOrder` (`:377-395`) — giữ nguyên phần update status cancelled + `$order->update(['status' => 'cancelled'])`

- [ ] **Step 4: Bỏ InventoryIngredientService + InventoryTransaction model**

Delete `app/Services/InventoryIngredientService.php` + `app/Models/InventoryTransaction.php`.

- [ ] **Step 5: Bỏ importStock trong IngredientController + route**

`app/Http/Controllers/Manager/IngredientController.php`:
- Bỏ method `importStock` (`:106-152`) toàn bộ
- Bỏ import `DB`, `IngredientStockUpdated` nếu không còn dùng (kiểm tra: store/update vẫn dùng IngredientStockUpdated → giữ event)

`routes/web.php`:
- Bỏ: `Route::post('/inventory/ingredients/import', [IngredientController::class, 'importStock'])->middleware('permission:ingredients.import');` (`:123`)

- [ ] **Step 6: Sửa tests cũ**

Cập nhật 6 test file (đọc từng file, sửa theo intent — KHÔNG xoá test, đổi assertion):

**`KitchenFlowTest.php`:**
- Bỏ `use App\Models\InventoryTransaction;`
- Các test assert `InventoryTransaction::where('type','export')->count()`/`->count()` → chuyển sang assert stock_quantity đổi (giữ `expect(stock_quantity)->toBe(...)` — giờ KHÔNG đổi nữa vì bỏ trừ bếp). Ví dụ:
  - Test "trừ kho khi hoàn thành" (`:39-43`): giờ stock KHÔNG trừ khi complete → `expect((float) $coffee->fresh()->stock_quantity)->toBe(1000.0);` (không đổi) và bỏ assert `InventoryTransaction::...count()`.
  - Test hoàn kho khi huỷ (`:218-220`): stock không đổi → bỏ block restore assert.
- Đọc từng test, giữ intent "bếp hoàn thành/huỷ món không còn đụng kho", assert stock không đổi + không còn transaction.

**`KitchenRaceTest.php`:**
- Bỏ import + đổi assert (`:23-24`): stock không đổi (không trừ khi complete) → `toBe(1000.0)`.

**`POSCancelRaceTest.php`:**
- Bỏ import; test restore (`:27-28`): stock không restore → `toBe(1000.0)` (không cộng 60).

**`POSTableOperationsTest.php`:** đọc và cập nhật tương tự các assert inventory_transactions.

**Lưu ý:** mỗi test cần hiểu rõ scenario hiện tại (đã hoàn thành/đã thanh toán?) để đặt expected stock đúng. Sau khi bỏ trừ bếp, stock chỉ đổi tại checkout (Task 4 chưa làm — các test này không qua checkout nên stock = giá trị tạo ban đầu).

- [ ] **Step 7: Chạy full suite pass**

Run: `php artisan test`
Expected: PASS (267+ test hiện có, không còn fail inventory_transactions).

- [ ] **Step 8: Pint + commit**

Run: `vendor/bin/pint app/Http/Controllers/Staff/KitchenController.php app/Http/Controllers/Staff/POSController.php app/Http/Controllers/Manager/IngredientController.php routes/web.php`

```bash
git add -A app/Services/InventoryIngredientService.php app/Models/InventoryTransaction.php app/Http/Controllers/Staff/KitchenController.php app/Http/Controllers/Staff/POSController.php app/Http/Controllers/Manager/IngredientController.php routes/web.php tests/Feature/KitchenFlowTest.php tests/Feature/KitchenServingIdempotencyTest.php tests/Feature/KitchenRaceTest.php tests/Feature/POSCancelRaceTest.php tests/Feature/POSTableOperationsTest.php tests/Feature/Hardening/SoftDeleteMenuInventoryTest.php
git commit -m "refactor: bo tru kho o bep + inventory_transactions (deduct/restore/importStock)"
```

---

## Task 3: Models + StockVoucherController + routes + permissions + page record

**Files:**
- Create: `app/Models/StockVoucher.php`, `app/Models/StockVoucherItem.php`
- Create: `app/Http/Controllers/Manager/StockVoucherController.php`
- Modify: `routes/web.php` — thêm 3 route vouchers
- Modify: `database/seeders/AuthorizationSeeder.php` — 2 permissions + 1 page record
- Modify: `app/Http/Controllers/Admin/RoleController.php` — 2 permissions vào allowed list
- Test: `tests/Feature/StockVoucherImportTest.php` (mới)

**Interfaces:**
- Consumes: schema Task 1 (stock_vouchers/stock_voucher_items), helpers `posAdmin`/`posStaff`/`posMenuItem`/`posTable`/`posOrder`.
- Produces: `StockVoucherController::index/store/show`, models, routes `GET/POST /manager/inventory/vouchers`, `GET /manager/inventory/vouchers/{id}`, permissions `inventory.vouchers.view/create`, page record.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/StockVoucherImportTest.php`:

```php
<?php

use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;

test('store tao phieu nhap nhieu nguyen lieu va cap nhat stock + WAC', function () {
    $admin = posAdmin();
    $ing1 = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 100, 'cost_price' => 10000]);
    $ing2 = Ingredient::create(['code' => 'duong', 'name' => 'Đường '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [
            ['ingredient_id' => $ing1->id, 'quantity' => 100, 'unit_price' => 20000],
            ['ingredient_id' => $ing2->id, 'quantity' => 50, 'unit_price' => 15000],
        ],
        'note' => 'Nhập đại lý',
    ])->assertRedirect();

    $voucher = StockVoucher::where('type', 'import')->first();
    expect($voucher)->not->toBeNull();
    expect($voucher->note)->toBe('Nhập đại lý');
    expect(str_starts_with($voucher->voucher_code, 'PN-'))->toBeTrue();
    expect($voucher->items()->count())->toBe(2);

    // WAC ing1: (100*10000 + 100*20000)/200 = 15000
    expect((float) $ing1->fresh()->stock_quantity)->toBe(200.0);
    expect((float) $ing1->fresh()->cost_price)->toBe(15000.0);
    // ing2: WAC = (0*0 + 50*15000)/50 = 15000
    expect((float) $ing2->fresh()->stock_quantity)->toBe(50.0);
    expect((float) $ing2->fresh()->cost_price)->toBe(15000.0);

    $item1 = StockVoucherItem::where('voucher_id', $voucher->id)->where('ingredient_id', $ing1->id)->first();
    expect((float) $item1->quantity)->toBe(100.0);
    expect((float) $item1->unit_price)->toBe(20000.0);
});

test('store tu choi khi items rong hoac quantity <= 0', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['code' => 'x', 'name' => 'NL '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [['ingredient_id' => $ing->id, 'quantity' => 0, 'unit_price' => 1000]],
    ])->assertSessionHasErrors('items.0.quantity');

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [],
    ])->assertSessionHasErrors('items');

    expect(StockVoucher::count())->toBe(0);
});

test('index tra ve danh sach phieu', function () {
    $admin = posAdmin();
    Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/vouchers', [
        'items' => [['ingredient_id' => Ingredient::first()->id, 'quantity' => 10, 'unit_price' => 5000]],
    ]);

    $this->actingAs($admin)->get('/manager/inventory/vouchers')->assertOk();
});
```

**Lưu ý:** permission test cần `posAdmin` (admin bypass permission). Route đã thêm middleware `permission:inventory.vouchers.create/view` — admin bypass.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\StockVoucherImportTest.php`
Expected: FAIL — route chưa tồn tại (404), model chưa có.

- [ ] **Step 3: Tạo 2 models**

`app/Models/StockVoucher.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockVoucher extends Model
{
    protected $fillable = [
        'voucher_code', 'type', 'employee_id', 'transacted_at', 'note', 'created_by',
    ];

    protected $casts = [
        'transacted_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(StockVoucherItem::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
```

`app/Models/StockVoucherItem.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockVoucherItem extends Model
{
    protected $fillable = [
        'voucher_id', 'ingredient_id', 'quantity', 'unit_price',
    ];

    protected $casts = [
        'quantity' => 'float',
        'unit_price' => 'float',
    ];

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(StockVoucher::class);
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }
}
```

- [ ] **Step 4: Tạo StockVoucherController**

`app/Http/Controllers/Manager/StockVoucherController.php`:

```php
<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\StockVoucher;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class StockVoucherController extends Controller
{
    public function index(Request $request): Response
    {
        $query = StockVoucher::with('employee', 'creator')->orderByDesc('transacted_at');

        if ($request->filled('type') && in_array($request->type, ['import', 'export'], true)) {
            $query->where('type', $request->type);
        }
        if ($request->filled('from')) {
            $query->where('transacted_at', '>=', $request->from.' 00:00:00');
        }
        if ($request->filled('to')) {
            $query->where('transacted_at', '<=', $request->to.' 23:59:59');
        }
        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('voucher_code', 'like', "%{$search}%")
                    ->orWhere('note', 'like', "%{$search}%");
            });
        }

        $vouchers = $query->get()->map(fn ($v) => [
            'id' => $v->id,
            'voucher_code' => $v->voucher_code,
            'type' => $v->type,
            'transacted_at' => $v->transacted_at?->format('d/m/Y H:i'),
            'note' => $v->note,
            'employee_name' => $v->employee?->full_name,
        ]);

        return Inertia::render('manager/inventory/vouchers/StockVouchersManager', [
            'vouchers' => $vouchers,
            'filters' => $request->only(['type', 'from', 'to', 'search']),
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'stock_quantity', 'min_stock_alert', 'cost_price']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.ingredient_id' => 'required|exists:ingredients,id',
            'items.*.quantity' => 'required|numeric|gt:0',
            'items.*.unit_price' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:255',
        ]);

        $employeeId = Employee::idForUser($request->user()?->id);
        $dateStr = now()->format('Ymd');
        $prefix = "PN-{$dateStr}-";

        DB::transaction(function () use ($validated, $employeeId, $request, $prefix) {
            $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
                ->lockForUpdate()
                ->pluck('voucher_code')
                ->map(fn ($code) => (int) substr($code, strlen($prefix)))
                ->max() ?? 0;
            $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

            $voucher = StockVoucher::create([
                'voucher_code' => $voucherCode,
                'type' => 'import',
                'employee_id' => $employeeId,
                'transacted_at' => now(),
                'note' => $validated['note'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            foreach ($validated['items'] as $item) {
                $ingredient = Ingredient::lockForUpdate()->findOrFail($item['ingredient_id']);
                $currentStock = (float) $ingredient->stock_quantity;
                $currentCost = (float) $ingredient->cost_price;
                $importQty = (float) $item['quantity'];
                $importPrice = (float) $item['unit_price'];

                $newStock = $currentStock + $importQty;
                $newAvgCost = $newStock > 0
                    ? (($currentStock * $currentCost) + ($importQty * $importPrice)) / $newStock
                    : $importPrice;

                $ingredient->update([
                    'stock_quantity' => $newStock,
                    'cost_price' => round($newAvgCost, 2),
                ]);

                $voucher->items()->create([
                    'ingredient_id' => $ingredient->id,
                    'quantity' => $importQty,
                    'unit_price' => $importPrice,
                ]);
            }
        });

        Cache::tags(['dashboard'])->flush();
        \App\Events\IngredientStockUpdated::dispatch(['source' => 'voucher_import']);

        return back()->with('success', 'Tạo phiếu nhập kho thành công!');
    }

    public function show(int $id): Response
    {
        $voucher = StockVoucher::with(['items.ingredient', 'employee', 'creator'])
            ->findOrFail($id);

        $pivotRows = $voucher->items->map(fn ($item) => [
            'ingredient_id' => $item->ingredient_id,
            'name' => $item->ingredient->name ?? 'Nguyên liệu',
            'unit' => $item->ingredient->unit ?? '',
            'code' => $item->ingredient->code,
            'quantity' => (float) $item->quantity,
            'unit_price' => $item->unit_price,
            'total' => (float) $item->quantity * (float) ($item->unit_price ?? 0),
        ]);

        return Inertia::render('manager/inventory/vouchers/StockVouchersManager', [
            'vouchers' => StockVoucher::with('employee')->orderByDesc('transacted_at')->get()->map(fn ($v) => [
                'id' => $v->id,
                'voucher_code' => $v->voucher_code,
                'type' => $v->type,
                'transacted_at' => $v->transacted_at?->format('d/m/Y H:i'),
                'note' => $v->note,
                'employee_name' => $v->employee?->full_name,
            ]),
            'filters' => [],
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'stock_quantity', 'min_stock_alert', 'cost_price']),
            'detail' => [
                'voucher' => [
                    'id' => $voucher->id,
                    'voucher_code' => $voucher->voucher_code,
                    'type' => $voucher->type,
                    'transacted_at' => $voucher->transacted_at?->format('d/m/Y H:i'),
                    'note' => $voucher->note,
                    'employee_name' => $voucher->employee?->full_name,
                ],
                'items' => $pivotRows,
            ],
        ]);
    }
}
```

**Lưu ý:** `show` trả về cùng trang với `detail` prop (Inertia partial reload). Nếu phức tạp, tách `detail` thành prop riêng — implementer chọn cách render đơn giản nhất cho frontend Task 6 nhận được.

- [ ] **Step 5: Thêm routes**

`routes/web.php` group `/manager` sau `:125` (sau route ingredients destroy):
```php
        // Stock Vouchers
        Route::get('/inventory/vouchers', [StockVoucherController::class, 'index'])->middleware('permission:inventory.vouchers.view');
        Route::post('/inventory/vouchers', [StockVoucherController::class, 'store'])->middleware('permission:inventory.vouchers.create');
        Route::get('/inventory/vouchers/{id}', [StockVoucherController::class, 'show'])->middleware('permission:inventory.vouchers.view');
```
Thêm import: `use App\Http\Controllers\Manager\StockVoucherController;` ở đầu `routes/web.php` (tìm chỗ import IngredientController).

- [ ] **Step 6: Thêm permissions + page record**

`database/seeders/AuthorizationSeeder.php`:
- Thêm vào mảng `$permissions` (`:193`): `'inventory.vouchers.view', 'inventory.vouchers.create'` (cạnh `ingredients.*`)
- Thêm vào mảng `$pages` (`:71-82`, sau "Định lượng món"):
```php
            [
                'name' => 'Phiếu kho',
                'route_path' => '/manager/inventory/vouchers',
                'group_name' => 'Quản lý',
                'sort_order' => 27,
            ],
```
(Các page sau đó có sort_order 27-28... cần kiểm tra và chỉnh sort_order không trùng — đọc bảng pages hiện tại quanh `:83-90` và shift các giá trị sau nếu trùng.)

`app/Http/Controllers/Admin/RoleController.php` — tìm mảng permission list cho role manager (quanh `:29`) thêm `'inventory.vouchers.view', 'inventory.vouchers.create'`.

- [ ] **Step 7: Chạy test pass**

Run: `php artisan test tests\Feature\StockVoucherImportTest.php`
Expected: PASS.

- [ ] **Step 8: Regression + commit**

Run: `php artisan test` — full suite PASS (Task 2 đã xanh, Task 3 không đụng flow cũ).

Run: `vendor/bin/pint app/Models/StockVoucher.php app/Models/StockVoucherItem.php app/Http/Controllers/Manager/StockVoucherController.php routes/web.php database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php`

```bash
git add app/Models/StockVoucher.php app/Models/StockVoucherItem.php app/Http/Controllers/Manager/StockVoucherController.php routes/web.php database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php tests/Feature/StockVoucherImportTest.php
git commit -m "feat: phieu nhap kho - StockVoucher model/controller/routes/permissions"
```

---

## Task 4: Phiếu xuất tự động tại checkout

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php` — thêm `createStockExportVoucher`
- Test: `tests/Feature/StockVoucherExportTest.php` (mới)

**Interfaces:**
- Consumes: `CheckoutService::runBulk(Collection $orders, array $paymentRows, array $promotionCodes, ?int $userId, ?string $tableName = null): Invoice`, schema stock_vouchers.
- Produces: sau mỗi `runBulk` tạo 1 phiếu export với items âm aggregate đúng + giảm stock.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/StockVoucherExportTest.php`:

```php
<?php

use App\Models\Ingredient;
use App\Models\ProductRecipe;
use App\Models\StockVoucher;

test('checkout tao phieu xuat tu dong voi luong am aggregate', function () {
    $admin = posAdmin();
    $coffee = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000, 'cost_price' => 10000]);
    $sugar = Ingredient::create(['code' => 'duong', 'name' => 'Đường '.uniqid(), 'unit' => 'g', 'stock_quantity' => 500, 'cost_price' => 5000]);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $coffee->id, 'amount' => 25, 'unit' => 'g']);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $sugar->id, 'amount' => 10, 'unit' => 'g']);

    // 2 order cùng bàn, mỗi order 2 ly cà phê → tổng 4 ly
    $table = posTable();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id, $order2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 400000,
    ])->assertOk()->assertJson(['success' => true]);

    $voucher = StockVoucher::where('type', 'export')->first();
    expect($voucher)->not->toBeNull();
    expect(str_starts_with($voucher->voucher_code, 'PX-'))->toBeTrue();
    expect($voucher->note)->toContain('Hoá đơn');

    // coffee: 4 ly × 25g = 100g → -100
    expect((float) $coffee->fresh()->stock_quantity)->toBe(900.0);
    // sugar: 4 ly × 10g = 40g → -40
    expect((float) $sugar->fresh()->stock_quantity)->toBe(460.0);

    $coffeeItem = $voucher->items()->where('ingredient_id', $coffee->id)->first();
    expect((float) $coffeeItem->quantity)->toBe(-100.0);
    expect($coffeeItem->unit_price)->toBeNull();
});

test('checkout khong tao phieu xuat khi don khong co recipe', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
    ])->assertOk();

    expect(StockVoucher::where('type', 'export')->count())->toBe(0);
});
```

**Lưu ý:** `bulk-checkout` route = `POST /staff/pos/bulk-checkout` (routes/web.php:168), checkout đơn = `/staff/pos/checkout` (`:167`). Cần `pos.create` permission → dùng `posAdmin()`. Kiểm tra response shape của bulk checkout (`success`).

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\StockVoucherExportTest.php`
Expected: FAIL — chưa có logic export.

- [ ] **Step 3: Thêm createStockExportVoucher vào CheckoutService**

`app/Services/Checkout/CheckoutService.php`:
- Thêm imports: `use App\Models\ProductRecipe;` (kiểm tra đã có chưa), `use App\Models\StockVoucher;`, `use App\Models\Employee;`, `use App\Models\Ingredient;` (kiểm tra import hiện có).
- Thêm method private static (cuối class):

```php
    private static function createStockExportVoucher(Collection $orders, ?int $userId): void
    {
        $employeeId = Employee::idForUser($userId);

        // Aggregate: menu_item_id → tổng quantity (chỉ items không cancelled)
        $menuQuantities = collect();
        foreach ($orders as $order) {
            $activeItems = $order->items()->where('status', '!=', 'cancelled')->get();
            foreach ($activeItems as $item) {
                $menuQuantities->put((int) $item->menu_item_id, (int) $menuQuantities->get((int) $item->menu_item_id, 0) + (int) $item->quantity);
            }
        }
        if ($menuQuantities->isEmpty()) {
            return;
        }

        // Recipes → ingredient total used
        $recipes = ProductRecipe::whereIn('menu_item_id', $menuQuantities->keys())->get();
        if ($recipes->isEmpty()) {
            return;
        }

        $ingredientTotals = [];
        foreach ($recipes as $recipe) {
            $used = (float) $recipe->amount * (int) $menuQuantities->get((int) $recipe->menu_item_id, 0);
            $ingredientTotals[(int) $recipe->ingredient_id] = ($ingredientTotals[(int) $recipe->ingredient_id] ?? 0) + $used;
        }
        if (empty($ingredientTotals)) {
            return;
        }

        $dateStr = now()->format('Ymd');
        $prefix = "PX-{$dateStr}-";
        $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
            ->lockForUpdate()
            ->pluck('voucher_code')
            ->map(fn ($code) => (int) substr($code, strlen($prefix)))
            ->max() ?? 0;
        $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

        $invoiceCodes = $orders->map(fn ($o) => $o->invoice?->invoice_code ?? $o->order_code)->unique()->implode(', ');

        $voucher = StockVoucher::create([
            'voucher_code' => $voucherCode,
            'type' => 'export',
            'employee_id' => $employeeId,
            'transacted_at' => now(),
            'note' => 'Xuất kho tự động cho hoá đơn '.$invoiceCodes,
            'created_by' => $userId,
        ]);

        foreach ($ingredientTotals as $ingredientId => $totalUsed) {
            $ingredient = Ingredient::lockForUpdate()->find($ingredientId);
            if (! $ingredient) {
                continue;
            }
            $ingredient->decrement('stock_quantity', $totalUsed);
            $voucher->items()->create([
                'ingredient_id' => $ingredientId,
                'quantity' => -$totalUsed,
                'unit_price' => null,
            ]);
        }
    }
```

- [ ] **Step 4: Gọi trong runBulk transaction**

Trong `runBulk`, trong `DB::transaction` closure, TRƯỚC `return $invoice;` (`:270`) thêm:
```php
            self::createStockExportVoucher($orders, $userId);
```
(`$orders` trong closure là `$orders->values()` — Collection. `$userId` có trong `use (...)`.)

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\StockVoucherExportTest.php`
Expected: PASS.

- [ ] **Step 6: Regression + commit**

Run: `php artisan test tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php tests\Feature\StockVoucherExportTest.php`
Run: `php artisan test` — full suite PASS.
Run: `vendor/bin/pint app/Services/Checkout/CheckoutService.php`

```bash
git add app/Services/Checkout/CheckoutService.php tests/Feature/StockVoucherExportTest.php
git commit -m "feat: phieu xuat tu dong tai checkout (aggregate ingredients qua recipe)"
```

---

## Task 5: Frontend — trang StockVouchersManager + modal nhập nhiều nguyên liệu

**Files:**
- Create: `resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx`
- Create: `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx` (mới — nhập nhiều nguyên liệu, thay cái cũ)
- Modify: `resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx`
- Modify: `resources/js/pages/manager/inventory/ingredients/components/IngredientFilterBar.tsx`
- Modify: `resources/js/pages/manager/inventory/ingredients/components/IngredientTable.tsx`
- Delete: `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx` (cũ — thay bằng file mới cùng tên)

**Interfaces:**
- Consumes: props từ `StockVoucherController::index/show` (`vouchers`, `filters`, `detail`), từ `IngredientController::index` (`ingredients`).
- Produces: trang phiếu + modal nhập nhiều nguyên liệu + nút nhập ở filterbar.

- [ ] **Step 1: Thay StockImportModal cũ bằng modal nhập nhiều nguyên liệu**

Ghi đè `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx` (cùng tên, thay cái cũ — xoá file cũ trước nếu Git không cho overwrite, hoặc ghi đè trực tiếp):

```tsx
import React, { useState } from 'react';
import { router } from '@inertiajs/react';
import { IngredientData } from './IngredientTable';

interface StockImportModalProps {
    ingredients: IngredientData[];
    isOpen: boolean;
    onClose: () => void;
}

interface ImportLine {
    ingredient_id: string;
    quantity: string;
    unit_price: string;
}

export default function StockImportModal({ ingredients, isOpen, onClose }: StockImportModalProps) {
    const [lines, setLines] = useState<ImportLine[]>([
        { ingredient_id: '', quantity: '', unit_price: '' },
    ]);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) return null;

    const updateLine = (idx: number, field: keyof ImportLine, value: string) => {
        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
    };

    const addLine = () => setLines((prev) => [...prev, { ingredient_id: '', quantity: '', unit_price: '' }]);
    const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

    const validLines = lines.filter((l) => l.ingredient_id && Number(l.quantity) > 0);
    const totalCost = validLines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price || 0), 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validLines.length === 0) {
            setErrorMsg('Cần ít nhất 1 dòng nguyên liệu hợp lệ');
            return;
        }
        setSubmitting(true);
        setErrorMsg(null);

        router.post(
            '/manager/inventory/vouchers',
            {
                items: validLines.map((l) => ({
                    ingredient_id: Number(l.ingredient_id),
                    quantity: Number(l.quantity),
                    unit_price: Number(l.unit_price || 0),
                })),
                note,
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    onClose();
                    setLines([{ ingredient_id: '', quantity: '', unit_price: '' }]);
                    setNote('');
                },
                onError: (errs: any) => {
                    setSubmitting(false);
                    setErrorMsg(Object.values(errs)[0] as string || 'Có lỗi xảy ra khi nhập kho.');
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto">
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Tạo phiếu nhập kho</h3>
                    <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        {lines.map((line, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <select
                                    value={line.ingredient_id}
                                    onChange={(e) => updateLine(idx, 'ingredient_id', e.target.value)}
                                    className="flex-1 px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Chọn nguyên liệu...</option>
                                    {ingredients.map((ing) => (
                                        <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    step="any"
                                    value={line.quantity}
                                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                                    placeholder="SL"
                                    className="w-24 px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="number"
                                    step="any"
                                    value={line.unit_price}
                                    onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                                    placeholder="Đơn giá"
                                    className="w-28 px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                                />
                                <button type="button" onClick={() => removeLine(idx)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={addLine}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            + Thêm dòng nguyên liệu
                        </button>
                    </div>

                    {totalCost > 0 && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Tổng giá trị phiếu: <strong className="text-emerald-600">{totalCost.toLocaleString('vi-VN')} đ</strong>
                        </p>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Ghi chú / Nhà cung cấp</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Ví dụ: Nhập đại lý VinMart..."
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}

                    <div className="flex justify-end space-x-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700">Hủy</button>
                        <button type="submit" disabled={submitting} className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                            {submitting ? 'Đang lưu...' : 'Xác nhận nhập kho'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Sửa IngredientsManager + IngredientFilterBar + IngredientTable**

`IngredientTable.tsx`:
- Bỏ prop `onImportStock` (`:18`) + nút "Nhập kho" (`:212-220`).
- Bỏ import `Plus` nếu không còn dùng.

`IngredientsManager.tsx`:
- Bỏ state `importIngredient` (`:33`), prop `onImportStock` khi render IngredientTable (`:250`), render `StockImportModal` cũ (`:262-265`).
- Thêm state `isImportOpen` (`useState(false)`).
- Render `StockImportModal` mới với props `{ ingredients, isOpen: isImportOpen, onClose: () => setIsImportOpen(false) }`.
- Truyền `onOpenImport={() => setIsImportOpen(true)}` xuống IngredientFilterBar.

`IngredientFilterBar.tsx`:
- Thêm prop `onOpenImport: () => void` vào interface (`:11`).
- Thêm nút "Nhập kho" cạnh nút "Thêm nguyên liệu" (`:74-84`), onClick `onOpenImport`.

- [ ] **Step 3: Tạo StockVouchersManager**

`resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx`:

```tsx
import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Box, ArrowDownToLine, ArrowUpFromLine, Plus } from 'lucide-react';
import DashboardLayout from '../../../../layouts/DashboardLayout';
import ManagerPageLayout from '../../../../components/ManagerPageLayout';
import StockImportModal from '../ingredients/components/StockImportModal';

interface VoucherData {
    id: number;
    voucher_code: string;
    type: 'import' | 'export';
    transacted_at: string;
    note: string | null;
    employee_name: string | null;
}

interface VoucherDetailItem {
    ingredient_id: number;
    name: string;
    unit: string;
    code: string | null;
    quantity: number;
    unit_price: number | null;
    total: number;
}

interface VoucherDetail {
    voucher: VoucherData;
    items: VoucherDetailItem[];
}

interface StockVouchersManagerProps {
    vouchers: VoucherData[];
    filters: { type?: string; from?: string; to?: string; search?: string };
    detail?: VoucherDetail | null;
    ingredients?: any[]; // optional, cho modal nhập từ trang này
}

export default function StockVouchersManager({ vouchers, filters, detail, ingredients = [] }: StockVouchersManagerProps) {
    const [typeFilter, setTypeFilter] = useState(filters.type || 'all');
    const [from, setFrom] = useState(filters.from || '');
    const [to, setTo] = useState(filters.to || '');
    const [search, setSearch] = useState(filters.search || '');
    const [isImportOpen, setIsImportOpen] = useState(false);

    const applyFilters = () => {
        router.get('/manager/inventory/vouchers', {
            type: typeFilter === 'all' ? '' : typeFilter,
            from: from || undefined,
            to: to || undefined,
            search: search || undefined,
        }, { preserveState: true });
    };

    return (
        <DashboardLayout fullWidth={true}>
            <Head title="Phiếu nhập / xuất kho" />
            <ManagerPageLayout
                sidebar={
                    <div>
                        <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 mb-1">
                            <Box className="w-5 h-5 stroke-[1.5]" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Phân hệ Quản lý Kho</span>
                        </div>
                        <h1 className="font-display text-xl font-normal text-zinc-900 dark:text-zinc-100 tracking-tight">Phiếu kho</h1>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Lịch sử nhập / xuất nguyên liệu</p>

                        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2 mt-4">
                            <button
                                type="button"
                                onClick={() => setIsImportOpen(true)}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Tạo phiếu nhập</span>
                            </button>

                            {/* Filters */}
                            <div className="space-y-2 pt-2">
                                <select
                                    value={typeFilter}
                                    onChange={(e) => { setTypeFilter(e.target.value); }}
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                                >
                                    <option value="all">Tất cả loại phiếu</option>
                                    <option value="import">Phiếu nhập</option>
                                    <option value="export">Phiếu xuất</option>
                                </select>
                                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700" />
                                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Tìm theo mã / ghi chú..."
                                    className="w-full px-3 py-2 text-xs border rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                                />
                                <button type="button" onClick={applyFilters} className="w-full px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl">Lọc</button>
                            </div>
                        </div>
                    </div>
                }
            >
                <div className="space-y-4">
                    {/* Detail (pivot bảng ngang) */}
                    {detail && (
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {detail.voucher.voucher_code}
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        detail.voucher.type === 'import' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {detail.voucher.type === 'import' ? 'Phiếu nhập' : 'Phiếu xuất'}
                                    </span>
                                </h3>
                                <span className="text-xs text-zinc-500">{detail.voucher.transacted_at}</span>
                            </div>
                            {/* Pivot: cột = nguyên liệu, 1 dòng giá trị */}
                            <div className="overflow-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-zinc-50 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400">
                                            <th className="px-3 py-2">Mã NVL</th>
                                            <th className="px-3 py-2">Nguyên liệu</th>
                                            <th className="px-3 py-2 text-right">Số lượng</th>
                                            <th className="px-3 py-2 text-right">Đơn giá</th>
                                            <th className="px-3 py-2 text-right">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.items.map((it) => (
                                            <tr key={it.ingredient_id} className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-3 py-2 font-mono text-xs">{it.code || `NVL${String(it.ingredient_id).padStart(5, '0')}`}</td>
                                                <td className="px-3 py-2">{it.name}</td>
                                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${it.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {it.quantity > 0 ? '+' : ''}{it.quantity.toLocaleString('vi-VN')} {it.unit}
                                                </td>
                                                <td className="px-3 py-2 text-right">{it.unit_price != null ? it.unit_price.toLocaleString('vi-VN') : '—'}</td>
                                                <td className="px-3 py-2 text-right">{it.total.toLocaleString('vi-VN')} đ</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* List */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-400 text-xs border-b border-zinc-200 dark:border-zinc-800">
                                <tr>
                                    <th className="px-4 py-3">Mã phiếu</th>
                                    <th className="px-4 py-3">Loại</th>
                                    <th className="px-4 py-3">Thời điểm</th>
                                    <th className="px-4 py-3">Ghi chú</th>
                                    <th className="px-4 py-3">Người tạo</th>
                                    <th className="px-4 py-3 text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {vouchers.length === 0 ? (
                                    <tr><td colSpan={6} className="py-12 px-6 text-center text-zinc-500">Chưa có phiếu nào</td></tr>
                                ) : vouchers.map((v) => (
                                    <tr key={v.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-pointer" onClick={() => router.get(`/manager/inventory/vouchers/${v.id}`, {}, { preserveState: true })}>
                                        <td className="px-4 py-3 font-mono text-xs font-medium text-sky-600 dark:text-sky-400">{v.voucher_code}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                v.type === 'import' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {v.type === 'import' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                                                {v.type === 'import' ? 'Nhập' : 'Xuất'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs">{v.transacted_at}</td>
                                        <td className="px-4 py-3 text-xs text-zinc-500">{v.note || '—'}</td>
                                        <td className="px-4 py-3 text-xs">{v.employee_name || '—'}</td>
                                        <td className="px-4 py-3 text-center text-xs text-blue-600">Xem chi tiết</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </ManagerPageLayout>

            <StockImportModal
                ingredients={ingredients}
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
            />
        </DashboardLayout>
    );
}
```

**Lưu ý:** `StockVouchersManager` dùng chung `StockImportModal` mới (nhập nhiều nguyên liệu) — nhưng modal cần `ingredients` list. `StockVoucherController::index` phải truyền `ingredients` cho trang này (thêm `'ingredients' => Ingredient::orderBy('name')->get(...)` vào props index). Bổ sung khi implement — đọc controller Task 3 để đồng bộ props.

- [ ] **Step 4: Typecheck + build**

Run: `npm run types:check`
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/manager/inventory/vouchers/StockVouchersManager.tsx resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx resources/js/pages/manager/inventory/ingredients/IngredientsManager.tsx resources/js/pages/manager/inventory/ingredients/components/IngredientFilterBar.tsx resources/js/pages/manager/inventory/ingredients/components/IngredientTable.tsx
git commit -m "feat: trang phieu kho + modal nhap nhieu nguyen lieu + nut nhap o filterbar"
```

---

## Task 6: Final verification + migrate:fresh MySQL thật

**Files:** không code — verify.

- [ ] **Step 1: Full suite**

Run: `php artisan test`
Expected: PASS toàn bộ.

- [ ] **Step 2: Pint toàn bộ**

Run: `vendor/bin/pint --dirty --test`
Expected: sạch.

- [ ] **Step 3: Frontend**

Run: `npm run types:check`
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Xoá DB + migrate lại trên MySQL local**

Run: `php artisan migrate:fresh` (MySQL HeThongTapHoa — xoá sạch, tạo 15 file)
Run: `php artisan db:seed`
Expected: migrate 15 file OK + seed OK.

- [ ] **Step 5: Smoke test**

- `php artisan route:list | Select-String "vouchers"` — 3 route hiện diện.
- Mở `/manager/inventory/vouchers` — trang phiếu render, sidebar có "Phiếu kho".
- Tạo phiếu nhập (modal nhiều nguyên liệu) → stock + WAC cập nhật.
- Tạo order POS có recipe → checkout → tự tạo phiếu xuất, stock giảm.
- Mở POS (`/staff/pos`) — không lỗi, max_servings đúng.

- [ ] **Step 6: Commit bất kỳ fix phát sinh**

Nếu smoke test phát hiện bug → fix + commit riêng. Nếu sạch → không commit.

---

## Final verification checklist

- [ ] `php artisan test` — toàn bộ pass
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `npm run types:check` + `npm run build` — pass
- [ ] `php artisan migrate:fresh && php artisan db:seed` trên MySQL — OK
- [ ] Smoke: trang phiếu + tạo phiếu nhập + checkout tạo phiếu xuất + POS không lỗi
- [ ] `git status` — tree sạch
