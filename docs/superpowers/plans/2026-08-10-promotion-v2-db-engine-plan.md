# Promotion v2 â€” DB + Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TÃ¡ch schema promotions 1 báº£ng thÃ nh 4 báº£ng (promotions v2 + promotion_conditions + promotion_actions + order_promotions), viáº¿t láº¡i engine há»— trá»£ 3 loáº¡i (PROMOTION/COUPON/VOUCHER), nhiá»u Ä‘iá»u kiá»‡n AND, nhiá»u hÃ nh Ä‘á»™ng Ä‘á»“ng thá»i, FREE_PRODUCT, race-condition-safe quota. KHÃ”NG máº¥t dá»¯ liá»‡u (Ä‘Ã£ xÃ¡c minh: promotions báº£ng rá»—ng, orders.promotion_id toÃ n null, invoice_promotions rá»—ng).

**Architecture:** Migration rename `promotions`â†’`legacy_promotions`, táº¡o 4 báº£ng má»›i, drop FK `orders.promotion_id`, drop legacy. Model Promotion giá»¯ tÃªn (báº£ng má»›i cÃ¹ng tÃªn). Engine viáº¿t láº¡i theo conditions/actions. CheckoutService gá»i engine má»›i + lockForUpdate quota + ghi order_promotions + FREE_PRODUCT line 0Ä‘.

**Tech Stack:** Laravel 13, PHP, Pest, MySQL (dev) / SQLite (test).

**Spec:** `docs/superpowers/specs/2026-08-10-promotion-v2-db-engine-design.md`

## Global Constraints

- PowerShell Windows: KHÃ”NG dÃ¹ng `&&`; cháº¡y `php artisan test ...` nhÆ° lá»‡nh Ä‘Æ¡n.
- **KHÃ”NG máº¥t dá»¯ liá»‡u:** migration pháº£i rename-before-create (khÃ´ng drop báº£ng cÃ³ FK orders trá» tá»›i). Verify: orders.promotion_id toÃ n null hiá»‡n táº¡i â†’ drop column an toÃ n.
- Má»—i task TDD: test fail â†’ sá»­a â†’ pass â†’ commit.
- Engine má»›i: 3 loáº¡i promotion; conditions AND; actions Ä‘á»“ng thá»i; FREE_PRODUCT thÃªm line 0Ä‘; exclusive/stackable; race quota lockForUpdate.
- `order_promotions.discount_applied` ghi Tá»”NG discount per mÃ£ (khÃ´ng line-level). Ghi per-order (bulk checkout nhiá»u order â†’ nhiá»u dÃ²ng).
- `invoice_promotions` snapshot giá»¯ nguyÃªn shape cÅ© (code/name/discount_type/discount_value/amount).
- Bá» khá»i Promotion model: `target_type`/`target_value`/`min_order_amount`/`max_discount_amount` cá»™t + `eligibleLines`/`targetSubtotal`/`allocateLineDiscounts`.
- Reason strings má»›i: `not_found`/`inactive`/`not_started`/`expired`/`out_of_uses`/`condition_not_met`/`exclusive_conflict`.
- KhÃ´ng Ä‘á»•i UI (spec 2), khÃ´ng lÃ m analytics (spec 3).
- Route CRUD promotions giá»¯ nguyÃªn tÃªn.

---

## File Structure

**Migration:** `database/migrations/2026_08_10_000014_create_promotion_v2_tables.php`

**Models:** `Promotion` (sá»­a), `PromotionCondition` (má»›i), `PromotionAction` (má»›i), `OrderPromotion` (má»›i).

**Services:** `PromotionEngine` (viáº¿t láº¡i), `CheckoutService` (sá»­a).

**Controllers:** `PromotionController` (store/update), `PaymentController::validatePromotion` (sá»­a call engine).

**Tests:** `PromotionV2Test.php` (má»›i â€” conditions/actions/types/race) + `MigrationRebuildTest` (thÃªm assert báº£ng má»›i) + chuyá»ƒn Ä‘á»•i 8 test cÅ©.

---

## Task 1: Migration 4 báº£ng má»›i + drop legacy

**Files:**
- Create: `database/migrations/2026_08_10_000014_create_promotion_v2_tables.php`
- Modify: `tests/Feature/MigrationRebuildTest.php` (thÃªm assert)

