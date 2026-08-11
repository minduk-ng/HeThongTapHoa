# Promotion v2 — DB + Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách schema promotions 1 bảng thành 4 bảng (promotions v2 + promotion_conditions + promotion_actions + order_promotions), viết lại engine hỗ trợ 3 loại (PROMOTION/COUPON/VOUCHER), nhiều điều kiện AND, nhiều hành động đồng thời, FREE_PRODUCT, race-condition-safe quota. KHÔNG mất dữ liệu (đã xác minh: promotions bảng rỗng, orders.promotion_id toàn null, invoice_promotions rỗng).

**Architecture:** Migration rename `promotions`→`legacy_promotions`, tạo 4 bảng mới, drop FK `orders.promotion_id`, drop legacy. Model Promotion giữ tên (bảng mới cùng tên). Engine viết lại theo conditions/actions. CheckoutService gọi engine mới + lockForUpdate quota + ghi order_promotions + FREE_PRODUCT line 0đ.

**Tech Stack:** Laravel 13, PHP, Pest, MySQL (dev) / SQLite (test).

**Spec:** `docs/superpowers/specs/2026-08-10-promotion-v2-db-engine-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` như lệnh đơn.
- **KHÔNG mất dữ liệu:** migration phải rename-before-create (không drop bảng có FK orders trỏ tới). Verify: orders.promotion_id toàn null hiện tại → drop column an toàn.
- Mỗi task TDD: test fail → sửa → pass → commit.
- Engine mới: 3 loại promotion; conditions AND; actions đồng thời; FREE_PRODUCT thêm line 0đ; exclusive/stackable; race quota lockForUpdate.
- `order_promotions.discount_applied` ghi TỔNG discount per mã (không line-level). Ghi per-order (bulk checkout nhiều order → nhiều dòng).
- `invoice_promotions` snapshot giữ nguyên shape cũ (code/name/discount_type/discount_value/amount).
- Bỏ khỏi Promotion model: `target_type`/`target_value`/`min_order_amount`/`max_discount_amount` cột + `eligibleLines`/`targetSubtotal`/`allocateLineDiscounts`.
- Reason strings mới: `not_found`/`inactive`/`not_started`/`expired`/`out_of_uses`/`condition_not_met`/`exclusive_conflict`.
- Không đổi UI (spec 2), không làm analytics (spec 3).
- Route CRUD promotions giữ nguyên tên.

---

## File Structure

**Migration:** `database/migrations/2026_08_10_000001_create_promotion_v2_tables.php`

**Models:** `Promotion` (sửa), `PromotionCondition` (mới), `PromotionAction` (mới), `OrderPromotion` (mới).

**Services:** `PromotionEngine` (viết lại), `CheckoutService` (sửa).

**Controllers:** `PromotionController` (store/update), `PaymentController::validatePromotion` (sửa call engine).

**Tests:** `PromotionV2Test.php` (mới — conditions/actions/types/race) + `MigrationRebuildTest` (thêm assert bảng mới) + chuyển đổi 8 test cũ.

---

## Task 1: Migration 4 bảng mới + drop legacy

**Files:**
- Create: `database/migrations/2026_08_10_000001_create_promotion_v2_tables.php`
- Modify: `tests/Feature/MigrationRebuildTest.php` (thêm assert)

**Interfaces:**
- Produces: bảng `promotions` v2 + `promotion_conditions` + `promotion_actions` + `order_promotions`; `legacy_promotions` + `orders.promotion_id` biến mất. Các task sau phụ thuộc schema này.

- [ ] **Step 1: Viết test fail**

Thêm vào `tests/Feature/MigrationRebuildTest.php`:

```php
test('promotion v2: 4 bang moi ton tai, legacy da xoa', function () {
    expect(Schema::hasTable('promotion_conditions'))->toBeTrue();
    expect(Schema::hasTable('promotion_actions'))->toBeTrue();
    expect(Schema::hasTable('order_promotions'))->toBeTrue();
    expect(Schema::hasTable('legacy_promotions'))->toBeFalse();
    expect(Schema::hasColumn('orders', 'promotion_id'))->toBeFalse();
});

test('promotion v2: schema cac bang dung', function () {
    expect(Schema::hasColumns('promotions', [
        'id', 'name', 'type', 'code', 'start_date', 'end_date', 'status',
        'max_usage', 'used_count', 'exclusive', 'stackable',
    ]))->toBeTrue();
    expect(Schema::hasColumns('promotion_conditions', ['id', 'promotion_id', 'cond_type', 'cond_value']))->toBeTrue();
    expect(Schema::hasColumns('promotion_actions', ['id', 'promotion_id', 'action_type', 'action_value', 'max_discount_amount']))->toBeTrue();
    expect(Schema::hasColumns('order_promotions', ['id', 'invoice_id', 'order_id', 'promotion_id', 'code_used', 'discount_applied']))->toBeTrue();
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\MigrationRebuildTest.php`
Expected: FAIL — các bảng mới chưa tồn tại, orders.promotion_id vẫn còn.

- [ ] **Step 3: Tạo migration**

