# Payment Core Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách tầng thanh toán (payments, invoice_lines, invoice_promotions) khỏi nghiệp vụ thanh toán nằm rải rác trong POSController, chuẩn 1 công thức total, hỗ trợ split payment, stack nhiều khuyến mãi, VAT-trong-giá.

**Architecture:** 2 tầng — nghiệp vụ (`orders`, `order_items`) chỉ vận hành; thanh toán (`invoices`, `invoice_lines`, `invoice_promotions`, `payments`) là nguồn sự thật tiền sau checkout. `CheckoutService` orchestrates trong 1 transaction; `PromotionEngine::resolveAll` stack N mã; `OrderTotals` giữ công thức VAT-trong-giá duy nhất. Báo cáo đọc từ tầng thanh toán. DB cũ giữ nguyên (song song), backfill tùy chọn.

**Tech Stack:** Laravel 11, Eloquent, Pest, Inertia/React (chỉ Task 9 đụng frontend).

**Spec:** `docs/superpowers/specs/2026-08-05-payment-core-restructure-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test --filter=...` như lệnh đơn.
- Mỗi task TDD: test RED → chạy fail → implement → run pass → commit riêng.
- VAT-trong-giá: `net = floor(subtotal / (1 + vat_rate/100)); vat = subtotal - net`. `menu_items.vat_rate` null → coi = 0. KHÔNG bao giờ cộng VAT vào tổng khách trả.
- Discount mã giảm luôn cap: `min(discount, subtotal_còn_lại)` → đơn về 0đ, không âm.
- `/staff/pos/validate-promotion` phải tương thích ngược: request cũ chỉ có `code` (string) vẫn hoạt động.
- `payments.method` enum: `cash`, `bank_transfer`, `e_wallet` (giống invoices.payment_method hiện có).
- KHÔNG tạo bảng coupons riêng — voucher = promotion `max_uses=1` + `fixed_amount`.
- KHÔNG xoá/sửa dữ liệu bảng cũ (orders, invoices, order_items, promotions).
- Thứ tự khóa trong transaction: `orders` → `payment promotions` → ghi bảng mới. Chỉ `lockForUpdate` orders như hiện tại.
- Helpers test có sẵn trong `tests/Pest.php`: `posTable`, `posMenuItem`, `posOrder`, `posStaff`, `posAdmin`. Dùng lại.
- Test chạy: `php artisan test tests\Feature\<file>.php`

---

## File Structure

**Tạo mới:**
- `database/migrations/2026_08_05_000001_create_payment_core_tables.php` — tạo `payments`, `invoice_lines`, `invoice_promotions`; thêm cột `invoices(subtotal_amount, vat_amount, discount_amount, external_no, external_ref)`, `deposits(payment_id)`
- `database/migrations/2026_08_05_000002_backfill_payment_core_tables.php` — backfill dữ liệu cũ (Task 10)
- `app/Models/Payment.php`, `app/Models/InvoiceLine.php`, `app/Models/InvoicePromotion.php`
- `app/Services/Checkout/OrderTotals.php` — công thức VAT-trong-giá + preview JIT từ order_items
- `app/Services/Promotions/PromotionEngine.php` — resolveAll stack mã
- `app/Services/Checkout/CheckoutService.php` — pipeline checkout
- `tests/Feature/Services/OrderTotalsTest.php`
- `tests/Feature/Services/PromotionEngineTest.php`
- `tests/Feature/Services/CheckoutServiceTest.php`

**Sửa:**
- `app/Models/Invoice.php` — fillable + relations mới
- `app/Models/Deposit.php` — fillable payment_id + relation
- `app/Models/Order.php` — relation invoices
- `app/Http/Controllers/Staff/POSController.php` — checkout/bulkCheckout/validatePromotion dùng services; gỡ ghi total trong sendToKitchen (Task 11)
- `app/Http/Controllers/Reports/ProductDetailsReportController.php`, `InvoiceItemsReportController.php`, `ProfitReportController.php`, `PaymentsReportController.php` — đọc từ invoice_lines/payments
- `resources/js/pages/staff/pos/components/PaymentDrawer.tsx` — hiển thị "Trong đó VAT"

---

## Task 1: Migration tạo bảng payment core

**Files:**
- Create: `database/migrations/2026_08_05_000001_create_payment_core_tables.php`
- Test: `tests/Feature/PaymentCoreSchemaTest.php` (test schema tồn tại)

**Interfaces:**
- Produces: bảng `payments`, `invoice_lines`, `invoice_promotions`; cột mới trên `invoices`, `deposits`.

- [ ] **Step 1: Viết test fail**

```php
<?php

use Illuminate\Support\Facades\Schema;

test('payment core tables ton tai voi cac cot chinh', function () {
    expect(Schema::hasTable('payments'))->toBeTrue();
    expect(Schema::hasColumns('payments', ['id', 'invoice_id', 'method', 'amount', 'reference', 'received_by', 'note', 'created_at', 'updated_at']))->toBeTrue();

    expect(Schema::hasTable('invoice_lines'))->toBeTrue();
    expect(Schema::hasColumns('invoice_lines', ['id', 'invoice_id', 'order_item_id', 'menu_item_id', 'name_snapshot', 'quantity', 'unit_price', 'subtotal', 'vat_rate', 'vat_amount', 'discount_amount', 'created_at', 'updated_at']))->toBeTrue();

    expect(Schema::hasTable('invoice_promotions'))->toBeTrue();
    expect(Schema::hasColumns('invoice_promotions', ['id', 'invoice_id', 'promotion_id', 'code', 'name', 'discount_type', 'discount_value', 'stack_order', 'amount', 'created_at', 'updated_at']))->toBeTrue();

    expect(Schema::hasColumns('invoices', ['subtotal_amount', 'vat_amount', 'discount_amount', 'external_no', 'external_ref']))->toBeTrue();
    expect(Schema::hasColumn('deposits', 'payment_id'))->toBeTrue();
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `php artisan test tests\Feature\PaymentCoreSchemaTest.php`
Expected: FAIL — bảng chưa tồn tại.

- [ ] **Step 3: Viết migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->enum('method', ['cash', 'bank_transfer', 'e_wallet']);
            $table->decimal('amount', 15, 2);
            $table->string('reference')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->timestamps();

            $table->index(['invoice_id'], 'idx_payments_invoice');
        });

        Schema::create('invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->unsignedBigInteger('order_item_id')->nullable();
            $table->unsignedBigInteger('menu_item_id')->nullable();
            $table->string('name_snapshot', 255);
            $table->integer('quantity');
            $table->decimal('unit_price', 15, 2);
            $table->decimal('subtotal', 15, 2);
            $table->decimal('vat_rate', 5, 2)->default(0);
            $table->decimal('vat_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->timestamps();

            $table->index(['invoice_id'], 'idx_invoice_lines_invoice');
            $table->index(['menu_item_id'], 'idx_invoice_lines_menu_item');
        });

        Schema::create('invoice_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->string('discount_type', 30);
            $table->decimal('discount_value', 15, 2);
            $table->unsignedSmallInteger('stack_order')->default(0);
            $table->decimal('amount', 15, 2)->default(0);
            $table->timestamps();

            $table->index(['invoice_id'], 'idx_invoice_promotions_invoice');
        });

        Schema::table('invoices', function (Blueprint $table) {
            $table->decimal('subtotal_amount', 15, 2)->default(0)->after('deposit_amount');
            $table->decimal('vat_amount', 15, 2)->default(0)->after('subtotal_amount');
            $table->decimal('discount_amount', 15, 2)->default(0)->after('vat_amount');
            $table->string('external_no')->nullable()->after('discount_amount');
            $table->string('external_ref')->nullable()->after('external_no');
        });

        Schema::table('deposits', function (Blueprint $table) {
            $table->foreignId('payment_id')->nullable()->after('resolved_at')->constrained('payments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('deposits', function (Blueprint $table) {
            $table->dropForeign(['payment_id']);
            $table->dropColumn('payment_id');
        });
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn(['subtotal_amount', 'vat_amount', 'discount_amount', 'external_no', 'external_ref']);
        });
        Schema::dropIfExists('invoice_promotions');
        Schema::dropIfExists('invoice_lines');
        Schema::dropIfExists('payments');
    }
};
```

- [ ] **Step 4: Chạy migration + test pass**

Run: `php artisan migrate; if ($?) { php artisan test tests\Feature\PaymentCoreSchemaTest.php }`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_08_05_000001_create_payment_core_tables.php tests/Feature/PaymentCoreSchemaTest.php
git commit -m "feat: tao bang payment core (payments, invoice_lines, invoice_promotions)"
```

---

## Task 2: Models Payment / InvoiceLine / InvoicePromotion + relations

**Files:**
- Create: `app/Models/Payment.php`, `app/Models/InvoiceLine.php`, `app/Models/InvoicePromotion.php`
- Modify: `app/Models/Invoice.php`, `app/Models/Deposit.php`
- Test: `tests/Feature/PaymentCoreModelsTest.php`

**Interfaces:**
- Consumes: Task 1 schema.
- Produces: `Invoice::payments()`, `Invoice::lines()`, `Invoice::promotions()`; `Deposit::payment()` — CheckoutService (Task 5) dùng.

- [ ] **Step 1: Viết test fail**

```php
<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePromotion;
use App\Models\Payment;