**Interfaces:**
- Produces: báº£ng `promotions` v2 + `promotion_conditions` + `promotion_actions` + `order_promotions`; `legacy_promotions` + `orders.promotion_id` biáº¿n máº¥t. CÃ¡c task sau phá»¥ thuá»™c schema nÃ y.

- [ ] **Step 1: Viáº¿t test fail**

ThÃªm vÃ o `tests/Feature/MigrationRebuildTest.php`:

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

- [ ] **Step 2: Cháº¡y test fail**

Run: `php artisan test tests\Feature\MigrationRebuildTest.php`
Expected: FAIL â€” cÃ¡c báº£ng má»›i chÆ°a tá»“n táº¡i, orders.promotion_id váº«n cÃ²n.

- [ ] **Step 3: Táº¡o migration**

Táº¡o `database/migrations/2026_08_10_000014_create_promotion_v2_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Rename promotions cÅ© -> legacy (giá»¯ FK orders nguyÃªn váº¹n táº¡m thá»i)
        Schema::rename('promotions', 'legacy_promotions');

        // 2. Táº¡o promotions v2
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

        // 3. Táº¡o promotion_conditions
        Schema::create('promotion_conditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->enum('cond_type', ['min_order_value', 'min_quantity', 'specific_product']);
            $table->string('cond_value');
            $table->timestamps();
        });

        // 4. Táº¡o promotion_actions
        Schema::create('promotion_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->enum('action_type', ['discount_percent', 'discount_amount', 'free_product']);
            $table->decimal('action_value', 15, 2);
            $table->decimal('max_discount_amount', 15, 2)->nullable();
            $table->timestamps();
        });

        // 5. Táº¡o order_promotions
        Schema::create('order_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->string('code_used')->nullable();
            $table->decimal('discount_applied', 15, 2);
            $table->timestamps();
        });

        // 6. Drop FK + column orders.promotion_id (an toÃ n: toÃ n null)
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

**LÆ°u Ã½:** `orders.promotion_id` hiá»‡n táº¡i lÃ  FK `constrained('promotions')` nullOnDelete (tá»« migration cÅ©). `dropForeign(['promotion_id'])` â€” Laravel tá»± tÃ¬m tÃªn FK theo convention. Náº¿u tÃªn khÃ¡c, dÃ¹ng tÃªn FK thá»±c (kiá»ƒm tra `SHOW CREATE TABLE orders` hoáº·c thá»­ cháº¡y). Migration nÃ y lÃ  migration Má»šI (khÃ´ng sá»­a file cÅ©) â€” cháº¡y sau khi DB Ä‘Ã£ migrate tá»›i `2026_08_10_000012_create_otp_codes_table`.

- [ ] **Step 4: Cháº¡y migrate + test pass**

Run: `php artisan migrate`
Run: `php artisan test tests\Feature\MigrationRebuildTest.php`
Expected: PASS.

- [ ] **Step 5: Verify MySQL + data integrity**

Run: `php artisan migrate:fresh` (MySQL HeThongTapHoa) â€” 16 migrations OK.
Verify: `orders` váº«n 16 dÃ²ng (khÃ´ng máº¥t data); `promotions` báº£ng má»›i rá»—ng; `legacy_promotions` khÃ´ng tá»“n táº¡i.
Cháº¡y script kiá»ƒm tra: Ä‘áº¿m orders trÆ°á»›c/sau migrate:fresh â€” pháº£i báº±ng nhau.

- [ ] **Step 6: Full suite**

Run: `php artisan test`
Expected: FAIL cÃ¡c test promotion cÅ© (PromotionControllerTest, PromotionApplyTest, POSPromotionRejectMessagesTest, v.v.) â€” dÃ¹ng cá»™t cÅ©. **Ghi nháº­n lÃ  expected** (Task 3-5 sáº½ xá»­ lÃ½).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_08_10_000014_create_promotion_v2_tables.php tests/Feature/MigrationRebuildTest.php
git commit -m "feat: promotion v2 - 4 bang moi (promotions/conditions/actions/order_promotions) + drop legacy"
```

---

## Task 2: Models má»›i + sá»­a Promotion model

**Files:**
- Create: `app/Models/PromotionCondition.php`, `app/Models/PromotionAction.php`, `app/Models/OrderPromotion.php`
- Modify: `app/Models/Promotion.php`