Tạo `database/migrations/2026_08_10_000001_create_promotion_v2_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Rename promotions cũ -> legacy (giữ FK orders nguyên vẹn tạm thời)
        Schema::rename('promotions', 'legacy_promotions');

        // 2. Tạo promotions v2
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('type', ['promotion', 'coupon', 'voucher'])->default('promotion');
            $table->string('code', 50)->nullable()->unique();
            $table->dateTime('start_date')->nullable();
            $table->dateTime('end_date')->nullable();
            $table->boolean('status')->default(true);
            $table->integer('max_usage')->nullable();
            $table->integer('used_count')->default(0);
            $table->boolean('exclusive')->default(false);
            $table->boolean('stackable')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        // 3. Tạo promotion_conditions
        Schema::create('promotion_conditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->enum('cond_type', ['min_order_value', 'min_quantity', 'specific_product']);
            $table->string('cond_value');
            $table->timestamps();
        });

        // 4. Tạo promotion_actions
        Schema::create('promotion_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->enum('action_type', ['discount_percent', 'discount_amount', 'free_product']);
            $table->decimal('action_value', 15, 2);
            $table->decimal('max_discount_amount', 15, 2)->nullable();
            $table->timestamps();
        });

        // 5. Tạo order_promotions
        Schema::create('order_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->string('code_used')->nullable();
            $table->decimal('discount_applied', 15, 2);
            $table->timestamps();
        });

        // 6. Drop FK + column orders.promotion_id (an toàn: toàn null)
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['promotion_id']);
            $table->dropColumn('promotion_id');
        });

        // 7. Drop legacy
        Schema::dropIfExists('legacy_promotions');
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedBigInteger('promotion_id')->nullable();
            $table->foreign('promotion_id')->references('id')->on('promotions')->nullOnDelete();
        });
        Schema::dropIfExists('order_promotions');
        Schema::dropIfExists('promotion_actions');
        Schema::dropIfExists('promotion_conditions');
        Schema::rename('promotions', 'legacy_promotions');
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
        Schema::dropIfExists('legacy_promotions');
    }
};
```

**Lưu ý:** `orders.promotion_id` hiện tại là FK `constrained('promotions')` nullOnDelete (từ migration cũ). `dropForeign(['promotion_id'])` — Laravel tự tìm tên FK theo convention. Nếu tên khác, dùng tên FK thực (kiểm tra `SHOW CREATE TABLE orders` hoặc thử chạy). Migration này là migration MỚI (không sửa file cũ) — chạy sau khi DB đã migrate tới `2026_08_10_000012_create_otp_codes_table`.

- [ ] **Step 4: Chạy migrate + test pass**

Run: `php artisan migrate`
Run: `php artisan test tests\Feature\MigrationRebuildTest.php`
Expected: PASS.

- [ ] **Step 5: Verify MySQL + data integrity**

Run: `php artisan migrate:fresh` (MySQL HeThongTapHoa) — 16 migrations OK.
Verify: `orders` vẫn 16 dòng (không mất data); `promotions` bảng mới rỗng; `legacy_promotions` không tồn tại.
Chạy script kiểm tra: đếm orders trước/sau migrate:fresh — phải bằng nhau.

- [ ] **Step 6: Full suite**