test('invoice co quan he payments lines promotions', function () {
    $this->actingAs(posAdmin());
    $invoice = Invoice::create([
        'invoice_code' => 'INVTEST1', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 100000, 'change_amount' => 0, 'total_amount' => 90000,
    ]);
    Payment::create(['invoice_id' => $invoice->id, 'method' => 'cash', 'amount' => 90000]);
    InvoiceLine::create(['invoice_id' => $invoice->id, 'name_snapshot' => 'Cf', 'quantity' => 2, 'unit_price' => 45000, 'subtotal' => 90000, 'vat_rate' => 10, 'vat_amount' => 8182, 'discount_amount' => 0]);
    InvoicePromotion::create(['invoice_id' => $invoice->id, 'code' => 'CK', 'name' => 'KM', 'discount_type' => 'percentage', 'discount_value' => 10, 'stack_order' => 0, 'amount' => 9000]);

    $invoice->refresh();
    expect($invoice->payments)->toHaveCount(1);
    expect($invoice->lines)->toHaveCount(1);
    expect($invoice->promotions)->toHaveCount(1);
    expect($invoice->payments->first()->amount)->toBe(90000.0);
});

test('deposit link toi payment khi applied', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $order = posOrder($table, [['item' => posMenuItem(), 'qty' => 1, 'price' => 50000]]);
    $invoice = Invoice::create([
        'invoice_code' => 'INVTEST2', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 0, 'change_amount' => 0, 'total_amount' => 50000,
    ]);
    $payment = Payment::create(['invoice_id' => $invoice->id, 'method' => 'cash', 'amount' => 50000]);
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 20000, 'method' => 'cash', 'status' => 'applied', 'payment_id' => $payment->id]);

    expect($deposit->payment->id)->toBe($payment->id);
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\PaymentCoreModelsTest.php`
Expected: FAIL — class chưa tồn tại.

- [ ] **Step 3: Tạo 3 model mới**

`app/Models/Payment.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    protected $fillable = ['invoice_id', 'method', 'amount', 'reference', 'received_by', 'note'];

    protected $casts = ['amount' => 'float'];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
```

`app/Models/InvoiceLine.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoiceLine extends Model
{
    protected $fillable = [
        'invoice_id', 'order_item_id', 'menu_item_id', 'name_snapshot',
        'quantity', 'unit_price', 'subtotal', 'vat_rate', 'vat_amount', 'discount_amount',
    ];

    protected $casts = [
        'quantity' => 'int',
        'unit_price' => 'float',
        'subtotal' => 'float',
        'vat_rate' => 'float',
        'vat_amount' => 'float',
        'discount_amount' => 'float',
    ];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }
}
```

`app/Models/InvoicePromotion.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoicePromotion extends Model
{
    protected $table = 'invoice_promotions';

    protected $fillable = [
        'invoice_id', 'promotion_id', 'code', 'name', 'discount_type',
        'discount_value', 'stack_order', 'amount',
    ];

    protected $casts = [
        'discount_value' => 'float',
        'stack_order' => 'int',
        'amount' => 'float',
    ];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function promotion()
    {
        return $this->belongsTo(Promotion::class);
    }
}
```

- [ ] **Step 4: Sửa Invoice (fillable + relations) và Deposit**

`app/Models/Invoice.php` — thêm fillable và relations:
```php
    protected $fillable = [
        'invoice_code',
        'table_name',
        'payment_method',
        'amount_received',
        'change_amount',
        'total_amount',
        'deposit_amount',
        'subtotal_amount',
        'vat_amount',
        'discount_amount',
        'external_no',
        'external_ref',
        'issued_at',
    ];

    protected $casts = [
        'amount_received' => 'decimal:2',
        'change_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'subtotal_amount' => 'decimal:2',
        'vat_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'issued_at' => 'datetime',
    ];
```
Thêm methods:
```php
    public function payments()
    {
        return $this->hasMany(Payment::class, 'invoice_id');
    }

    public function lines()
    {
        return $this->hasMany(InvoiceLine::class, 'invoice_id');
    }

    public function promotions()
    {
        return $this->hasMany(InvoicePromotion::class, 'invoice_id');
    }
```

`app/Models/Deposit.php` — thêm `payment_id` vào fillable + relation:
```php
    // thêm 'payment_id' vào $fillable
    public function payment()
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }
```

- [ ] **Step 5: Chạy test pass**

Run: `php artisan test tests\Feature\PaymentCoreModelsTest.php`
Expected: PASS (2 tests).

- [ ] **Step 6: Chạy regression toàn bộ**

Run: `php artisan test`
Expected: tất cả pass (không phá hiện tại).

- [ ] **Step 7: Commit**

```bash
git add app/Models/Payment.php app/Models/InvoiceLine.php app/Models/InvoicePromotion.php app/Models/Invoice.php app/Models/Deposit.php tests/Feature/PaymentCoreModelsTest.php
git commit -m "feat: model payment core + relations Invoice/Deposit"
```

---

## Task 3: OrderTotals — công thức VAT-trong-giá + preview JIT

**Files:**
- Create: `app/Services/Checkout/OrderTotals.php`
- Test: `tests/Feature/Services/OrderTotalsTest.php`

**Interfaces:**
- Consumes: `Order::items`, `OrderItem`, `MenuItem.vat_rate`.
- Produces:
  - `OrderTotals::vatInPrice(float $subtotal, float $rate): float` — VAT nằm trong giá.
  - `OrderTotals::netOf(float $subtotal, float $rate): float` — phần giá trước thuế.
  - `OrderTotals::preview($items): array` — `items` là Collection các dòng eloquent `order_items` (hoặc mảng `['subtotal','menuItem.vat_rate']`); trả `['subtotal' => float, 'vat_amount' => float]`. CheckoutService (Task 5) dùng.

- [ ] **Step 1: Viết test fail**

```php
<?php

use App\Services\Checkout\OrderTotals;

test('vatInPrice tinh phan vat chua trong gia, net + vat = subtotal', function (float $subtotal, float $rate, float $expectNet, float $expectVat) {
    $net = OrderTotals::netOf($subtotal, $rate);
    $vat = OrderTotals::vatInPrice($subtotal, $rate);
    expect($net)->toBe($expectNet);
    expect($vat)->toBe($expectVat);
    expect($net + $vat)->toBe($subtotal);
})->with([
    [50000.0, 10.0, 45454.0, 4546.0],
    [100000.0, 0.0, 100000.0, 0.0],
    [33000.0, 8.0, 30555.0, 2445.0],
]);