**Interfaces:**
- Consumes: schema Task 1.
- Produces: 4 models vá»›i relations; `Promotion` bá» cá»™t cÅ©. Task 3 (engine) dÃ¹ng `$promotion->conditions`/`$promotion->actions`.

- [ ] **Step 1: Táº¡o 3 model má»›i**

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

- [ ] **Step 2: Sá»­a Promotion model**

`app/Models/Promotion.php` â€” Ä‘á»•i `$fillable` + casts + bá» methods cÅ© + thÃªm relations:

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

**XoÃ¡:** `eligibleLines`, `targetSubtotal`, `allocateLineDiscounts` (static methods cÅ©).

- [ ] **Step 3: Types/build khÃ´ng Ã¡p dá»¥ng (backend). Full suite ghi nháº­n fail promotion cÅ©**

Run: `php artisan test`
Expected: váº«n fail cÃ¡c test promotion cÅ© (Task 3-5 xá»­ lÃ½). KhÃ´ng cÃ³ fail má»›i do model (cÃ¡c model má»›i chÆ°a Ä‘Æ°á»£c gá»i).

- [ ] **Step 4: Commit**

```bash
git add app/Models/PromotionCondition.php app/Models/PromotionAction.php app/Models/OrderPromotion.php app/Models/Promotion.php
git commit -m "feat: models promotion v2 (condition/action/order_promotion) + bo target/allocate cu"
```

---

## Task 3: Engine má»›i (PromotionEngine viáº¿t láº¡i)

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php`
- Test: `tests/Feature/PromotionV2Test.php` (má»›i â€” pháº§n conditions/actions/types)

**Interfaces:**
- Consumes: models Task 2 (`$promotion->conditions`/`->actions`).
- Produces: `PromotionEngine::resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array` tráº£ `{status, promotions?, total_discount?, free_items?, reason?, code?}`. Task 4 (checkout) gá»i.

- [ ] **Step 1: Viáº¿t test fail**

Táº¡o `tests/Feature/PromotionV2Test.php` (pháº§n 1 â€” conditions/actions/type/stack):

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

    // Äá»§ 3 mÃ³n + cÃ³ mÃ³n 10 â†’ OK
    $res = PromotionEngine::resolveAll([], $lines(), 150000);
    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(20000.0);

    // Thiáº¿u mÃ³n 10 â†’ reject
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
    expect(count($res['promotions']))->toBe(1);  // chá»‰ 1 promotion tá»‘t nháº¥t
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

    // Nháº­p mÃ£ SAVE10 â†’ chá»‰ mÃ£, KHÃ”NG promotion tá»± Ä‘á»™ng (máº·c Ä‘á»‹nh auto khÃ´ng stack khi cÃ³ mÃ£?)
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

**LÆ°u Ã½:** cÃ¡c test nÃ y dÃ¹ng `Promotion::create` vá»›i fillable má»›i (Task 2). Kiá»ƒm tra logic "auto khÃ´ng stack khi cÃ³ mÃ£" â€” spec nÃ³i PROMOTION tá»± Ä‘á»™ng bá»‹ loáº¡i náº¿u cÃ³ COUPON stackable=false; test trÃªn giáº£ Ä‘á»‹nh máº·c Ä‘á»‹nh. **Äá»c spec Pháº§n 3 BÆ°á»›c 2 trÆ°á»›c khi viáº¿t** â€” náº¿u auto váº«n cháº¡y khi cÃ³ mÃ£ stackable=true thÃ¬ Ä‘iá»u chá»‰nh test (vd coupon stackable=false Ä‘á»ƒ cháº·n auto). Giá»¯ test Ä‘Ãºng Ã½ spec.

- [ ] **Step 2: Cháº¡y test fail**

Run: `php artisan test tests\Feature\PromotionV2Test.php`
Expected: FAIL â€” engine cÅ© chÆ°a há»— trá»£ conditions/actions.

- [ ] **Step 3: Viáº¿t láº¡i PromotionEngine**

`app/Services/Promotions/PromotionEngine.php` (thay toÃ n bá»™):

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

        // 1. COUPON/VOUCHER tá»« mÃ£ nháº­p
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

        // 2. exclusive: 1 mÃ£ exclusive â†’ bá» háº¿t khÃ¡c
        if (count($codePromotions) > 1) {
            $exclusive = collect($codePromotions)->first(fn ($p) => $p->exclusive);
            if ($exclusive) {
                $codePromotions = [$exclusive];
            }
        }

        // 3. PROMOTION tá»± Ä‘á»™ng: quÃ©t, lá»c thoáº£ Ä‘iá»u kiá»‡n, chá»n tá»‘t nháº¥t
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

        // 4. Gá»™p pool: mÃ£ trÆ°á»›c, auto sau
        $pool = $codePromotions;
        if ($auto && collect($codePromotions)->doesntContain(fn ($p) => $p->exclusive)) {
            $pool[] = $auto;
        }

        // 5. Ãp dá»¥ng hÃ nh Ä‘á»™ng
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

**LÆ°u Ã½:** `free_product` action_value lÆ°u decimal â€” khi cast `(int)` Ä‘á»ƒ tÃ¬m MenuItem. Kiá»ƒm tra `MenuItem` import. `estimateDiscount` khÃ´ng tÃ­nh free_product (khÃ´ng biáº¿t giÃ¡ trá»‹) â€” chá»‰ cho viá»‡c chá»n auto tá»‘t nháº¥t theo discount tiá»n.

- [ ] **Step 4: Cháº¡y test pass**

Run: `php artisan test tests\Feature\PromotionV2Test.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php tests/Feature/PromotionV2Test.php
git commit -m "feat: PromotionEngine v2 (conditions AND, actions dong thoi, auto chon tot nhat, free_product, exclusive/stackable)"
```

---

## Task 4: CheckoutService â€” engine má»›i + race quota + FREE_PRODUCT + order_promotions

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/PromotionV2Test.php` (thÃªm pháº§n checkout integration)