Run: `php artisan test`
Expected: FAIL các test promotion cũ (PromotionControllerTest, PromotionApplyTest, POSPromotionRejectMessagesTest, v.v.) — dùng cột cũ. **Ghi nhận là expected** (Task 3-5 sẽ xử lý).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_08_10_000001_create_promotion_v2_tables.php tests/Feature/MigrationRebuildTest.php
git commit -m "feat: promotion v2 - 4 bang moi (promotions/conditions/actions/order_promotions) + drop legacy"
```

---

## Task 2: Models mới + sửa Promotion model

**Files:**
- Create: `app/Models/PromotionCondition.php`, `app/Models/PromotionAction.php`, `app/Models/OrderPromotion.php`
- Modify: `app/Models/Promotion.php`

**Interfaces:**
- Consumes: schema Task 1.
- Produces: 4 models với relations; `Promotion` bỏ cột cũ. Task 3 (engine) dùng `$promotion->conditions`/`$promotion->actions`.

- [ ] **Step 1: Tạo 3 model mới**

`app/Models/PromotionCondition.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionCondition extends Model
{
    protected $fillable = ['promotion_id', 'cond_type', 'cond_value'];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
```

`app/Models/PromotionAction.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionAction extends Model
{
    protected $fillable = ['promotion_id', 'action_type', 'action_value', 'max_discount_amount'];

    protected $casts = [
        'action_value' => 'float',
        'max_discount_amount' => 'float',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
```

`app/Models/OrderPromotion.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderPromotion extends Model
{
    protected $fillable = ['invoice_id', 'order_id', 'promotion_id', 'code_used', 'discount_applied'];

    protected $casts = [
        'discount_applied' => 'float',
    ];

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
```

- [ ] **Step 2: Sửa Promotion model**

`app/Models/Promotion.php` — đổi `$fillable` + casts + bỏ methods cũ + thêm relations:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property string $name
 * @property string $type
 * @property string|null $code
 * @property \Carbon\Carbon|null $start_date
 * @property \Carbon\Carbon|null $end_date
 * @property bool $status
 * @property int|null $max_usage
 * @property int $used_count
 * @property bool $exclusive
 * @property bool $stackable
 */
class Promotion extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'type', 'code', 'start_date', 'end_date',
        'status', 'max_usage', 'used_count', 'exclusive', 'stackable',
    ];

    protected $casts = [
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'status' => 'bool',
        'max_usage' => 'int',
        'used_count' => 'int',
        'exclusive' => 'bool',
        'stackable' => 'bool',
    ];

    public function conditions(): HasMany
    {
        return $this->hasMany(PromotionCondition::class);
    }

    public function actions(): HasMany
    {
        return $this->hasMany(PromotionAction::class);
    }
}
```

**Xoá:** `eligibleLines`, `targetSubtotal`, `allocateLineDiscounts` (static methods cũ).

- [ ] **Step 3: Types/build không áp dụng (backend). Full suite ghi nhận fail promotion cũ**

Run: `php artisan test`
Expected: vẫn fail các test promotion cũ (Task 3-5 xử lý). Không có fail mới do model (các model mới chưa được gọi).

- [ ] **Step 4: Commit**

```bash
git add app/Models/PromotionCondition.php app/Models/PromotionAction.php app/Models/OrderPromotion.php app/Models/Promotion.php
git commit -m "feat: models promotion v2 (condition/action/order_promotion) + bo target/allocate cu"
```

---

## Task 3: Engine mới (PromotionEngine viết lại)

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php`
- Test: `tests/Feature/PromotionV2Test.php` (mới — phần conditions/actions/types)

**Interfaces:**
- Consumes: models Task 2 (`$promotion->conditions`/`->actions`).
- Produces: `PromotionEngine::resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array` trả `{status, promotions?, total_discount?, free_items?, reason?, code?}`. Task 4 (checkout) gọi.

- [ ] **Step 1: Viết test fail**

Tạo `tests/Feature/PromotionV2Test.php` (phần 1 — conditions/actions/type/stack):

```php
<?php

use App\Models\Promotion;
use App\Models\PromotionAction;
use App\Models\PromotionCondition;
use App\Services\Promotions\PromotionEngine;

function promoV2(array $attrs = []): Promotion
{
    return Promotion::create(array_merge([
        'name' => 'Promo '.uniqid(),
        'type' => 'promotion',
        'code' => null,
        'status' => true,
        'max_usage' => null,
        'used_count' => 0,
        'exclusive' => false,
        'stackable' => true,
    ], $attrs));
}

function addCond(Promotion $p, string $type, string $value): PromotionCondition
{
    return $p->conditions()->create(['cond_type' => $type, 'cond_value' => $value]);
}

function addAction(Promotion $p, string $type, float $value, ?float $max = null): PromotionAction
{
    return $p->actions()->create([
        'action_type' => $type, 'action_value' => $value, 'max_discount_amount' => $max,
    ]);
}

$lines = fn () => collect([
    ['order_item_id' => 1, 'menu_item_id' => 10, 'quantity' => 2, 'subtotal' => 100000, 'category_id' => 3],
    ['order_item_id' => 2, 'menu_item_id' => 11, 'quantity' => 1, 'subtotal' => 50000, 'category_id' => 4],
]);

test('condition min_order_value: khong tho dieu kien bi tu choi', function () {
    $p = promoV2();
    addCond($p, 'min_order_value', '200000');

    $res = PromotionEngine::resolveAll([], $lines(), 120000);

    expect($res['status'])->toBe('rejected');
    expect($res['reason'])->toBe('condition_not_met');
});

test('condition min_order_value: tho dieu kien ap dung', function () {
    $p = promoV2();
    addCond($p, 'min_order_value', '100000');
    addAction($p, 'discount_percent', 10);

    $res = PromotionEngine::resolveAll([], $lines(), 150000);

    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(15000.0);
});

test('condition min_quantity + specific_product: AND', function () {
    $p = promoV2();
    addCond($p, 'min_quantity', '3');
    addCond($p, 'specific_product', '10');
    addAction($p, 'discount_amount', 20000);

    // Đủ 3 món + có món 10 → OK
    $res = PromotionEngine::resolveAll([], $lines(), 150000);
    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(20000.0);

    // Thiếu món 10 → reject
    $p2 = promoV2();
    addCond($p2, 'min_quantity', '3');
    addCond($p2, 'specific_product', '999');
    addAction($p2, 'discount_amount', 20000);
    $res2 = PromotionEngine::resolveAll([], $lines(), 150000);
    expect($res2['status'])->toBe('rejected');
    expect($res2['reason'])->toBe('condition_not_met');
});

test('promotion tu dong chon 1 tot nhat', function () {
    $p1 = promoV2(); addAction($p1, 'discount_amount', 5000);
    $p2 = promoV2(); addAction($p2, 'discount_amount', 20000);
    $p3 = promoV2(); addAction($p3, 'discount_amount', 10000);

    $res = PromotionEngine::resolveAll([], $lines(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);  // chỉ 1 promotion tốt nhất
    expect($res['promotions'][0]['promotion']->id)->toBe($p2->id);
    expect($res['total_discount'])->toBe(20000.0);
});

test('discount_percent cap max_discount_amount', function () {
    $p = promoV2();
    addAction($p, 'discount_percent', 20, 15000);

    $res = PromotionEngine::resolveAll([], $lines(), 150000);

    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(15000.0);  // 20% = 30000, cap 15000
});

test('coupon nhap ma: validate + exclusive', function () {
    $coupon = promoV2(['type' => 'coupon', 'code' => 'SAVE10']);
    addAction($coupon, 'discount_percent', 10);
    $auto = promoV2();
    addAction($auto, 'discount_amount', 5000);

    // Nhập mã SAVE10 → chỉ mã, KHÔNG promotion tự động (mặc định auto không stack khi có mã?)
    $res = PromotionEngine::resolveAll(['SAVE10'], $lines(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);
    expect($res['promotions'][0]['promotion']->id)->toBe($coupon->id);
});

test('exclusive=true bo het promotion khac', function () {
    $ex = promoV2(['type' => 'coupon', 'code' => 'EXCL', 'exclusive' => true]);
    addAction($ex, 'discount_amount', 30000);
    $other = promoV2(['type' => 'coupon', 'code' => 'OTHER']);
    addAction($other, 'discount_amount', 5000);

    $res = PromotionEngine::resolveAll(['EXCL', 'OTHER'], $lines(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);
    expect($res['promotions'][0]['promotion']->id)->toBe($ex->id);
});

test('free_product: tra ve free_items', function () {
    $p = promoV2();
    addAction($p, 'free_product', 42);

    $res = PromotionEngine::resolveAll([], $lines(), 150000);

    expect($res['status'])->toBe('ok');
    expect($res['free_items'])->toContain(['menu_item_id' => 42]);
});
```

**Lưu ý:** các test này dùng `Promotion::create` với fillable mới (Task 2). Kiểm tra logic "auto không stack khi có mã" — spec nói PROMOTION tự động bị loại nếu có COUPON stackable=false; test trên giả định mặc định. **Đọc spec Phần 3 Bước 2 trước khi viết** — nếu auto vẫn chạy khi có mã stackable=true thì điều chỉnh test (vd coupon stackable=false để chặn auto). Giữ test đúng ý spec.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\PromotionV2Test.php`
Expected: FAIL — engine cũ chưa hỗ trợ conditions/actions.

- [ ] **Step 3: Viết lại PromotionEngine**

`app/Services/Promotions/PromotionEngine.php` (thay toàn bộ):

```php
<?php

namespace App\Services\Promotions;

use App\Models\Promotion;
use App\Models\MenuItem;
use Illuminate\Support\Collection;

class PromotionEngine
{
    public static function resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array
    {
        $lines = collect($lines)->values();

        // 1. COUPON/VOUCHER từ mã nhập
        $codePromotions = [];
        foreach (array_values($codes) as $code) {
            $promotion = Promotion::query()
                ->whereRaw('UPPER(code) = ?', [mb_strtoupper(trim($code))]);
            if ($lockForUpdate) {
                $promotion->lockForUpdate();
            }
            $p = $promotion->with(['conditions', 'actions'])->first();

            if (! $p) {
                return ['status' => 'rejected', 'reason' => 'not_found', 'code' => $code];
            }
            $reject = self::validateAgainst($p, $lines, $subtotal);
            if ($reject !== null) {
                return ['status' => 'rejected', 'reason' => $reject, 'code' => $code];
            }
            $codePromotions[] = $p;
        }

        // 2. exclusive: 1 mã exclusive → bỏ hết khác
        if (count($codePromotions) > 1) {
            $exclusive = collect($codePromotions)->first(fn ($p) => $p->exclusive);
            if ($exclusive) {
                $codePromotions = [$exclusive];
            }
        }

        // 3. PROMOTION tự động: quét, lọc thoả điều kiện, chọn tốt nhất
        $auto = null;
        $hasNonStackable = collect($codePromotions)->contains(fn ($p) => ! $p->stackable);
        if (! $hasNonStackable) {
            $candidates = Promotion::query()
                ->where('type', 'promotion')
                ->where('status', true)
                ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', now()))
                ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', now()))
                ->with(['conditions', 'actions'])
                ->get()
                ->filter(fn ($p) => self::matchesConditions($p, $lines, $subtotal) && self::quotaOk($p));

            $auto = $candidates
                ->sortByDesc(fn ($p) => self::estimateDiscount($p, $lines, $subtotal))
                ->first();
        }

        // 4. Gộp pool: mã trước, auto sau
        $pool = $codePromotions;
        if ($auto && collect($codePromotions)->doesntContain(fn ($p) => $p->exclusive)) {
            $pool[] = $auto;
        }

        // 5. Áp dụng hành động
        $applied = [];
        $totalDiscount = 0.0;
        $freeItems = [];
        foreach ($pool as $p) {
            $discount = 0.0;
            $actionsApplied = [];
            foreach ($p->actions as $action) {
                if ($action->action_type === 'discount_percent') {
                    $d = $subtotal * ($action->action_value / 100);
                    if ($action->max_discount_amount !== null) {
                        $d = min($d, (float) $action->max_discount_amount);
                    }
                    $discount += $d;
                    $actionsApplied[] = ['type' => 'discount_percent', 'value' => $action->action_value];
                } elseif ($action->action_type === 'discount_amount') {
                    $discount += (float) $action->action_value;
                    $actionsApplied[] = ['type' => 'discount_amount', 'value' => (float) $action->action_value];
                } elseif ($action->action_type === 'free_product') {
                    $mi = MenuItem::find((int) $action->action_value);
                    if ($mi) {
                        $freeItems[] = ['menu_item_id' => $mi->id, 'name' => $mi->name];
                        $actionsApplied[] = ['type' => 'free_product', 'value' => $mi->id];
                    }
                }
            }

            $remaining = max(0.0, $subtotal - $totalDiscount);
            $amount = round(min(max(0.0, $discount), $remaining), 2);
            $totalDiscount += $amount;

            $applied[] = [
                'promotion' => $p,
                'amount' => $amount,
                'code' => $p->type === 'promotion' ? null : $p->code,
                'actions_applied' => $actionsApplied,
            ];
        }

        return [
            'status' => 'ok',
            'promotions' => $applied,
            'total_discount' => round($totalDiscount, 2),
            'free_items' => $freeItems,
        ];
    }

    private static function validateAgainst(Promotion $p, Collection $lines, float $subtotal): ?string
    {
        if (! $p->status) {
            return 'inactive';
        }
        $now = now();
        if ($p->start_date && $now->lt($p->start_date)) {
            return 'not_started';
        }
        if ($p->end_date && $now->gt($p->end_date)) {
            return 'expired';
        }
        if (! self::quotaOk($p)) {
            return 'out_of_uses';
        }
        if (! self::matchesConditions($p, $lines, $subtotal)) {
            return 'condition_not_met';
        }
        return null;
    }

    private static function quotaOk(Promotion $p): bool
    {
        return $p->max_usage === null || $p->used_count < $p->max_usage;
    }

    private static function matchesConditions(Promotion $p, Collection $lines, float $subtotal): bool
    {
        foreach ($p->conditions as $cond) {
            $ok = match ($cond->cond_type) {
                'min_order_value' => $subtotal >= (float) $cond->cond_value,
                'min_quantity' => $lines->sum('quantity') >= (int) $cond->cond_value,
                'specific_product' => $lines->contains(fn ($l) => (int) ($l['menu_item_id'] ?? 0) === (int) $cond->cond_value),
                default => false,
            };
            if (! $ok) {
                return false;
            }
        }
        return true;
    }

    private static function estimateDiscount(Promotion $p, Collection $lines, float $subtotal): float
    {
        $total = 0.0;
        foreach ($p->actions as $action) {
            if ($action->action_type === 'discount_percent') {
                $d = $subtotal * ($action->action_value / 100);
                if ($action->max_discount_amount !== null) {
                    $d = min($d, (float) $action->max_discount_amount);
                }
                $total += $d;
            } elseif ($action->action_type === 'discount_amount') {
                $total += (float) $action->action_value;
            }
        }
        return $total;
    }
}
```

**Lưu ý:** `free_product` action_value lưu decimal — khi cast `(int)` để tìm MenuItem. Kiểm tra `MenuItem` import. `estimateDiscount` không tính free_product (không biết giá trị) — chỉ cho việc chọn auto tốt nhất theo discount tiền.

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\PromotionV2Test.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php tests/Feature/PromotionV2Test.php
git commit -m "feat: PromotionEngine v2 (conditions AND, actions dong thoi, auto chon tot nhat, free_product, exclusive/stackable)"
```

---

## Task 4: CheckoutService — engine mới + race quota + FREE_PRODUCT + order_promotions

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/PromotionV2Test.php` (thêm phần checkout integration)

**Interfaces:**
- Consumes: engine Task 3 (`resolveAll`), models Task 2 (`OrderPromotion`, `PromotionAction`).
- Produces: checkout gọi engine mới; race quota lock; FREE_PRODUCT line 0đ; ghi order_promotions.

- [ ] **Step 1: Viết test fail (checkout integration)**

Thêm vào `tests/Feature/PromotionV2Test.php`:

```php
test('checkout: coupon ghi order_promotions + cap dung', function () {
    $admin = posAdmin();
    $coupon = promoV2(['type' => 'coupon', 'code' => 'CHECKOUT10']);
    addAction($coupon, 'discount_percent', 10, 20000);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'promotion_code' => 'CHECKOUT10',
    ])->assertOk()->assertJson(['success' => true]);

    // 10% của 50000 = 5000, cap 20000 → 5000
    $op = \App\Models\OrderPromotion::first();
    expect($op)->not->toBeNull();
    expect($op->promotion_id)->toBe($coupon->id);
    expect((float) $op->discount_applied)->toBe(5000.0);
    expect($coupon->fresh()->used_count)->toBe(1);
});

test('checkout: free_product them line 0d', function () {
    $admin = posAdmin();
    $free = posMenuItem(['price' => 15000, 'vat_rate' => 0]);
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'free_product', $free->id);
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
    ])->assertOk();

    $freeLine = \App\Models\InvoiceLine::where('menu_item_id', $free->id)->first();
    expect($freeLine)->not->toBeNull();
    expect((float) $freeLine->subtotal)->toBe(0.0);
    expect((float) $freeLine->unit_price)->toBe(0.0);
});

test('race: 2 checkout dong thoi khong vuot max_usage', function () {
    $admin = posAdmin();
    $coupon = promoV2(['type' => 'coupon', 'code' => 'RACE1', 'max_usage' => 1]);
    addAction($coupon, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $table = posTable();
    $o1 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);
    $o2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    // Chạy 2 checkout song song (Pest concurrent hoặc 2 request tuần tự với lock)
    $r1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o1->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => 'RACE1',
    ]);
    $r2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o2->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => 'RACE1',
    ]);

    // 1 thành công + 1 bị từ chối (hết quota) — hoặc 1 success + 1 lỗi 422
    expect($coupon->fresh()->used_count)->toBeLessThanOrEqual(1);
    expect(\App\Models\OrderPromotion::count())->toBeLessThanOrEqual(1);
});
```

**Lưu ý race test:** Pest không chạy thật song song 2 request. Cách khả thi: gọi 2 checkout tuần tự — request 1 dùng lock + increment (used_count 0→1), request 2 thấy used_count=1 = max_usage → bị reject (422 hoặc success nhưng không áp mã). Assert cuối: `used_count <= 1` + `OrderPromotion::count() <= 1`. Đây là kiểm tra logic quota đúng theo thứ tự, không phải đua thật (đua thật khó test đơn luồng — chấp nhận, logic lock đã đúng pattern). Nếu request 2 trả 422, assert response status phù hợp.

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\PromotionV2Test.php`
Expected: FAIL — CheckoutService vẫn dùng engine cũ + chưa ghi order_promotions/free_product.

- [ ] **Step 3: Sửa CheckoutService**

`app/Services/Checkout/CheckoutService.php`:
- Thêm imports: `use App\Models\OrderPromotion;` (Promotion đã có, PromotionEngine đã có, MenuItem đã có).
- **Bỏ** `use App\Models\Promotion;` nếu không còn dùng trực tiếp (kiểm tra — `Promotion::allocateLineDiscounts` đang dùng ở `:113` → sẽ xoá).

Thay block `:81-125` (resolve promotions cũ):

```php
            // 2. Resolve promotions (engine v2) trên lines shape engine
            $engineLines = collect($lineInputs)->map(fn ($l) => [
                'order_item_id' => $l['order_item_id'],
                'menu_item_id' => $l['menu_item_id'],
                'subtotal' => $l['subtotal'],
                'category_id' => $l['category_id'],
            ]);

            $promotionRows = [];
            $totalDiscount = 0.0;
            $freeItems = [];
            $appliedPromotions = [];

            if (! empty($promotionCodes) || Promotion::query()->where('type', 'promotion')->where('status', true)->exists()) {
                $resolved = PromotionEngine::resolveAll($promotionCodes, $engineLines, $subtotal, true);
                if ($resolved['status'] === 'rejected') {
                    throw new \Exception('Mã khuyến mãi '.($resolved['code'] ?? '').' không hợp lệ hoặc đã hết hạn.', 422);
                }
                $totalDiscount = $resolved['total_discount'];
                $freeItems = $resolved['free_items'] ?? [];
                $appliedPromotions = $resolved['promotions'] ?? [];

                foreach ($appliedPromotions as $pr) {
                    $p = $pr['promotion'];
                    $promotionRows[] = [
                        'promotion_id' => $p->id,
                        'code' => $p->code,
                        'name' => $p->name,
                        'discount_type' => $pr['actions_applied'][0]['type'] ?? $p->type,
                        'discount_value' => (float) ($pr['actions_applied'][0]['value'] ?? 0),
                        'stack_order' => 0,
                        'amount' => $pr['amount'],
                    ];
                }
            }
```

**Lưu ý:** `invoice_promotions` snapshot giờ lấy `discount_type`/`discount_value` từ action đầu tiên (engine không còn discount_type cột). Nếu 1 promotion có nhiều action, snapshot chỉ ghi action đầu — chấp nhận (snapshot hiển thị). Kiểm tra `invoice_promotions` có index required gì không (`discount_type` string, `discount_value` decimal — đã có từ migration payment_core).

Thay block `:226-230` (ghi invoice_promotions + increment):

```php
            // 7. Ghi invoice_promotions (snapshot)
            foreach ($promotionRows as $pr) {
                InvoicePromotion::create(array_merge($pr, ['invoice_id' => $invoice->id]));
            }

            // 7b. Ghi order_promotions (fact) + increment used_count (đã lock trong engine)
            foreach ($appliedPromotions as $pr) {
                $promo = $pr['promotion'];
                foreach ($orders as $order) {
                    OrderPromotion::create([
                        'invoice_id' => $invoice->id,
                        'order_id' => $order->id,
                        'promotion_id' => $promo->id,
                        'code_used' => $pr['code'],
                        'discount_applied' => $pr['amount'],
                    ]);
                }
            }
```

**Lưu ý:** `Promotion::increment('used_count')` cũ (`:229`) — engine đã increment trong lock (Task 3 Step 3 dùng `lockForUpdate` nhưng CHƯA increment — **cần thêm increment trong engine** ở Task 3 hoặc ở đây). **Quyết định:** thêm increment trong engine `resolveAll` khi `$lockForUpdate=true` (sau khi resolve thành công, trước return). Sửa Task 3 engine: trong vòng lặp pool, sau khi tính amount, `$p->increment('used_count')` (chỉ khi lockForUpdate). Thêm vào code engine.

- [ ] **Step 4: Sửa increment trong engine (Task 3 bổ sung)**

Trong `PromotionEngine::resolveAll`, vòng lặp áp dụng hành động, sau khi tính `$amount`, thêm:
```php
            if ($lockForUpdate) {
                $p->increment('used_count');
            }
```
(Với auto promotion cũng increment nếu lockForUpdate — vì auto áp dụng thì cũng dùng quota.)

- [ ] **Step 5: Sửa FREE_PRODUCT trong CheckoutService**

Trong transaction, sau khi tạo invoice_lines từ order_items (tìm chỗ tạo InvoiceLine — khoảng sau `:218`), thêm:

```php
            // 7c. FREE_PRODUCT: thêm line 0đ
            foreach ($freeItems as $free) {
                $mi = MenuItem::find($free['menu_item_id']);
                if (! $mi) {
                    continue;
                }
                InvoiceLine::create([
                    'invoice_id' => $invoice->id,
                    'menu_item_id' => $mi->id,
                    'name_snapshot' => $mi->name ?? 'Món tặng',
                    'quantity' => 1,
                    'unit_price' => 0,
                    'subtotal' => 0,
                    'vat_rate' => 0,
                    'vat_amount' => 0,
                    'discount_amount' => 0,
                ]);
            }
```

**Lưu ý:** đọc CheckoutService để tìm vị trí chính xác tạo InvoiceLine (khoảng `:190-220`), chèn sau đó. Kiểm tra InvoiceLine fillable có `menu_item_id` nullable (migration payment_core:28 nullable).

- [ ] **Step 6: Chạy test pass + regression**

Run: `php artisan test tests\Feature\PromotionV2Test.php` — PASS.
Run: `php artisan test tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php tests\Feature\PromotionDepositCheckoutTest.php` — chuyển đổi các test promotion cũ (Task 5) hoặc ghi nhận fail tạm.

- [ ] **Step 7: Commit**

```bash
git add app/Services/Checkout/CheckoutService.php app/Services/Promotions/PromotionEngine.php tests/Feature/PromotionV2Test.php
git commit -m "feat: checkout dung engine v2 + order_promotions + free_product + race quota increment"
```

---

## Task 5: PromotionController + validatePromotion — shape mới

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php`
- Modify: `app/Http/Controllers/Staff/PaymentController.php` (validatePromotion)
- Test: chuyển đổi 8 test promotion cũ

**Interfaces:**
- Consumes: engine Task 3, models Task 2.
- Produces: store/update ghi 3 bảng; validatePromotion gọi engine mới; test cũ chuyển đổi.

- [ ] **Step 1: Sửa PromotionController store/update**

`app/Http/Controllers/Manager/PromotionController.php` — thay `normalize`/`rules` bằng shape mới:

```php
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate($this->rules());

        DB::transaction(function () use ($validated) {
            $promotion = Promotion::create([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' ? null : mb_strtoupper(trim($validated['code'] ?? '')),
                'start_date' => $validated['start_date'] ?? null,
                'end_date' => $validated['end_date'] ?? null,
                'status' => $validated['status'] ?? true,
                'max_usage' => $validated['max_usage'] ?? null,
                'exclusive' => $validated['exclusive'] ?? false,
                'stackable' => $validated['stackable'] ?? true,
            ]);

            foreach ($validated['conditions'] ?? [] as $cond) {
                $promotion->conditions()->create($cond);
            }
            foreach ($validated['actions'] as $action) {
                $promotion->actions()->create([
                    'action_type' => $action['action_type'],
                    'action_value' => $action['action_value'],
                    'max_discount_amount' => $action['max_discount_amount'] ?? null,
                ]);
            }
        });

        return back()->with('success', 'Thêm khuyến mãi thành công!');
    }

    public function update(Request $request, Promotion $promotion): RedirectResponse
    {
        $validated = $request->validate($this->rules());

        DB::transaction(function () use ($validated, $promotion) {
            $promotion->update([
                'name' => $validated['name'],
                'type' => $validated['type'],
                'code' => $validated['type'] === 'promotion' ? null : mb_strtoupper(trim($validated['code'] ?? '')),
                'start_date' => $validated['start_date'] ?? null,
                'end_date' => $validated['end_date'] ?? null,
                'status' => $validated['status'] ?? true,
                'max_usage' => $validated['max_usage'] ?? null,
                'exclusive' => $validated['exclusive'] ?? false,
                'stackable' => $validated['stackable'] ?? true,
            ]);

            // Xoá conditions/actions cũ rồi tạo lại (update đơn giản, ít data)
            $promotion->conditions()->delete();
            $promotion->actions()->delete();
            foreach ($validated['conditions'] ?? [] as $cond) {
                $promotion->conditions()->create($cond);
            }
            foreach ($validated['actions'] as $action) {
                $promotion->actions()->create([
                    'action_type' => $action['action_type'],
                    'action_value' => $action['action_value'],
                    'max_discount_amount' => $action['max_discount_amount'] ?? null,
                ]);
            }
        });

        return back()->with('success', 'Cập nhật khuyến mãi thành công!');
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', Rule::in(['promotion', 'coupon', 'voucher'])],
            'code' => ['nullable', 'string', 'max:50'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'boolean'],
            'max_usage' => ['nullable', 'integer', 'min:1'],
            'exclusive' => ['sometimes', 'boolean'],
            'stackable' => ['sometimes', 'boolean'],
            'conditions' => ['nullable', 'array'],
            'conditions.*.cond_type' => ['required', Rule::in(['min_order_value', 'min_quantity', 'specific_product'])],
            'conditions.*.cond_value' => ['required', 'string'],
            'actions' => ['required', 'array', 'min:1'],
            'actions.*.action_type' => ['required', Rule::in(['discount_percent', 'discount_amount', 'free_product'])],
            'actions.*.action_value' => ['required', 'numeric', 'min:0'],
            'actions.*.max_discount_amount' => ['nullable', 'numeric', 'min:0'],
        ];
    }
```

**Lưu ý:** thêm `use Illuminate\Support\Facades\DB;`. `index` vẫn trả `promotions` — giờ nên eager-load conditions/actions: `$query->with(['conditions', 'actions'])->latest('id')->get()`. `destroy` giữ nguyên.

- [ ] **Step 2: Sửa validatePromotion**

`app/Http/Controllers/Staff/PaymentController.php::validatePromotion` — hiện dùng `PromotionEngine::resolveAll` + `$linesSubtotal`. Đổi:

```php
        $resolved = PromotionEngine::resolveAll($codes, $lines, (float) $linesSubtotal, false);
```
(với `$lines` đã là shape engine mới: `{order_item_id, menu_item_id, subtotal, category_id}` — xác nhận `$lines` hiện tại đã đúng shape). Response shape giữ nguyên (`ok/discount_amount/total/promotion/promotions`).

**Lưu ý:** đọc `validatePromotion` hiện tại (line 26-97 trong bản trước) — nó build `$lines` từ items, dùng `$linesSubtotal`. Engine mới chấp nhận shape này. Kiểm tra `$resolved['status'] === 'rejected'` → map reason strings mới (`condition_not_met` thay `below_min`/`no_eligible_line`).

- [ ] **Step 3: Chuyển đổi 8 test promotion cũ**

Cập nhật các test file (đọc từng file, đổi theo shape mới):
- `PromotionControllerTest` — store/update gửi `{type, name, actions:[...]}` thay `{code, discount_type, discount_value, target_type}`.
- `PromotionApplyTest` / `POSPromotionRejectMessagesTest` / `POSPromotionRejectReasonTest` — tạo promotion qua `promoV2()` helper (conditions/actions), assertion reason mới (`below_min` → `condition_not_met`, `no_eligible_line` → `condition_not_met`).
- `PromotionAllocationTest` — allocation line-level không còn → test chuyển thành assert tổng `total_discount` (hoặc xoá nếu chỉ test allocation cũ).
- `PromotionDepositCheckoutTest` / `PromotionSoftDeleteTest` — cập nhật tạo promotion + assert.
- `PromotionTest` — model test (eligibleLines/targetSubtotal/allocateLineDiscounts) → xoá/chuyển thành test relations.

**Lưu ý:** `makePromotion` helper trong `PromotionApplyTest` file-scoped — chuyển thành `promoV2()` global trong Pest.php hoặc mỗi test file. Thêm `promoV2`/`addCond`/`addAction` vào `tests/Pest.php` (global functions) để dùng chung.

- [ ] **Step 4: Chạy full suite pass**

Run: `php artisan test`
Expected: PASS (8 test cũ chuyển đổi + PromotionV2Test + 288+ test khác).

- [ ] **Step 5: Pint + commit**

Run: `vendor/bin/pint app/Http/Controllers/Manager/PromotionController.php app/Http/Controllers/Staff/PaymentController.php tests/`

```bash
git add app/Http/Controllers/Manager/PromotionController.php app/Http/Controllers/Staff/PaymentController.php tests/
git commit -m "feat: PromotionController + validatePromotion shape v2, chuyen doi 8 test promotion cu"
```

---

## Task 6: Final verification + migrate:fresh MySQL + regression

**Files:** không code — verify.

- [ ] **Step 1: Full suite**

Run: `php artisan test` — PASS toàn bộ.

- [ ] **Step 2: Pint**

Run: `vendor/bin/pint --dirty --test` — sạch.

- [ ] **Step 3: Frontend build**

Run: `npm run types:check` + `npm run build` — PASS (không đụng frontend, nhưng verify không vỡ do controller props đổi).

**Lưu ý:** `PromotionController::index` giờ trả promotions + conditions/actions — frontend `PromotionsManager` hiện đang render theo shape cũ (code/name/discount_type...). UI sẽ hơi lệch nhưng KHÔNG vỡ (spec 2 sẽ làm lại UI). Ghi nhận là expected.

- [ ] **Step 4: migrate:fresh MySQL + smoke**

Run: `php artisan migrate:fresh` + `php artisan db:seed` (MySQL) — OK.
Smoke: tạo promotion mới (qua tinker hoặc curl POST) với conditions/actions → checkout áp dụng → order_promotions ghi → used_count tăng.

- [ ] **Step 5: Fix phát sinh + commit nếu cần**

Nếu smoke phát hiện bug → fix + commit riêng.

---

## Final verification checklist

- [ ] `php artisan test` — pass (288+ + PromotionV2Test, 8 test cũ chuyển đổi)
- [ ] `vendor/bin/pint --dirty --test` — sạch
- [ ] `npm run types:check` + `npm run build` — pass
- [ ] `php artisan migrate:fresh` + `db:seed` MySQL — OK, orders không mất data
- [ ] Smoke: tạo promotion → checkout → order_promotions + used_count
- [ ] `git status` — tree sạch