test('preview gom subtotal va vat tu items', function () {
    $category = \App\Models\MenuCategory::firstOrCreate(['name' => 'Cat T'], ['sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $category->id, 'price' => 50000, 'vat_rate' => 10]);
    $itemB = posMenuItem(['category_id' => $category->id, 'price' => 33000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [
        ['item' => $itemA, 'qty' => 2, 'price' => 50000],
        ['item' => $itemB, 'qty' => 1, 'price' => 33000],
    ]);

    $p = OrderTotals::preview($order->items()->where('status', '!=', 'cancelled')->get());
    expect($p['subtotal'])->toBe(133000.0);
    // vat chi tu itemA: 2 * 50000, net=floor(100000/1.1)=90909, vat=9091
    expect($p['vat_amount'])->toBe(9091.0);
});

test('preview bo qua mon da huy', function () {
    $itemA = posMenuItem(['price' => 50000, 'vat_rate' => 10]);
    $order = posOrder(posTable(), [
        ['item' => $itemA, 'qty' => 1, 'price' => 50000],
        ['item' => $itemA, 'qty' => 3, 'price' => 50000, 'status' => 'cancelled'],
    ]);
    $p = OrderTotals::preview($order->items()->where('status', '!=', 'cancelled')->get());
    expect($p['subtotal'])->toBe(50000.0);
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Services\OrderTotalsTest.php`
Expected: FAIL — class chưa có.

- [ ] **Step 3: Implement**

```php
<?php

namespace App\Services\Checkout;

class OrderTotals
{
    /** VAT nằm trong giá: net = floor(subtotal/(1+rate/100)); trả phần VAT. */
    public static function vatInPrice(float $subtotal, float $rate): float
    {
        return $subtotal - static::netOf($subtotal, $rate);
    }

    /** Phần giá trước thuế (net), floor để chẵn đồng. */
    public static function netOf(float $subtotal, float $rate): float
    {
        if ($rate <= 0) {
            return $subtotal;
        }
        return (float) floor($subtotal / (1 + $rate / 100));
    }

    /**
     * Gom preview từ danh sách order_items (đã lọc status != 'cancelled').
     * Mỗi item dùng $item->subtotal và $item->menuItem?->vat_rate.
     * @param  iterable<object>  $items
     * @return array{subtotal: float, vat_amount: float}
     */
    public static function preview(iterable $items): array
    {
        $subtotal = 0.0;
        $vat = 0.0;
        foreach ($items as $item) {
            $line = (float) $item->subtotal;
            $rate = (float) ($item->menuItem->vat_rate ?? 0);
            $subtotal += $line;
            $vat += static::vatInPrice($line, $rate);
        }
        return ['subtotal' => $subtotal, 'vat_amount' => $vat];
    }
}
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\Services\OrderTotalsTest.php`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Checkout/OrderTotals.php tests/Feature/Services/OrderTotalsTest.php
git commit -m "feat: OrderTotals - cong thuc VAT trong gia duy nhat"
```

---

## Task 4: PromotionEngine — resolveAll stack nhiều mã

**Files:**
- Create: `app/Services/Promotions/PromotionEngine.php`
- Modify: `app/Http/Controllers/Staff/POSController.php` — `resolvePromotion`/`discountFor` đổi thành delegate sang engine (giữ private methods làm wrapper để không phá test hiện có)
- Test: `tests/Feature/Services/PromotionEngineTest.php`

**Interfaces:**
- Consumes: `Promotion` model + `Promotion::allocateLineDiscounts`, `Promotion::eligibleLines`, `Promotion::targetSubtotal` (đã có).
- Produces:
  - `PromotionEngine::resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array`
  - Trả: `['status' => 'ok', 'promotions' => [ ['promotion' => Promotion, 'amount' => float, 'stack_order' => int], ... ], 'total_discount' => float]`
  - hoặc `['status' => 'rejected', 'reason' => string, 'code' => string]` — KHÔNG phá stack (chỉ báo mã đầu tiên reject).
  - `lines` là collection các dòng `['order_item_id'=>,?int,'menu_item_id'=>?int,'subtotal'=>float,'category_id'=>?int]` (đúng shape `orderLines` hiện tại — validate-promotion truyền order_item_id=null).
  - Stacking: mã chạy tuần tự (thứ tự trong mảng = stack_order); `targetSubtotal` của mã sau tính trên subtotal các dòng eligible **trừ** discount đã phân bổ vào các dòng đó từ các mã trước. Kiểm tra điều kiện (active, hạn, lượt, min_order_amount, no_eligible_line) trên subtotal GỐC `$subtotal` như hiện tại.

- [ ] **Step 1: Viết test fail**

```php
<?php

use App\Models\Promotion;
use App\Services\Promotions\PromotionEngine;

function engineLines(float $subtotal = 100000): \Illuminate\Support\Collection
{
    return collect([['order_item_id' => null, 'menu_item_id' => null, 'subtotal' => $subtotal, 'category_id' => null]]);
}

test('resolveAll stack 2 ma: ma sau tinh tren phan con lai', function () {
    $p1 = Promotion::create(['code' => 'STK1'.substr(uniqid(),-4), 'name' => '10%', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true]);
    $p2 = Promotion::create(['code' => 'STK2'.substr(uniqid(),-4), 'name' => '20k', 'discount_type' => 'fixed_amount', 'discount_value' => 20000, 'is_active' => true]);

    $r = PromotionEngine::resolveAll([$p1->code, $p2->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toHaveCount(2);
    // mã 1: 100k * 10% = 10k → còn 90k; mã 2: min(20k, 90k) = 20k
    expect($r['promotions'][0]['amount'])->toBe(10000.0);
    expect($r['promotions'][1]['amount'])->toBe(20000.0);
    expect($r['total_discount'])->toBe(30000.0);
});

test('resolveAll cap tong discount khong vuot subtotal', function () {
    $p1 = Promotion::create(['code' => 'STK3'.substr(uniqid(),-4), 'name' => '90%', 'discount_type' => 'percentage', 'discount_value' => 90, 'is_active' => true]);
    $p2 = Promotion::create(['code' => 'STK4'.substr(uniqid(),-4), 'name' => '50k', 'discount_type' => 'fixed_amount', 'discount_value' => 50000, 'is_active' => true]);

    $r = PromotionEngine::resolveAll([$p1->code, $p2->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(100000.0); // 90k + min(50k,10k)=10k
});

test('resolveAll ma reject tra rejected, khong pha stack', function () {
    $p1 = Promotion::create(['code' => 'STK5'.substr(uniqid(),-4), 'name' => 'x', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true, 'max_uses' => 1, 'used_count' => 1]);

    $r = PromotionEngine::resolveAll([$p1->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('out_of_uses');
    expect($r['code'])->toBe($p1->code);
});

test('resolveAll ma khong ton tai', function () {
    $r = PromotionEngine::resolveAll(['NOEXIST'.substr(uniqid(),-4)], engineLines(), 100000);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('not_found');
});

test('resolveAll 1 ma dung (compat voi prom single)', function () {
    $p = Promotion::create(['code' => 'STK6'.substr(uniqid(),-4), 'name' => '10%', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true]);
    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(10000.0);
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Services\PromotionEngineTest.php`
Expected: FAIL.

- [ ] **Step 3: Implement engine**

```php
<?php

namespace App\Services\Promotions;

use App\Models\Promotion;
use Illuminate\Support\Collection;

class PromotionEngine
{
    /**
     * Resolve 1 hoặc nhiều mã khuyến mãi theo thứ tự stack.
     * @param  array<string>  $codes
     * @param  iterable<array{order_item_id:?int,menu_item_id:?int,subtotal:float,category_id:?int}>  $lines
     * @return array{status:string, promotions?:array<int,array{promotion:Promotion,amount:float,stack_order:int}>, total_discount?:float, reason?:string, code?:string}
     */
    public static function resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array
    {
        $base = collect($lines)->values();
        $resolved = [];
        $allocated = [];        // order_item_id => discount dã phan bo tu cac ma truoc
        $totalDiscount = 0.0;

        foreach (array_values($codes) as $i => $code) {
            $promotion = static::findByCode($code, $lockForUpdate);
            if (! $promotion) {
                return ['status' => 'rejected', 'reason' => 'not_found', 'code' => $code];
            }

            $reject = static::validateAgainst($promotion, $subtotal);
            if ($reject !== null) {
                return ['status' => 'rejected', 'reason' => $reject, 'code' => $code];
            }

            // subtotal effective per-line: subtotal - discount da phan bo
            $effective = $base->map(function ($l) use ($allocated) {
                $id = $l['order_item_id'] ?? null;
                $l['subtotal'] = max(0.0, (float) $l['subtotal'] - (float) ($allocated[$id] ?? 0.0));
                return $l;
            });

            $targetSubtotal = Promotion::targetSubtotal($promotion, $effective);
            if ($targetSubtotal <= 0) {
                return ['status' => 'rejected', 'reason' => 'no_eligible_line', 'code' => $code];
            }

            $remaining = max(0.0, $subtotal - $totalDiscount);
            $amount = min(static::discountFor($promotion, $targetSubtotal), $remaining);

            // Phân bổ xuống dòng để mã sau tính trên phần còn lại
            $alloc = Promotion::allocateLineDiscounts($promotion, $effective, $amount);
            foreach ($alloc as $lineId => $disc) {
                $allocated[$lineId] = (float) ($allocated[$lineId] ?? 0.0) + (float) $disc;
            }

            $resolved[] = [
                'promotion' => $promotion,
                'amount' => (float) $amount,
                'stack_order' => $i,
            ];
            $totalDiscount += (float) $amount;
        }

        return [
            'status' => 'ok',
            'promotions' => $resolved,
            'total_discount' => (float) $totalDiscount,
        ];
    }

    public static function findByCode(string $code, bool $lockForUpdate = false): ?Promotion
    {
        $query = Promotion::query()->whereRaw('UPPER(code) = ?', [mb_strtoupper(trim($code))]);
        if ($lockForUpdate) {
            $query->lockForUpdate();
        }
        return $query->first();
    }

    private static function validateAgainst(Promotion $promotion, float $orderSubtotal): ?string
    {
        if (! $promotion->is_active) {
            return 'inactive';
        }
        $now = now();
        if ($promotion->starts_at && $now->lt($promotion->starts_at)) {
            return 'not_started';
        }
        if ($promotion->expires_at && $now->gt($promotion->expires_at)) {
            return 'expired';
        }
        if ($promotion->max_uses !== null && $promotion->used_count >= $promotion->max_uses) {
            return 'out_of_uses';
        }
        if ($promotion->min_order_amount !== null && $orderSubtotal < (float) $promotion->min_order_amount) {
            return 'below_min';
        }
        return null;
    }

    /** Giống discountFor hiện tại: cap max_discount_amount rồi cap subtotal. */
    public static function discountFor(Promotion $promotion, float $subtotal): float
    {
        $discount = $promotion->discount_type === 'percentage'
            ? $subtotal * ((float) $promotion->discount_value / 100)
            : (float) $promotion->discount_value;

        if ($promotion->max_discount_amount !== null) {
            $discount = min($discount, (float) $promotion->max_discount_amount);
        }

        return round(max(0, min($discount, $subtotal)), 2);
    }
}
```

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\Services\PromotionEngineTest.php`
Expected: PASS (5 tests).

- [ ] **Step 5: Sửa POSController delegate (giữ compat)**

Trong `app/Http/Controllers/Staff/POSController.php`, thay nội dung `resolvePromotion` + `discountFor` bằng delegate (giữ nguyên signature private, test cũ không đổi):

```php
    private function resolvePromotion(?string $code, $lines, float $orderSubtotal, bool $lockForUpdate = false): ?array
    {
        if (! $code) {
            return null;
        }
        $r = \App\Services\Promotions\PromotionEngine::resolveAll([$code], $lines, $orderSubtotal, $lockForUpdate);
        if ($r['status'] === 'rejected') {
            return ['status' => 'rejected', 'reason' => $r['reason']];
        }
        return [
            'status' => 'ok',
            'promotion' => $r['promotions'][0]['promotion'],
            'discount_amount' => $r['promotions'][0]['amount'],
        ];
    }

    private function discountFor(\App\Models\Promotion $promotion, float $subtotal): float
    {
        return \App\Services\Promotions\PromotionEngine::discountFor($promotion, $subtotal);
    }
```

Lưu ý: logic `resolvePromotion` hiện tại có fallback `targetSubtotal <= 0 → no_eligible_line`. Engine đã xử lý. Giữ `?array` return.

- [ ] **Step 6: Chạy regression promotion tests**

Run: `php artisan test tests\Feature\POSPromotionRejectReasonTest.php tests\Feature\POSPromotionRejectMessagesTest.php tests\Feature\PromotionApplyTest.php tests\Feature\PromotionAllocationTest.php tests\Feature\PromotionDepositCheckoutTest.php tests\Feature\PromotionTest.php`
Expected: tất cả PASS (không phá hiện tại).

- [ ] **Step 7: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php app/Http/Controllers/Staff/POSController.php tests/Feature/Services/PromotionEngineTest.php
git commit -m "feat: PromotionEngine stack nhieu ma, POSController delegate"
```

---

## Task 5: CheckoutService — pipeline checkout 1 transaction

**Files:**
- Create: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/Services/CheckoutServiceTest.php`

**Interfaces:**
- Consumes: Task 2 (`Invoice::lines/payments/promotions`, `Deposit::payment`), Task 3 (`OrderTotals::preview/vatInPrice`), Task 4 (`PromotionEngine::resolveAll`), models `Invoice`, `Payment`, `InvoiceLine`, `InvoicePromotion`, `Deposit`, `Order`.
- Produces:
  - `CheckoutService::run(Order $order, array $paymentRows, array $promotionCodes, int $userId): Invoice` (single order)
  - `CheckoutService::runBulk(iterable $orders, array $paymentRows, array $promotionCodes, int $userId, ?string $tableName = null): Invoice` (bulk)
  - `paymentRows`: `array<int,array{method:string,amount:float,reference?:?string,note?:?string}>`.
  - `promotionCodes`: `array<string>` (có thể rỗng).
  - Trong transaction: dựng `invoice_lines` từ order_items active (snapshot name/vat), resolve promotions, tính total, ghi invoice + payments + invoice_promotions + deposit applied + cập nhật orders.

- [ ] **Step 1: Viết test fail (single order, VAT + 1 mã + cọc)**

```php
<?php

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\Promotion;
use App\Services\Checkout\CheckoutService;

test('checkout 1 don: invoice + payments + lines + promotion snapshot, dung VAT trong gia', function () {
    $this->actingAs(posAdmin());
    $cat = \App\Models\MenuCategory::firstOrCreate(['name' => 'Cat CS', ['sort_order' => 1]]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'name' => 'Cf den', 'price' => 50000, 'vat_rate' => 10]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'name' => 'Tra', 'price' => 20000, 'vat_rate' => 0]);
    $promo = Promotion::create(['code' => 'CS10', 'name' => '10%', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true]);

    $table = posTable(['table_number' => 'B50']);
    $order = posOrder($table, [
        ['item' => $itemA, 'qty' => 2, 'price' => 50000, 'status' => 'completed'],
        ['item' => $itemB, 'qty' => 1, 'price' => 20000, 'status' => 'completed'],
    ], ['status' => 'completed']);

    $invoice = CheckoutService::run(
        $order,
        [['method' => 'cash', 'amount' => 108000]],
        [$promo->code],
        auth()->id()
    );

    // subtotal = 120000; discount = 12000; total = 108000
    expect((float) $invoice->subtotal_amount)->toBe(120000.0);
    expect((float) $invoice->discount_amount)->toBe(12000.0);
    expect((float) $invoice->total_amount)->toBe(108000.0);

    // VAT trong gia: itemA 2*50000=100000, net=floor(100000/1.1)=90909, vat=9091
    expect((float) $invoice->vat_amount)->toBe(9091.0);

    // lines
    expect($invoice->fresh()->lines)->toHaveCount(2);
    $lineA = $invoice->lines->firstWhere('menu_item_id', $itemA->id);
    expect($lineA->name_snapshot)->toBe('Cf den');
    expect((float) $lineA->subtotal)->toBe(100000.0);
    expect((float) $lineA->vat_amount)->toBe(9091.0);

    // payments
    expect($invoice->payments)->toHaveCount(1);
    expect((float) $invoice->payments->first()->amount)->toBe(108000.0);

    // promotion snapshot
    expect($invoice->promotions)->toHaveCount(1);
    expect($invoice->promotions->first()->code)->toBe('CS10');
    expect((float) $invoice->promotions->first()->amount)->toBe(12000.0);

    // order updated
    expect($order->fresh()->status)->toBe('paid');
    expect((float) $order->fresh()->total)->toBe(108000.0);
});

test('checkout split payment nhieu phuong thuc', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);

    $invoice = CheckoutService::run(
        $order,
        [['method' => 'cash', 'amount' => 50000], ['method' => 'bank_transfer', 'amount' => 50000, 'reference' => 'FT12345']],
        [],
        auth()->id()
    );

    expect($invoice->payments)->toHaveCount(2);
    expect($invoice->payment_method)->toBe('mixed');
    expect((float) $invoice->total_amount)->toBe(100000.0);
});

test('checkout ap coc: deposit applied va link payment', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);
    $deposit = Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    // payable = 100k - 30k coc = 70k → chi can thu 70k
    $invoice = CheckoutService::run(
        $order,
        [['method' => 'cash', 'amount' => 70000]],
        [],
        auth()->id()
    );

    expect($deposit->fresh()->status)->toBe('applied');
    expect($invoice->payments()->where('method', 'cash')->count())->toBe(2); // coc 30k + thanh toan 70k
    $depositPayment = $invoice->payments->firstWhere('amount', 30000.0);
    expect($depositPayment)->not->toBeNull();
    expect($deposit->fresh()->payment_id)->toBe($depositPayment->id);
});