**Interfaces:**
- Consumes: engine Task 3 (`resolveAll`), models Task 2 (`OrderPromotion`, `PromotionAction`).
- Produces: checkout gá»i engine má»›i; race quota lock; FREE_PRODUCT line 0Ä‘; ghi order_promotions.

- [ ] **Step 1: Viáº¿t test fail (checkout integration)**

ThÃªm vÃ o `tests/Feature/PromotionV2Test.php`:

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

    // 10% cá»§a 50000 = 5000, cap 20000 â†’ 5000
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

    // Cháº¡y 2 checkout song song (Pest concurrent hoáº·c 2 request tuáº§n tá»± vá»›i lock)
    $r1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o1->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => 'RACE1',
    ]);
    $r2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o2->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => 'RACE1',
    ]);

    // 1 thÃ nh cÃ´ng + 1 bá»‹ tá»« chá»‘i (háº¿t quota) â€” hoáº·c 1 success + 1 lá»—i 422
    expect($coupon->fresh()->used_count)->toBeLessThanOrEqual(1);
    expect(\App\Models\OrderPromotion::count())->toBeLessThanOrEqual(1);
});
```

**LÆ°u Ã½ race test:** Pest khÃ´ng cháº¡y tháº­t song song 2 request. CÃ¡ch kháº£ thi: gá»i 2 checkout tuáº§n tá»± â€” request 1 dÃ¹ng lock + increment (used_count 0â†’1), request 2 tháº¥y used_count=1 = max_usage â†’ bá»‹ reject (422 hoáº·c success nhÆ°ng khÃ´ng Ã¡p mÃ£). Assert cuá»‘i: `used_count <= 1` + `OrderPromotion::count() <= 1`. ÄÃ¢y lÃ  kiá»ƒm tra logic quota Ä‘Ãºng theo thá»© tá»±, khÃ´ng pháº£i Ä‘ua tháº­t (Ä‘ua tháº­t khÃ³ test Ä‘Æ¡n luá»“ng â€” cháº¥p nháº­n, logic lock Ä‘Ã£ Ä‘Ãºng pattern). Náº¿u request 2 tráº£ 422, assert response status phÃ¹ há»£p.

- [ ] **Step 2: Cháº¡y test fail**

Run: `php artisan test tests\Feature\PromotionV2Test.php`
Expected: FAIL â€” CheckoutService váº«n dÃ¹ng engine cÅ© + chÆ°a ghi order_promotions/free_product.

- [ ] **Step 3: Sá»­a CheckoutService**

`app/Services/Checkout/CheckoutService.php`:
- ThÃªm imports: `use App\Models\OrderPromotion;` (Promotion Ä‘Ã£ cÃ³, PromotionEngine Ä‘Ã£ cÃ³, MenuItem Ä‘Ã£ cÃ³).
- **Bá»** `use App\Models\Promotion;` náº¿u khÃ´ng cÃ²n dÃ¹ng trá»±c tiáº¿p (kiá»ƒm tra â€” `Promotion::allocateLineDiscounts` Ä‘ang dÃ¹ng á»Ÿ `:113` â†’ sáº½ xoÃ¡).

Thay block `:81-125` (resolve promotions cÅ©):

```php
            // 2. Resolve promotions (engine v2) trÃªn lines shape engine
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
                    throw new \Exception('MÃ£ khuyáº¿n mÃ£i '.($resolved['code'] ?? '').' khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.', 422);
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

**LÆ°u Ã½:** `invoice_promotions` snapshot giá» láº¥y `discount_type`/`discount_value` tá»« action Ä‘áº§u tiÃªn (engine khÃ´ng cÃ²n discount_type cá»™t). Náº¿u 1 promotion cÃ³ nhiá»u action, snapshot chá»‰ ghi action Ä‘áº§u â€” cháº¥p nháº­n (snapshot hiá»ƒn thá»‹). Kiá»ƒm tra `invoice_promotions` cÃ³ index required gÃ¬ khÃ´ng (`discount_type` string, `discount_value` decimal â€” Ä‘Ã£ cÃ³ tá»« migration payment_core).

Thay block `:226-230` (ghi invoice_promotions + increment):

```php
            // 7. Ghi invoice_promotions (snapshot)
            foreach ($promotionRows as $pr) {
                InvoicePromotion::create(array_merge($pr, ['invoice_id' => $invoice->id]));
            }

            // 7b. Ghi order_promotions (fact) + increment used_count (Ä‘Ã£ lock trong engine)
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

**LÆ°u Ã½:** `Promotion::increment('used_count')` cÅ© (`:229`) â€” engine Ä‘Ã£ increment trong lock (Task 3 Step 3 dÃ¹ng `lockForUpdate` nhÆ°ng CHÆ¯A increment â€” **cáº§n thÃªm increment trong engine** á»Ÿ Task 3 hoáº·c á»Ÿ Ä‘Ã¢y). **Quyáº¿t Ä‘á»‹nh:** thÃªm increment trong engine `resolveAll` khi `$lockForUpdate=true` (sau khi resolve thÃ nh cÃ´ng, trÆ°á»›c return). Sá»­a Task 3 engine: trong vÃ²ng láº·p pool, sau khi tÃ­nh amount, `$p->increment('used_count')` (chá»‰ khi lockForUpdate). ThÃªm vÃ o code engine.

- [ ] **Step 4: Sá»­a increment trong engine (Task 3 bá»• sung)**

Trong `PromotionEngine::resolveAll`, vÃ²ng láº·p Ã¡p dá»¥ng hÃ nh Ä‘á»™ng, sau khi tÃ­nh `$amount`, thÃªm:
```php
            if ($lockForUpdate) {
                $p->increment('used_count');
            }
```
(Vá»›i auto promotion cÅ©ng increment náº¿u lockForUpdate â€” vÃ¬ auto Ã¡p dá»¥ng thÃ¬ cÅ©ng dÃ¹ng quota.)

- [ ] **Step 5: Sá»­a FREE_PRODUCT trong CheckoutService**

Trong transaction, sau khi táº¡o invoice_lines tá»« order_items (tÃ¬m chá»— táº¡o InvoiceLine â€” khoáº£ng sau `:218`), thÃªm:

```php
            // 7c. FREE_PRODUCT: thÃªm line 0Ä‘
            foreach ($freeItems as $free) {
                $mi = MenuItem::find($free['menu_item_id']);
                if (! $mi) {
                    continue;
                }
                InvoiceLine::create([
                    'invoice_id' => $invoice->id,
                    'menu_item_id' => $mi->id,
                    'name_snapshot' => $mi->name ?? 'MÃ³n táº·ng',
                    'quantity' => 1,
                    'unit_price' => 0,
                    'subtotal' => 0,
                    'vat_rate' => 0,
                    'vat_amount' => 0,
                    'discount_amount' => 0,
                ]);
            }