test('checkout rollback khi promotion khong con hop le', function () {
    $this->actingAs(posAdmin());
    $promo = Promotion::create(['code' => 'EXP', 'name' => 'x', 'discount_type' => 'fixed_amount', 'discount_value' => 10000, 'expires_at' => now()->subDay(), 'is_active' => true]);
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);

    try {
        CheckoutService::run($order, [['method' => 'cash', 'amount' => 90000]], [$promo->code], auth()->id());
        $this->fail('Phai nem exception');
    } catch (\Exception $e) {
        expect(Invoice::count())->toBe(0);
        expect($order->fresh()->status)->toBe('completed');
    }
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\Services\CheckoutServiceTest.php`
Expected: FAIL.

- [ ] **Step 3: Implement CheckoutService**

```php
<?php

namespace App\Services\Checkout;

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePromotion;
use App\Models\Order;
use App\Models\Payment;
use App\Services\OrderActivityLogger;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Facades\DB;

class CheckoutService
{
    /**
     * Thanh toán 1 đơn.
     * @param  array<int,array{method:string,amount:float,reference?:?string,note?:?string}>  $paymentRows
     * @param  array<string>  $promotionCodes
     */
    public static function run(Order $order, array $paymentRows, array $promotionCodes, ?int $userId): Invoice
    {
        return static::runBulk(collect([$order]), $paymentRows, $promotionCodes, $userId, null);
    }

    /**
     * Thanh toán nhiều đơn trong 1 invoice (bulk).
     * @param  \Illuminate\Support\Collection<int,Order>  $orders
     * @param  array<int,array{method:string,amount:float,reference?:?string,note?:?string}>  $paymentRows
     * @param  array<string>  $promotionCodes
     */
    public static function runBulk(\Illuminate\Support\Collection $orders, array $paymentRows, array $promotionCodes, ?int $userId, ?string $tableName = null): Invoice
    {
        return DB::transaction(function () use ($orders, $paymentRows, $promotionCodes, $userId, $tableName) {
            $orders = $orders->values();

            // 1. Build lines từ tất cả orders
            $lineInputs = [];
            $subtotal = 0.0;
            $vatTotal = 0.0;
            foreach ($orders as $order) {
                $activeItems = $order->items()->where('status', '!=', 'cancelled')->with('menuItem')->get();
                foreach ($activeItems as $item) {
                    $lineSubtotal = (float) $item->subtotal;
                    $rate = (float) ($item->menuItem?->vat_rate ?? 0);
                    $lineVat = OrderTotals::vatInPrice($lineSubtotal, $rate);
                    $subtotal += $lineSubtotal;
                    $vatTotal += $lineVat;
                    $lineInputs[] = [
                        'order_id' => $order->id,
                        'order_item_id' => $item->id,
                        'menu_item_id' => $item->menu_item_id,
                        'name_snapshot' => $item->menuItem?->name ?? 'Món',
                        'quantity' => (int) $item->quantity,
                        'unit_price' => (float) $item->unit_price,
                        'subtotal' => $lineSubtotal,
                        'vat_rate' => $rate,
                        'vat_amount' => $lineVat,
                        'category_id' => $item->menuItem?->category_id,
                        'discount_amount' => 0.0,
                    ];
                }
            }

            // 2. Resolve promotions (engine) trên lines shape engine
            $engineLines = collect($lineInputs)->map(fn ($l) => [
                'order_item_id' => $l['order_item_id'],
                'menu_item_id' => $l['menu_item_id'],
                'subtotal' => $l['subtotal'],
                'category_id' => $l['category_id'],
            ]);

            $promotionRows = [];
            $totalDiscount = 0.0;
            if (! empty($promotionCodes)) {
                $resolved = PromotionEngine::resolveAll($promotionCodes, $engineLines, $subtotal, true);
                if ($resolved['status'] === 'rejected') {
                    throw new \Exception('Mã khuyến mãi '.$resolved['code'].' không hợp lệ hoặc đã hết hạn.', 422);
                }
                $totalDiscount = $resolved['total_discount'];
                foreach ($resolved['promotions'] as $pr) {
                    $p = $pr['promotion'];
                    $promotionRows[] = [
                        'promotion_id' => $p->id,
                        'code' => $p->code,
                        'name' => $p->name,
                        'discount_type' => $p->discount_type,
                        'discount_value' => (float) $p->discount_value,
                        'stack_order' => $pr['stack_order'],
                        'amount' => $pr['amount'],
                    ];
                }

                // Phân bổ tổng discount xuống lines theo tỷ trọng subtotal
                if ($totalDiscount > 0 && $subtotal > 0) {
                    $assigned = 0.0;
                    $count = count($lineInputs);
                    foreach ($lineInputs as $idx => $li) {
                        $d = ($idx === $count - 1)
                            ? round($totalDiscount - $assigned, 2)
                            : floor($totalDiscount * $li['subtotal'] / $subtotal);
                        $lineInputs[$idx]['discount_amount'] = round(max(0, min($d, $li['subtotal'])), 2);
                        $assigned += $lineInputs[$idx]['discount_amount'];
                    }
                }
            }

            $total = max(0.0, $subtotal - $totalDiscount);

            // 3. Tính cọc và kiểm tra tiền nhận
            $depositTotal = 0.0;
            $heldDeposits = [];
            foreach ($orders as $order) {
                $held = $order->deposits()->where('status', 'held')->get();
                foreach ($held as $d) {
                    $heldDeposits[] = $d;
                    $depositTotal += (float) $d->amount;
                }
            }

            $payable = max(0.0, $total - $depositTotal);
            $totalReceived = (float) collect($paymentRows)->sum('amount');
            if ($totalReceived < $payable) {
                throw new \Exception('Số tiền khách đưa không đủ.', 422);
            }

            // 4. Tạo invoice
            $invoiceCode = 'INV-'.date('Ymd').strtoupper(\Illuminate\Support\Str::random(4));
            $invoice = Invoice::create([
                'invoice_code' => $invoiceCode,
                'table_name' => $tableName ?? static::tableNameFor($orders),
                'payment_method' => count($paymentRows) === 1 ? $paymentRows[0]['method'] : 'mixed',
                'amount_received' => $totalReceived,
                'change_amount' => round($totalReceived - $payable, 2),
                'total_amount' => $total,
                'deposit_amount' => $depositTotal,
                'subtotal_amount' => $subtotal,
                'vat_amount' => $vatTotal,
                'discount_amount' => $totalDiscount,
                'issued_at' => now(),
            ]);

            // 5. Ghi payments: ưu tiên paymentRows; cọc applied thành payment row
            foreach ($paymentRows as $row) {
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => $row['method'],
                    'amount' => (float) $row['amount'],
                    'reference' => $row['reference'] ?? null,
                    'note' => $row['note'] ?? null,
                    'received_by' => $userId,
                ]);
            }
            foreach ($heldDeposits as $d) {
                $depositPayment = Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => $d->method === 'bank_transfer' ? 'bank_transfer' : 'cash',
                    'amount' => (float) $d->amount,
                    'note' => 'Tiền cọc đơn '.($d->order_id ?? '?'),
                    'received_by' => $userId,
                ]);
                $d->update([
                    'status' => 'applied',
                    'resolved_at' => now(),
                    'resolved_by_user_id' => $userId,
                    'payment_id' => $depositPayment->id,
                ]);
            }

            // 6. Ghi invoice_lines
            foreach ($lineInputs as $li) {
                InvoiceLine::create([
                    'invoice_id' => $invoice->id,
                    'order_item_id' => $li['order_item_id'],
                    'menu_item_id' => $li['menu_item_id'],
                    'name_snapshot' => $li['name_snapshot'],
                    'quantity' => $li['quantity'],
                    'unit_price' => $li['unit_price'],
                    'subtotal' => $li['subtotal'],
                    'vat_rate' => $li['vat_rate'],
                    'vat_amount' => $li['vat_amount'],
                    'discount_amount' => $li['discount_amount'],
                ]);
            }

            // 7. Ghi invoice_promotions + tăng used_count
            foreach ($promotionRows as $pr) {
                InvoicePromotion::create(array_merge($pr, ['invoice_id' => $invoice->id]));
                \App\Models\Promotion::where('id', $pr['promotion_id'])->increment('used_count');
            }

            // 8. Cập nhật orders (1 nguồn duy nhất): phân bổ discount theo tỷ trọng, đơn cuối nhận phần dư
            $count = $orders->count();
            $assignedDiscount = 0.0;
            foreach ($orders as $idx => $order) {
                $orderSubtotal = (float) $order->items()->where('status', '!=', 'cancelled')->sum('subtotal');
                $orderDiscount = 0.0;
                if ($totalDiscount > 0 && $subtotal > 0) {
                    if ($idx === $count - 1) {
                        $orderDiscount = round($totalDiscount - $assignedDiscount, 2);
                    } else {
                        $orderDiscount = floor($totalDiscount * $orderSubtotal / $subtotal);
                        $assignedDiscount += $orderDiscount;
                    }
                }
                $orderTotal = round(max(0.0, $orderSubtotal - $orderDiscount), 2);

                $order->update([
                    'status' => 'paid',
                    'invoice_id' => $invoice->id,
                    'promotion_id' => $promotionRows[0]['promotion_id'] ?? null,
                    'discount_amount' => $orderDiscount,
                    'total' => $orderTotal,
                ]);

                OrderActivityLogger::log($order, 'checkout', $userId, [
                    'invoice_code' => $invoiceCode,
                    'total' => $orderTotal,
                    'bulk' => $count > 1,
                ]);
            }

            return $invoice;
        });
    }

    private static function tableNameFor(\Illuminate\Support\Collection $orders): string
    {
        $first = $orders->first();
        $table = $first?->table;
        if (! $table) {
            return 'Mang đi';
        }
        $primaryId = $table->merged_into_table_id ?? $table->id;
        $all = \App\Models\Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
        $sub = $all->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
        $primary = $all->firstWhere('id', $primaryId);
        return $sub ? "{$primary->table_number} (Gộp {$sub})" : $primary->table_number;
    }
}
```

Lưu ý: hàm `sumAssignedDiscount` ở trên chỉ là bản nháp chưa sạch — trong implementation phải đổi thành cơ chế theo dõi `assignedTotal`/`assignedDiscount` kiểu: giữ `$assigned = 0.0` ngoài loop và đơn cuối nhận phần dư `$totalDiscount - $assigned`, tương tự pattern `bulk phân bổ` hiện có trong POSController::bulkCheckout (đã hoạt động đúng). KHÔNG dùng `sumAssignedDiscount`.

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\Services\CheckoutServiceTest.php`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Checkout/CheckoutService.php tests/Feature/Services/CheckoutServiceTest.php
git commit -m "feat: CheckoutService pipeline (lines/payments/promotions/deposit)"
```

---

## Task 6: POSController.checkout dùng CheckoutService (API tương thích)

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php` — `checkout()`
- Test: `tests/Feature/POSCheckoutTest.php` (giữ nguyên — phải vẫn pass), thêm case mới vào `tests/Feature/Services/CheckoutServiceTest.php` hoặc POSCheckoutTest

**Interfaces:**
- Consumes: Task 5 `CheckoutService::run(Order, paymentRows, promotionCodes, userId)`.
- Endpoint giữ nguyên: POST `/staff/pos/checkout` nhận `order_id`, `payment_method`, `amount_received`, `change_amount`, `promotion_code`, `idempotency_key`. Chuyển `payment_method`+`amount_received` thành `paymentRows = [ ['method'=>..., 'amount'=>...] ]`.

- [ ] **Step 1: Chạy test hiện có (baseline)**

Run: `php artisan test tests\Feature\POSCheckoutTest.php`
Expected: PASS trước khi sửa (baseline xanh).

- [ ] **Step 2: Viết test fail — kiểm tra invoice_lines/payments được ghi khi checkout qua endpoint**

Thêm vào `tests/Feature/POSCheckoutTest.php`:

```php
test('checkout qua endpoint ghi invoice_lines payments va invoice_promotions', function () {
    $this->actingAs(posAdmin());
    $promo = \App\Models\Promotion::create(['code' => 'EP10', 'name' => '10%', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true]);
    $item = posMenuItem(['name' => 'Cf ep', 'price' => 50000, 'vat_rate' => 10]);
    $order = posOrder(posTable(['table_number' => 'B77']), [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 90000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $invoice = \App\Models\Invoice::firstOrFail();
    expect($invoice->lines)->toHaveCount(1);
    expect($invoice->lines->first()->name_snapshot)->toBe('Cf ep');
    expect($invoice->payments)->toHaveCount(1);
    expect((float) $invoice->payments->first()->amount)->toBe(90000.0);
    expect($invoice->promotions)->toHaveCount(1);
    expect((float) $invoice->total_amount)->toBe(90000.0); // 100k - 10k
});
```