```

**LÆ°u Ã½:** Ä‘á»c CheckoutService Ä‘á»ƒ tÃ¬m vá»‹ trÃ­ chÃ­nh xÃ¡c táº¡o InvoiceLine (khoáº£ng `:190-220`), chÃ¨n sau Ä‘Ã³. Kiá»ƒm tra InvoiceLine fillable cÃ³ `menu_item_id` nullable (migration payment_core:28 nullable).

- [ ] **Step 6: Cháº¡y test pass + regression**

Run: `php artisan test tests\Feature\PromotionV2Test.php` â€” PASS.
Run: `php artisan test tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php tests\Feature\PromotionDepositCheckoutTest.php` â€” chuyá»ƒn Ä‘á»•i cÃ¡c test promotion cÅ© (Task 5) hoáº·c ghi nháº­n fail táº¡m.

- [ ] **Step 7: Commit**

```bash
git add app/Services/Checkout/CheckoutService.php app/Services/Promotions/PromotionEngine.php tests/Feature/PromotionV2Test.php
git commit -m "feat: checkout dung engine v2 + order_promotions + free_product + race quota increment"
```

---

## Task 5: PromotionController + validatePromotion â€” shape má»›i

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php`
- Modify: `app/Http/Controllers/Staff/PaymentController.php` (validatePromotion)
- Test: chuyá»ƒn Ä‘á»•i 8 test promotion cÅ©

**Interfaces:**
- Consumes: engine Task 3, models Task 2.
- Produces: store/update ghi 3 báº£ng; validatePromotion gá»i engine má»›i; test cÅ© chuyá»ƒn Ä‘á»•i.

- [ ] **Step 1: Sá»­a PromotionController store/update**

`app/Http/Controllers/Manager/PromotionController.php` â€” thay `normalize`/`rules` báº±ng shape má»›i:

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

        return back()->with('success', 'ThÃªm khuyáº¿n mÃ£i thÃ nh cÃ´ng!');
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

            // XoÃ¡ conditions/actions cÅ© rá»“i táº¡o láº¡i (update Ä‘Æ¡n giáº£n, Ã­t data)
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

        return back()->with('success', 'Cáº­p nháº­t khuyáº¿n mÃ£i thÃ nh cÃ´ng!');
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

**LÆ°u Ã½:** thÃªm `use Illuminate\Support\Facades\DB;`. `index` váº«n tráº£ `promotions` â€” giá» nÃªn eager-load conditions/actions: `$query->with(['conditions', 'actions'])->latest('id')->get()`. `destroy` giá»¯ nguyÃªn.

- [ ] **Step 2: Sá»­a validatePromotion**

`app/Http/Controllers/Staff/PaymentController.php::validatePromotion` â€” hiá»‡n dÃ¹ng `PromotionEngine::resolveAll` + `$linesSubtotal`. Äá»•i:

```php
        $resolved = PromotionEngine::resolveAll($codes, $lines, (float) $linesSubtotal, false);
```
(vá»›i `$lines` Ä‘Ã£ lÃ  shape engine má»›i: `{order_item_id, menu_item_id, subtotal, category_id}` â€” xÃ¡c nháº­n `$lines` hiá»‡n táº¡i Ä‘Ã£ Ä‘Ãºng shape). Response shape giá»¯ nguyÃªn (`ok/discount_amount/total/promotion/promotions`).

**LÆ°u Ã½:** Ä‘á»c `validatePromotion` hiá»‡n táº¡i (line 26-97 trong báº£n trÆ°á»›c) â€” nÃ³ build `$lines` tá»« items, dÃ¹ng `$linesSubtotal`. Engine má»›i cháº¥p nháº­n shape nÃ y. Kiá»ƒm tra `$resolved['status'] === 'rejected'` â†’ map reason strings má»›i (`condition_not_met` thay `below_min`/`no_eligible_line`).

- [ ] **Step 3: Chuyá»ƒn Ä‘á»•i 8 test promotion cÅ©**