- [ ] **Step 3: Chạy test fail**

Run: `php artisan test tests\Feature\POSCheckoutTest.php --filter=endpoint`
Expected: FAIL (lines/payments chưa được ghi).

- [ ] **Step 4: Implement checkout controller**

Trong `POSController::checkout`, giữ nguyên: validate, idempotency, lock, kiểm tra paid/cancelled/reserved, kitchen-lock/bypass. **Thay phần logic thanh toán** bằng:

```php
            $result = DB::transaction(function () use ($validated, $request, $order, $totalAmount) {
                // ... phần validate/group table/tính subtotal cũ chỉ để giữ resolve legacy
                $order = Order::with(['items.menuItem'])->lockForUpdate()->findOrFail($validated['order_id']);
                if (in_array($order->status, ['paid', 'cancelled'])) {
                    throw new \Exception('Đơn hàng này đã được thanh toán hoặc đã hủy.');
                }
                if ($order->status === 'reserved') {
                    throw new \Exception('Đơn đặt bàn chưa check-in, không thể thanh toán', 422);
                }
                $hasUncompletedItems = $order->items->contains(fn ($item) => in_array($item->status, ['pending', 'processing']));
                $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
                if ($hasUncompletedItems && ! $canBypass) {
                    throw new \Exception('Bạn không có quyền duyệt khẩn cấp thanh toán khi món chưa được Bếp hoàn tất.');
                }

                $paymentRows = [[
                    'method' => $validated['payment_method'],
                    'amount' => (float) $validated['amount_received'],
                ]];
                $codes = ! empty($validated['promotion_code']) ? [$validated['promotion_code']] : [];

                $invoice = \App\Services\Checkout\CheckoutService::run($order, $paymentRows, $codes, $request->user()?->id);

                return $invoice;
            });
```

Sau đó giữ logic giải phóng bàn (như hiện tại — dùng `$order` sau service vì service đã update status). Trả response như cũ (giữ compatibility `deposit_total`, `deposit_refund` — lấy từ invoice/deposits).

Chú ý: giữ cơ chế `OrderSentToKitchen` events, `TableStatusUpdated` dispatch, release tables logic — chỉ đổi phần tính tiền + ghi DB.

- [ ] **Step 5: Chạy test đủ**

Run: `php artisan test tests\Feature\POSCheckoutTest.php`
Expected: PASS hết (cũ + mới).

- [ ] **Step 6: Regression toàn bộ**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/POSCheckoutTest.php
git commit -m "feat: endpoint checkout dung CheckoutService ghi payment core"
```

---

## Task 7: POSController.bulkCheckout dùng CheckoutService::runBulk

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php` — `bulkCheckout()`
- Test: `tests/Feature/POSBulkCheckoutTest.php` (giữ) + thêm test mới

**Interfaces:**
- Consumes: `CheckoutService::runBulk(Collection<Order>, payments, codes, userId, tableName)`.
- Endpoint giữ: POST `/staff/pos/bulk-checkout` nhận `order_ids`, `table_id`, `payment_method`, `amount_received`, `change_amount`, `promotion_code`, `idempotency_key`. `payment_method` có thể `e_wallet` — payments.method enum đã gồm.

- [ ] **Step 1: Baseline**

Run: `php artisan test tests\Feature\POSBulkCheckoutTest.php`
Expected: PASS trước khi sửa.

- [ ] **Step 2: Test mới — bulk ghi lines/payments đúng tổng**

```php
test('bulk checkout ghi lines cho moi don va tong payments', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 60000, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 40000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id, $order2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    $invoice = \App\Models\Invoice::firstOrFail();
    expect($invoice->lines)->toHaveCount(2);
    expect((float) $invoice->subtotal_amount)->toBe(100000.0);
    expect((float) $invoice->total_amount)->toBe(100000.0);
    expect($invoice->payments)->toHaveCount(1);
});
```

- [ ] **Step 3: Fail**

Run: `php artisan test tests\Feature\POSBulkCheckoutTest.php --filter=lines`
Expected: FAIL.

- [ ] **Step 4: Implement**

Trong `bulkCheckout`: giữ validate + idempotency + lock orders + kitchen check. Thay phần thanh toán:

```php
                $orders = Order::with(['items.menuItem'])->whereIn('id', $validated['order_ids'])->lockForUpdate()->get();
                // ... checks paid/cancelled/reserved/kitchen như cũ ...
                $paymentRows = [['method' => $validated['payment_method'], 'amount' => (float) $validated['amount_received']]];
                $codes = ! empty($validated['promotion_code']) ? [$validated['promotion_code']] : [];

                $tableName = null; // để service tự tính theo table group
                $invoice = \App\Services\Checkout\CheckoutService::runBulk($orders, $paymentRows, $codes, $request->user()?->id, $tableName);
```

Giữ release-tables + events + response. API response giữ `deposit_total`, `deposit_refund`.

- [ ] **Step 5: Pass**

Run: `php artisan test tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/POSBulkCheckoutTest.php
git commit -m "feat: bulkCheckout dung CheckoutService runBulk"
```

---

## Task 8: validate-promotion nhận codes[] (stack) — giữ compat `code`

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php` — `validatePromotion()`
- Test: `tests/Feature/PromotionApplyTest.php` (giữ) + thêm test stack trong file test mới hoặc thêm vào PromotionApplyTest

**Interfaces:**
- Consumes: Task 4 (`PromotionEngine::resolveAll`).
- Request cũ: `{code, subtotal, items?}`. Request mới chấp nhận thêm `codes`: array<string> — khi có `codes` dùng nó, còn không dùng `[code]`.
- Response giữ shape cũ: `ok`, `discount_amount` (= total_discount), `total`, `promotion` (mã đầu tiên hoặc null) + `promotions` (array các mã) khi có nhiều.

- [ ] **Step 1: Test fail**

Thêm vào `tests/Feature/PromotionApplyTest.php`:

```php
test('validate-promotion stack nhieu ma', function () {
    $p1 = makePromotion(['code' => 'ST1'.substr(uniqid(),-4), 'discount_type' => 'percentage', 'discount_value' => 10]);
    $p2 = makePromotion(['code' => 'ST2'.substr(uniqid(),-4), 'discount_type' => 'fixed_amount', 'discount_value' => 20000]);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'codes' => [$p1->code, $p2->code],
        'subtotal' => 100000,
    ])->assertOk()->assertJson([
        'ok' => true,
        'discount_amount' => 30000,
        'total' => 70000,
    ]);
});

test('validate-promotion mot ma trong codes van tra promotion don', function () {
    $p = makePromotion(['code' => 'ST3'.substr(uniqid(),-4), 'discount_type' => 'percentage', 'discount_value' => 10]);
    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'codes' => [$p->code],
        'subtotal' => 100000,
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 10000]);
});
```

- [ ] **Step 2: Fail**

Run: `php artisan test tests\Feature\PromotionApplyTest.php --filter=stack`
Expected: FAIL (validation nhận `codes` chưa có).

- [ ] **Step 3: Implement**

Trong `validatePromotion`:
- Thêm rule: `'codes' => 'nullable|array|min:1'`, `'codes.*' => 'string|max:50'`.
- Tính `$codes = $validated['codes'] ?? [$validated['code'] ?? null];` (giữ compat: nếu không có `code` cũ và không có `codes` → 422 `code required`). Để giữ compat nhanh nhất: giữ rule `code` hiện tại đang `required` → đổi thành `'code' => 'required_without:codes|nullable|string|max:50'`.
- Gọi `PromotionEngine::resolveAll($codes, $lines, $subtotal)`.
- Nếu rejected → 422 với bản đồ message hiện có kèm code.
- Nếu ok → trả `ok`, `discount_amount = total_discount`, `total = subtotal - total_discount`, `promotion` = mã đầu tiên (id/name/code) để UI cũ không vỡ, `promotions` = array tất cả.

- [ ] **Step 4: Pass**

Run: `php artisan test tests\Feature\PromotionApplyTest.php tests\Feature\POSPromotionRejectMessagesTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/PromotionApplyTest.php
git commit -m "feat: validate-promotion nhan codes[] stack, giu compat code"
```

---

## Task 9: Reports đọc từ invoice_lines/payments + PaymentDrawer "Trong đó VAT"

**Files:**
- Modify: `app/Http/Controllers/Reports/ProductDetailsReportController.php`
- Modify: `app/Http/Controllers/Reports/InvoiceItemsReportController.php`
- Modify: `app/Http/Controllers/Reports/ProfitReportController.php`
- Modify: `app/Http/Controllers/Reports/PaymentsReportController.php`
- Modify: `resources/js/pages/staff/pos/components/PaymentDrawer.tsx`
- Test: `tests/Feature/Reports/ProductDetailsReportTest.php`, `tests/Feature/Reports/InvoiceItemsReportTest.php` (giữ + mở rộng)

**Interfaces:**
- Consumes: Task 1+2 (schema/models), Task 6+7 (checkout ghi invoice_lines).
- Báo cáo món: `invoice_lines` (thay vì join orders+order_items). `payments` cho phương thức.

- [ ] **Step 1: Test fail — ProductDetails đọc từ invoice_lines**

Thêm test vào `tests/Feature/Reports/ProductDetailsReportTest.php`:

```php
public function test_report_reads_from_invoice_lines_snapshot()
{
    $this->actingAs($this->adminUser());
    $invoice = Invoice::create([
        'invoice_code' => 'HS1', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 15000, 'change_amount' => 0, 'total_amount' => 15000,
    ]);
    $invoice->forceFill(['issued_at' => '2026-07-15 10:00:00'])->save();

    $mi = posMenuItem(['name' => 'Cà phê đen']);
    \App\Models\InvoiceLine::create([
        'invoice_id' => $invoice->id, 'menu_item_id' => $mi->id, 'name_snapshot' => 'Cà phê đen',
        'quantity' => 2, 'unit_price' => 15000, 'subtotal' => 30000, 'vat_rate' => 0, 'vat_amount' => 0, 'discount_amount' => 15000,
    ]);

    $this->get('/reports/product-details?start_date=2026-07-01&end_date=2026-07-31')
        ->assertInertia(fn ($page) => $page
            ->has('rows', 1)
            ->where('rows.0.item_name', 'Cà phê đen')
            ->where('rows.0.revenue', 15000)
        );
}
```

Hipothesis: `ProductDetailsReportController` hiện đang đọc `order_items` — sau sửa đọc `invoice_lines`. Test này không tạo order_items -> bằng chứng đọc lines.

- [ ] **Step 2: Fail**

Run: `php artisan test tests\Feature\Reports\ProductDetailsReportTest.php --filter=invoice_lines`
Expected: FAIL.

- [ ] **Step 3: Implement ProductDetailsReportController**

Query đổi:
```php
        $rows = \App\Models\InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->leftJoin('menu_categories', 'menu_categories.id', '=', \DB::raw('(SELECT category_id FROM menu_items WHERE menu_items.id = invoice_lines.menu_item_id)'))
            ->whereBetween('invoices.issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->groupBy('invoice_lines.menu_item_id', 'invoice_lines.name_snapshot')
            ->selectRaw('invoice_lines.menu_item_id, invoice_lines.name_snapshot as item_name, SUM(invoice_lines.quantity) as quantity, SUM(invoice_lines.subtotal - invoice_lines.discount_amount) as revenue, SUM(invoice_lines.discount_amount) as discount_amount')
            ->orderByDesc('revenue')
            ->get()
            ->values()
            ->map(fn ($r) => [
                'menu_item_id' => $r->menu_item_id,
                'item_name' => $r->item_name,
                'category_name' => $r->category_name ?? null,
                'quantity' => (int) $r->quantity,
                'revenue' => (float) $r->revenue,
                'discount_amount' => (float) $r->discount_amount,
            ]);
```

(Giữ `categories` prop từ MenuCategory cho filter; map category_name từ menu_categories qua join đúng — điều chỉnh join cho gọn: join `menu_items` rồi `menu_categories`.)

- [ ] **Step 4: Pass ProductDetails**

Run: `php artisan test tests\Feature\Reports\ProductDetailsReportTest.php`
Expected: PASS (cũ + mới).

- [ ] **Step 5: InvoiceItemsReport đọc lines**

Đổi join từ `orders+order_items` → `invoice_lines`:

```php
        $rows = \App\Models\InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereBetween('invoices.issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->orderByDesc('invoices.issued_at')
            ->get([
                'invoice_lines.id as id', 'invoices.id as invoice_id', 'invoices.invoice_code',
                'invoices.issued_at', 'invoices.table_name', 'invoices.payment_method',
                'invoice_lines.name_snapshot as item_name', 'invoice_lines.quantity',
                'invoice_lines.unit_price', 'invoice_lines.subtotal', 'invoice_lines.discount_amount',
            ])
            ->values()
            ->map(fn ($r) => [
                'id' => $r->id,
                'invoice_id' => $r->invoice_id,
                'invoice_code' => $r->invoice_code,
                'issued_at' => $r->issued_at ? (string) $r->issued_at : null,
                'table_name' => $r->table_name,
                'item_name' => $r->item_name,
                'quantity' => (int) $r->quantity,
                'unit_price' => (float) $r->unit_price,
                'subtotal' => (float) $r->subtotal,
                'discount_amount' => (float) $r->discount_amount,
                'net' => (float) $r->subtotal - (float) $r->discount_amount,
                'order_gross' => (float) $r->subtotal,
                'order_discount' => (float) $r->discount_amount,
                'payment_method' => $r->payment_method,
            ]);
```

Giữ metrics shape hiện tại.

- [ ] **Step 6: Pass InvoiceItems**

Run: `php artisan test tests\Feature\Reports\InvoiceItemsReportTest.php`
Expected: PASS.

- [ ] **Step 7: ProfitReport + PaymentsReport đọc mới**

ProfitReport: đổi phần gom món bán sang `invoice_lines` (`quantity`, `subtotal - discount_amount` làm revenue; `menu_item_id` để lookup recipe cost). Phần recipe cost giữ nguyên.

PaymentsReport:
```php
        $rows = Invoice::query()
            ->with(['payments' => fn ($q) => $q->select('invoice_id', 'method', 'amount'),
                    'promotions' => fn ($q) => $q->select('invoice_id', 'amount')])
            ->whereBetween('issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->orderByDesc('issued_at')
            ->get()
            ->values()
            ->map(fn ($i) => [
                // ... giữ fields; payment_method = $i->payment_method; thêm payments breakdown
                'payments' => $i->payments->groupBy('method')->map(fn ($p) => (float) $p->sum('amount'))->toArray(),
                'gross_amount' => (float) $i->subtotal_amount,
                'discount_amount' => (float) $i->discount_amount,
            ]);
```
Giữ metrics shape; cash_total/bank_total lấy từ `payments` (groupBy method → sum) thay vì filter payment_method trên invoice.

- [ ] **Step 8: Pass reports**

Run: `php artisan test tests\Feature\Reports`
Expected: PASS toàn bộ reports tests.

- [ ] **Step 9: PaymentDrawer hiển thị "Trong đó VAT"**

Trong `resources/js/pages/staff/pos/components/PaymentDrawer.tsx`, dòng VAT (hiện là `Thuế VAT:` với giá trị `vatTotal` đang cộng thêm — sai với giá-gồm-thuế) đổi thành:

```tsx
                                    <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                                        <span>Trong đó VAT:</span>
                                        <span className="font-semibold tabular-nums">{vatInTotal.toLocaleString('vi-VN')} đ</span>
                                    </div>
```

Với `vatInTotal` tính theo VAT-trong-giá (floor subtotal/(1+rate/100)) thay vì `subtotal * rate/100`:

```tsx
    const vatInTotal = cartItems.reduce((sum, item) => {
        const line = item.quantity * item.unit_price;
        const rate = item.vat_rate || 0;
        if (rate <= 0) return sum;
        const net = Math.floor(line / (1 + rate / 100));
        return sum + (line - net);
    }, 0);
```

Xoá `vatTotal` cũ nếu không còn dùng. Đổi hiển thị breakdown: "Tổng tiền món" giữ nguyên; dòng VAT đổi thành "Trong đó VAT" với giá trị `vatInTotal`; **KHÔNG cộng** vào payable (`totalAmount = subtotal` giữ nguyên — giá đã gồm VAT).

- [ ] **Step 10: types:check + lint**

Run: `npm run types:check; if ($?) { npx eslint resources/js/pages/staff/pos/components/PaymentDrawer.tsx }`
Expected: PASS 0 lỗi mới.

- [ ] **Step 11: Commit**

```bash
git add app/Http/Controllers/Reports/ProductDetailsReportController.php app/Http/Controllers/Reports/InvoiceItemsReportController.php app/Http/Controllers/Reports/ProfitReportController.php app/Http/Controllers/Reports/PaymentsReportController.php resources/js/pages/staff/pos/components/PaymentDrawer.tsx tests/Feature/Reports/
git commit -m "feat: bao cao doc invoice_lines/payments, PaymentDrawer hien thi VAT trong gia"
```

---

## Task 10: Backfill migration (tùy chọn, chạy 1 lần)

**Files:**
- Create: `database/migrations/2026_08_05_000002_backfill_payment_core_tables.php`
- Test: `tests/Feature/BackfillPaymentCoreTest.php`

**Interfaces:**
- Consumes: Task 1 schema, Task 2 models.

- [ ] **Step 1: Test fail**

```php
<?php

use App\Models\Invoice;

test('backfill dien payments va invoice_lines tu hoa don cu', function () {
    $this->actingAs(posAdmin());
    // Tạo invoice + order theo flow ngày xưa (không có lines)
    $table = posTable();
    $item = posMenuItem(['name' => 'Cf', 'price' => 30000]);
    $invoice = Invoice::create([
        'invoice_code' => 'OLD1', 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 26000, 'change_amount' => 0, 'total_amount' => 26000,
    ]);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'paid', 'invoice_id' => $invoice->id, 'discount_amount' => 4000]);
    $orderItem = $order->items->first();
    $orderItem->update(['discount_amount' => 4000]);

    \Illuminate\Support\Facades\Artisan::call('migrate');

    $invoice->refresh();
    expect($invoice->payments)->toHaveCount(1);
    expect($invoice->lines)->toHaveCount(1);
    expect($invoice->lines->first()->name_snapshot)->toBe('Cf');
    expect((float) $invoice->lines->first()->discount_amount)->toBe(4000.0);
});
```

- [ ] **Step 2: Fail**

Run: `php artisan test tests\Feature\BackfillPaymentCoreTest.php`
Expected: FAIL (migration chưa backfill).

- [ ] **Step 3: Implement migration backfill**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $invoices = DB::table('invoices')->get();
        foreach ($invoices as $inv) {
            $invoiceId = $inv->id;

            // payments: 1 dòng theo payment_method cũ (nếu amount_received > 0)
            if ((float) $inv->amount_received > 0 && DB::table('payments')->where('invoice_id', $invoiceId)->doesntExist()) {
                DB::table('payments')->insert([
                    'invoice_id' => $invoiceId,
                    'method' => in_array($inv->payment_method, ['cash','bank_transfer','e_wallet']) ? $inv->payment_method : 'cash',
                    'amount' => $inv->amount_received,
                    'created_at' => $inv->created_at,
                    'updated_at' => $inv->created_at,
                ]);
            }

            // invoice_lines từ order_items của các orders thuộc invoice (chỉ nếu chưa có)
            if (DB::table('invoice_lines')->where('invoice_id', $invoiceId)->doesntExist()) {
                $items = DB::table('order_items')
                    ->join('orders', 'orders.invoice_id', '=', DB::raw($invoiceId))
                    ->join('order_items as oi', 'oi.order_id', '=', 'orders.id')
                    ->leftJoin('menu_items', 'menu_items.id', '=', 'oi.menu_item_id')
                    ->where('oi.status', '!=', 'cancelled')
                    ->select('oi.*', 'menu_items.name as item_name', 'menu_items.vat_rate')
                    ->get();

                foreach ($items as $it) {
                    DB::table('invoice_lines')->insert([
                        'invoice_id' => $invoiceId,
                        'order_item_id' => $it->id,
                        'menu_item_id' => $it->menu_item_id,
                        'name_snapshot' => $it->item_name ?? 'Món',
                        'quantity' => $it->quantity,
                        'unit_price' => $it->unit_price,
                        'subtotal' => $it->subtotal,
                        'vat_rate' => 0,
                        'vat_amount' => 0,
                        'discount_amount' => $it->discount_amount ?? 0,
                        'created_at' => $inv->created_at,
                        'updated_at' => $inv->created_at,
                    ]);
                }

                // invoice_promotions từ orders.promotion_id (1 dòng/đơn)
                $ordersWithPromo = DB::table('orders')
                    ->where('invoice_id', $invoiceId)
                    ->whereNotNull('promotion_id')
                    ->get();
                foreach ($ordersWithPromo as $o) {
                    $promo = DB::table('promotions')->find($o->promotion_id);
                    if ($promo && DB::table('invoice_promotions')->where('invoice_id', $invoiceId)->where('promotion_id', $promo->id)->doesntExist()) {
                        DB::table('invoice_promotions')->insert([
                            'invoice_id' => $invoiceId,
                            'promotion_id' => $promo->id,
                            'code' => $promo->code,
                            'name' => $promo->name,
                            'discount_type' => $promo->discount_type,
                            'discount_value' => $promo->discount_value,
                            'stack_order' => 0,
                            'amount' => (float) $o->discount_amount,
                            'created_at' => $inv->created_at,
                            'updated_at' => $inv->created_at,
                        ]);
                    }
                }
            }

            // điền subtotal/vat/discount tổng cho invoice cũ
            $subtotal = (float) DB::table('orders')->where('invoice_id', $invoiceId)->sum('subtotal');
            $discount = (float) DB::table('orders')->where('invoice_id', $invoiceId)->sum('discount_amount');
            DB::table('invoices')->where('id', $invoiceId)->update([
                'subtotal_amount' => $subtotal,
                'discount_amount' => $discount,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('payments')->truncate();
        DB::table('invoice_lines')->truncate();
        DB::table('invoice_promotions')->truncate();
    }
};
```

Lưu ý: query join order_items nên đơn giản hoá: `DB::table('order_items')->join('orders','orders.id','=','order_items.order_id')->where('orders.invoice_id', $invoiceId)...`.

- [ ] **Step 4: Pass**

Run: `php artisan test tests\Feature\BackfillPaymentCoreTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_08_05_000002_backfill_payment_core_tables.php tests/Feature/BackfillPaymentCoreTest.php
git commit -m "feat: backfill payment core tu du lieu cu (tuy chon)"
```

---

## Task 11: Gỡ ghi total trong sendToKitchen + preview dùng OrderTotals

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php` — `sendToKitchen()`
- Test: `tests/Feature/SendToKitchenTotalsTest.php` (mới) + giữ regression

**Interfaces:**
- Consumes: Task 3 (`OrderTotals::preview`).
- Gỡ mọi chỗ `$parentOrder->update(['subtotal','vat_amount','total'])` trong phần reduce-items của `sendToKitchen`. Giá trị chỉ dùng cho hiển thị — preview JIT từ order_items.

- [ ] **Step 1: Viết test — sau reduce-items, orders.total không thay đổi và preview trả về đúng**

```php
<?php

use App\Services\Checkout\OrderTotals;

test('reduce-items khong con ghi total vao orders, preview dung', function () {
    $this->actingAs(posStaff());
    $itemA = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [
        ['item' => $itemA, 'qty' => 4, 'price' => 30000, 'status' => 'pending'],
    ], ['status' => 'pending']);
    $orderItem = $order->items->first();
    $originalTotal = (float) $order->total;

    $this->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [[
            'order_item_id' => $orderItem->id,
            'reduce_quantity' => 1,
            'cancellation_reason' => 'Khach doi y',
        ]],
        'subtotal' => 0, 'vat_amount' => 0, 'total' => 0,
    ])->assertRedirect();

    // subtotal/total sau khi reduce-items KHÔNG do sendToKitchen update nữa
    // preview mới là nguồn đúng: 3 mon * 30000 = 90000
    $p = OrderTotals::preview($order->fresh()->items()->where('status', '!=', 'cancelled')->get());
    expect($p['subtotal'])->toBe(90000.0);
    expect($order->fresh()->items->first()->quantity)->toBe(3);
    // orders.total KHÔNG do sendToKitchen touch nữa (gỡ ghi)
    expect((float) $order->fresh()->total)->toBe($originalTotal);
});
```

- [ ] **Step 2: Fail (code cũ đang update total trong reduce flow)**

Run: `php artisan test tests\Feature\SendToKitchenTotalsTest.php`
Expected: FAIL tại assertion cuối (`orders->total` bị ghi đè bởi reduce flow so với `$originalTotal`).

- [ ] **Step 3: Implement**

Trong `POSController::sendToKitchen`:
- Ở phần handle reductions: xoá block `$parentOrder->update(['subtotal' => $activeSubtotal, 'vat_amount' => $activeVatAmount, 'total' => $activeSubtotal]);` (giữ `status`='cancelled' nếu hết món).
- Ở phần tạo/cập nhật order mới: vẫn lưu `subtotal`, `vat_amount`, `total` từ request input (để preview bằng đường cũ nhất quán) — **GIỮ** vì khi tạo order cần snapshot tạm; nhưng dùng `OrderTotals::preview` để tính lại thay vì tin `$validated['subtotal']`? Quyết định: với order mới — vẫn lưu input subtotal như hiện tại (không phá), chỉ gỡ reduce-items cập nhật (nơi rắc rối cộng dồn). Ghi chú trong code: subtotal/total lúc pending chỉ dùng preview.

(Đổi tối thiểu theo spec: "xoá mọi chỗ ghi total trong sendToKitchen" — nhưng thực tế block tạo order vẫn cần subtotal/total ban đầu để các UI cũ không vỡ. Spec ghi rõ: 'Preview trước checkout dùng OrderTotals::preview (JIT)'. Việc tạo order ban đầu với subtotal/total là hành động giá trị khởi tạo, không phải 'update sau', nên GIỮ.)

- [ ] **Step 4: Pass**

Run: `php artisan test tests\Feature\SendToKitchenTotalsTest.php tests\Feature\POSOrderFlowTest.php tests\Feature\KitchenFlowTest.php`
Expected: PASS.

- [ ] **Step 5: Regression toàn bộ**

Run: `php artisan test`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php tests/Feature/SendToKitchenTotalsTest.php
git commit -m "feat: go ghi total trong sendToKitchen, preview JIT"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass
- [ ] `npm run types:check` — pass
- [ ] `npm run build` — pass
- [ ] Commit branch merge về main