Cáº­p nháº­t cÃ¡c test file (Ä‘á»c tá»«ng file, Ä‘á»•i theo shape má»›i):
- `PromotionControllerTest` â€” store/update gá»­i `{type, name, actions:[...]}` thay `{code, discount_type, discount_value, target_type}`.
- `PromotionApplyTest` / `POSPromotionRejectMessagesTest` / `POSPromotionRejectReasonTest` â€” táº¡o promotion qua `promoV2()` helper (conditions/actions), assertion reason má»›i (`below_min` â†’ `condition_not_met`, `no_eligible_line` â†’ `condition_not_met`).
- `PromotionAllocationTest` â€” allocation line-level khÃ´ng cÃ²n â†’ test chuyá»ƒn thÃ nh assert tá»•ng `total_discount` (hoáº·c xoÃ¡ náº¿u chá»‰ test allocation cÅ©).
- `PromotionDepositCheckoutTest` / `PromotionSoftDeleteTest` â€” cáº­p nháº­t táº¡o promotion + assert.
- `PromotionTest` â€” model test (eligibleLines/targetSubtotal/allocateLineDiscounts) â†’ xoÃ¡/chuyá»ƒn thÃ nh test relations.

**LÆ°u Ã½:** `makePromotion` helper trong `PromotionApplyTest` file-scoped â€” chuyá»ƒn thÃ nh `promoV2()` global trong Pest.php hoáº·c má»—i test file. ThÃªm `promoV2`/`addCond`/`addAction` vÃ o `tests/Pest.php` (global functions) Ä‘á»ƒ dÃ¹ng chung.

- [ ] **Step 4: Cháº¡y full suite pass**

Run: `php artisan test`
Expected: PASS (8 test cÅ© chuyá»ƒn Ä‘á»•i + PromotionV2Test + 288+ test khÃ¡c).

- [ ] **Step 5: Pint + commit**

Run: `vendor/bin/pint app/Http/Controllers/Manager/PromotionController.php app/Http/Controllers/Staff/PaymentController.php tests/`

```bash
git add app/Http/Controllers/Manager/PromotionController.php app/Http/Controllers/Staff/PaymentController.php tests/
git commit -m "feat: PromotionController + validatePromotion shape v2, chuyen doi 8 test promotion cu"
```

---

## Task 6: Final verification + migrate:fresh MySQL + regression

**Files:** khÃ´ng code â€” verify.

- [ ] **Step 1: Full suite**

Run: `php artisan test` â€” PASS toÃ n bá»™.

- [ ] **Step 2: Pint**

Run: `vendor/bin/pint --dirty --test` â€” sáº¡ch.

- [ ] **Step 3: Frontend build**

Run: `npm run types:check` + `npm run build` â€” PASS (khÃ´ng Ä‘á»¥ng frontend, nhÆ°ng verify khÃ´ng vá»¡ do controller props Ä‘á»•i).

**LÆ°u Ã½:** `PromotionController::index` giá» tráº£ promotions + conditions/actions â€” frontend `PromotionsManager` hiá»‡n Ä‘ang render theo shape cÅ© (code/name/discount_type...). UI sáº½ hÆ¡i lá»‡ch nhÆ°ng KHÃ”NG vá»¡ (spec 2 sáº½ lÃ m láº¡i UI). Ghi nháº­n lÃ  expected.

- [ ] **Step 4: migrate:fresh MySQL + smoke**

Run: `php artisan migrate:fresh` + `php artisan db:seed` (MySQL) â€” OK.
Smoke: táº¡o promotion má»›i (qua tinker hoáº·c curl POST) vá»›i conditions/actions â†’ checkout Ã¡p dá»¥ng â†’ order_promotions ghi â†’ used_count tÄƒng.

- [ ] **Step 5: Fix phÃ¡t sinh + commit náº¿u cáº§n**

Náº¿u smoke phÃ¡t hiá»‡n bug â†’ fix + commit riÃªng.

---

## Final verification checklist

- [ ] `php artisan test` â€” pass (288+ + PromotionV2Test, 8 test cÅ© chuyá»ƒn Ä‘á»•i)
- [ ] `vendor/bin/pint --dirty --test` â€” sáº¡ch
- [ ] `npm run types:check` + `npm run build` â€” pass
- [ ] `php artisan migrate:fresh` + `db:seed` MySQL â€” OK, orders khÃ´ng máº¥t data
- [ ] Smoke: táº¡o promotion â†’ checkout â†’ order_promotions + used_count
- [ ] `git status` â€” tree sáº¡ch
