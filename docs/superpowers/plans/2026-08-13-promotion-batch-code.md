# Phát hành mã hàng loạt (Coupon chuỗi + Voucher ngẫu nhiên + Export Excel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép tạo 1 campaign promotion kèm N mã con (coupon số thứ tự `PREFIX-001…` hoặc voucher ngẫu nhiên `DK123…`) lưu ở bảng riêng `promotion_codes` (không loãng DB), áp dụng được tại POS mỗi mã 1 lần, và export Excel.

**Architecture:** Thêm bảng `promotion_codes` (promotion_id, code unique, status, used_at, used_invoice_id) + 3 cột vào `promotions` (`code_prefix`, `code_quantity`, `code_random`). `PromotionCodeService::generate` sinh mã bằng bulk insert. `PromotionEngine` query mã con trước (index unique, case-insensitive), fallback mã lẻ cũ; khi checkout đánh dấu mã used qua `lockForUpdate`. Export Excel dùng `exportXLSX` có sẵn (frontend-side).

**Tech Stack:** Laravel 12 (PHP 8.3), MySQL/SQLite test, Inertia + React 19 + TypeScript, Pest, exceljs (lazy import).

## Global Constraints

- Mã con chuẩn hoá `mb_strtoupper(trim())` trước khi so sánh; query `promotion_codes` theo `UPPER(code) = ?` (index unique, case-insensitive).
- Mỗi mã con dùng đúng 1 lần; khi checkout chuyển `unused → used` + set `used_at` + `used_invoice_id` qua `lockForUpdate` (race-safe).
- Campaign `used_count` vẫn tăng khi mã con được dùng (phục vụ KPI/hiệu suất).
- Backward compatible: mã lẻ `promotions.code` cũ giữ nguyên hành vi.
- `code_quantity` giới hạn 1–100.000; sinh random retry tối đa 50 lần.
- Bảng chữ cái sinh random: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (bỏ 0/O/1/I).
- Export Excel dùng `exportXLSX` từ `resources/js/components/reports/reportExport.ts`; frontend gọi `GET /manager/promotions/{promotion}/codes?export=1` (trả toàn bộ mã, no pagination).
- Spec: `docs/superpowers/specs/2026-08-13-promotion-batch-code-design.md`

---

### Task 1: Migration + Models (promotion_codes, cột batch trên promotions)

**Files:**
- Create: `database/migrations/2026_08_13_000001_create_promotion_codes_table.php`
- Create: `database/migrations/2026_08_13_000002_add_batch_columns_to_promotions.php`
- Create: `app/Models/PromotionCode.php`
- Modify: `app/Models/Promotion.php` (fillable, casts, hasMany)

**Interfaces:**
- Produces: model `PromotionCode` với `fillable = ['promotion_id','code','status','used_at','used_invoice_id']`; `casts = ['status' => 'string', 'used_at' => 'datetime']`.
- Produces: `Promotion::codes()` hasMany; `Promotion` fillable thêm `code_prefix`, `code_quantity`, `code_random`; casts `code_quantity => 'int'`, `code_random => 'bool'`.

- [ ] **Step 1: Viết migration bảng promotion_codes**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotion_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->string('code', 50)->unique();
            $table->enum('status', ['unused', 'used'])->default('unused');
            $table->timestamp('used_at')->nullable();
            $table->foreignId('used_invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_codes');
    }
};
```

- [ ] **Step 2: Viết migration thêm cột batch vào promotions**

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
            $table->string('code_prefix', 30)->nullable()->after('code');
            $table->integer('code_quantity')->nullable()->after('code_prefix');
            $table->boolean('code_random')->default(false)->after('code_quantity');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn(['code_prefix', 'code_quantity', 'code_random']);
        });
    }
};
```

- [ ] **Step 3: Tạo model PromotionCode**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionCode extends Model
{
    protected $fillable = ['promotion_id', 'code', 'status', 'used_at', 'used_invoice_id'];

    protected $casts = [
        'status' => 'string',
        'used_at' => 'datetime',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
```

- [ ] **Step 4: Cập nhật Promotion model**

Thêm vào `$fillable`: `'code_prefix', 'code_quantity', 'code_random'`.
Thêm vào `$casts`: `'code_quantity' => 'int', 'code_random' => 'bool'`.
Thêm relation:
```php
public function codes(): \Illuminate\Database\Eloquent\Relations\HasMany
{
    return $this->hasMany(PromotionCode::class);
}
```

- [ ] **Step 5: Chạy migration + test**

Run: `php artisan migrate`
Run: `php artisan test --filter='MigrationRebuildTest'`
Expected: PASS — bảng `promotion_codes` và cột mới tồn tại.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_08_13_000001_create_promotion_codes_table.php database/migrations/2026_08_13_000002_add_batch_columns_to_promotions.php app/Models/PromotionCode.php app/Models/Promotion.php
git commit -m "feat: bang promotion_codes + cot batch code tren promotions"
```

---

### Task 2: PromotionCodeService — sinh mã (coupon số thứ tự / voucher random)

**Files:**
- Create: `app/Services/Promotions/PromotionCodeService.php`
- Test: `tests/Feature/PromotionCodeServiceTest.php`

**Interfaces:**
- Consumes: `Promotion` model (đã có `code_prefix`, `code_quantity`, `code_random`, `codes()`).
- Produces: `PromotionCodeService::generate(Promotion $promotion): void` — sinh và bulk insert mã con.
- Produces: `PromotionCodeService::assertPrefixAvailable(string $prefix): void` — ném `\InvalidArgumentException('Prefix đã được sử dụng, vui lòng chọn prefix khác.')` nếu trùng.

- [ ] **Step 1: Viết failing test**

Tạo `tests/Feature/PromotionCodeServiceTest.php`:

```php
<?php

use App\Models\Promotion;
use App\Models\PromotionCode;
use App\Services\Promotions\PromotionCodeService;

test('coupon sinh ma so thu tu dung format prefix-001...', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'GIAM30', 'code_quantity' => 3, 'code_random' => false]);

    PromotionCodeService::generate($p);

    $codes = $p->codes()->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['GIAM30-001', 'GIAM30-002', 'GIAM30-003']);
});

test('voucher sinh ma ngau nhien khong trung, dung so luong, dung bang chu cai', function () {
    $p = promoV2(['type' => 'voucher', 'code' => null, 'code_prefix' => 'DK', 'code_quantity' => 200, 'code_random' => true]);

    PromotionCodeService::generate($p);

    $codes = $p->codes()->pluck('code')->all();
    expect(count($codes))->toBe(200);
    expect(count(array_unique($codes)))->toBe(200);
    foreach ($codes as $c) {
        expect(str_starts_with($c, 'DK'))->toBeTrue();
        expect(strlen($c))->toBe(8); // 'DK' + 6 ký tự random
    }
});

test('prefix da dung thi nem InvalidArgumentException', function () {
    $p1 = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'DUPX', 'code_quantity' => 1, 'code_random' => false]);
    PromotionCodeService::generate($p1);

    $p2 = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'DUPX', 'code_quantity' => 1, 'code_random' => false]);

    expect(fn () => PromotionCodeService::generate($p2))->toThrow(\InvalidArgumentException::class);
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionCodeServiceTest'`
Expected: FAIL — `PromotionCodeService` chưa tồn tại.

- [ ] **Step 3: Tạo PromotionCodeService**

```php
<?php

namespace App\Services\Promotions;

use App\Models\Promotion;
use App\Models\PromotionCode;
use Illuminate\Support\Facades\DB;

class PromotionCodeService
{
    // Bảng chữ cái bỏ 0/O/1/I (tránh nhầm lẫn khi in/gửi)
    public const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function assertPrefixAvailable(string $prefix): void
    {
        $exists = Promotion::query()
            ->where('code_prefix', $prefix)
            ->whereNull('deleted_at')
            ->exists();
        if ($exists) {
            throw new \InvalidArgumentException('Prefix đã được sử dụng, vui lòng chọn prefix khác.');
        }
        if (PromotionCode::where('code', 'like', $prefix.'%')->exists()) {
            throw new \InvalidArgumentException('Prefix đã được sử dụng, vui lòng chọn prefix khác.');
        }
    }

    public static function generate(Promotion $promotion): void
    {
        $prefix = $promotion->code_prefix;
        $quantity = (int) $promotion->code_quantity;
        if (! $prefix || $quantity <= 0) {
            return;
        }

        self::assertPrefixAvailable($prefix);

        $codes = $promotion->code_random
            ? self::randomCodes($prefix, $quantity)
            : self::sequentialCodes($prefix, $quantity);

        $rows = array_map(fn ($code) => [
            'promotion_id' => $promotion->id,
            'code' => $code,
            'status' => 'unused',
            'created_at' => now(),
            'updated_at' => now(),
        ], $codes);

        DB::table('promotion_codes')->insert($rows);
    }

    private static function sequentialCodes(string $prefix, int $quantity): array
    {
        $width = strlen((string) $quantity);
        $codes = [];
        for ($i = 1; $i <= $quantity; $i++) {
            $codes[] = $prefix.'-'.str_pad((string) $i, $width, '0', STR_PAD_LEFT);
        }

        return $codes;
    }

    private static function randomCodes(string $prefix, int $quantity): array
    {
        $codes = [];
        $len = strlen(self::CODE_ALPHABET);
        $existing = PromotionCode::where('code', 'like', $prefix.'%')->pluck('code')->flip();
        $attempts = 0;

        while (count($codes) < $quantity && $attempts < 50) {
            $code = $prefix;
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, $len - 1)];
            }
            if (isset($existing[$code]) || in_array($code, $codes, true)) {
                $attempts++;
                continue;
            }
            $codes[] = $code;
        }

        if (count($codes) < $quantity) {
            throw new \RuntimeException('Không đủ tổ hợp mã.');
        }

        return $codes;
    }
}
```

- [ ] **Step 4: Chạy test xác nhận pass**

Run: `php artisan test --filter='PromotionCodeServiceTest'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Promotions/PromotionCodeService.php tests/Feature/PromotionCodeServiceTest.php
git commit -m "feat: PromotionCodeService sinh ma coupon so thu tu + voucher ngau nhien"
```

---

### Task 3: PromotionEngine — validate mã con + đánh dấu used

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php`
- Test: `tests/Feature/Services/PromotionEngineTest.php`

**Interfaces:**
- Consumes: `PromotionCode` model, `Promotion` relation `codes()`.
- Produces: `resolveAll` giữ nguyên signature; khi nhập mã trả thêm reason `'already_used'` nếu mã con đã dùng.
- Produces: khi checkout (`$lockForUpdate = true`) và mã con hợp lệ → sau khi áp dụng, mark `unused → used`, `used_at = now()`, `used_invoice_id` (cần truyền invoice_id — xem lưu ý bên dưới).

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/Services/PromotionEngineTest.php`:

```php
test('resolveAll: ma con chua dung thi ok', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'ENG1', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $code = $p->codes()->first()->code;

    $r = PromotionEngine::resolveAll([$code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});

test('resolveAll: ma con da dung tra already_used', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'ENG2', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $pc = $p->codes()->first();
    $pc->update(['status' => 'used', 'used_at' => now()]);

    $r = PromotionEngine::resolveAll([$pc->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('already_used');
});

test('resolveAll: ma le cu van hoạt động (backward compat)', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionEngineTest'`
Expected: FAIL — `already_used` chưa có; mã con không resolve được.

- [ ] **Step 3: Cập nhật resolveAll — step 1**

Trong `resolveAll`, thay block step 1 (dòng ~18-36) bằng:

```php
        // 1. COUPON/VOUCHER từ mã nhập
        $codePromotions = [];
        $promotionCodesById = []; // promotion_id => PromotionCode (chỉ khi đã match mã con)
        foreach (array_values($codes) as $code) {
            $codeUpper = mb_strtoupper(trim($code));

            // 1a. Thử mã con (promotion_codes) trước — index unique, case-insensitive
            $pcQuery = PromotionCode::query()->whereRaw('UPPER(code) = ?', [$codeUpper]);
            if ($lockForUpdate) {
                $pcQuery->lockForUpdate();
            }
            $pc = $pcQuery->first();

            if ($pc) {
                if ($pc->status !== 'unused') {
                    return ['status' => 'rejected', 'reason' => 'already_used', 'code' => $code];
                }
                $promotion = Promotion::query()->with(['conditions', 'actions'])->find($pc->promotion_id);
                if (! $promotion) {
                    return ['status' => 'rejected', 'reason' => 'not_found', 'code' => $code];
                }
                $reject = self::validateAgainst($promotion, $lines, $subtotal);
                if ($reject !== null) {
                    return ['status' => 'rejected', 'reason' => $reject, 'code' => $code];
                }
                $codePromotions[] = $promotion;
                $promotionCodesById[$promotion->id] = $pc;
                continue;
            }

            // 1b. Fallback mã lẻ (promotions.code) như cũ
            $promotion = Promotion::query()
                ->whereRaw('UPPER(code) = ?', [$codeUpper]);
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
```

- [ ] **Step 4: Đánh dấu mã con used khi checkout**

Trong step 5 (`foreach ($pool as $p)`), trong block `if ($lockForUpdate)` (dòng ~108-109, chỗ `$p->increment('used_count')`), thêm:

```php
            // Quota: increment trong lock (chỉ khi checkout/thanh toán thật)
            if ($lockForUpdate) {
                $p->increment('used_count');
                // Đánh dấu mã con đã dùng (mỗi mã 1 lần) — đã lockForUpdate ở step 1a
                if (isset($promotionCodesById[$p->id])) {
                    $promotionCodesById[$p->id]->forceFill([
                        'status' => 'used',
                        'used_at' => now(),
                    ])->save();
                }
            }
```

- [ ] **Step 5: Thêm `use App\Models\PromotionCode;`** đầu file nếu chưa có.

- [ ] **Step 6: Chạy test xác nhận pass**

Run: `php artisan test --filter='PromotionEngineTest'`
Expected: PASS (gồm 3 test mới + toàn bộ test cũ backward compatible).

- [ ] **Step 7: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php tests/Feature/Services/PromotionEngineTest.php
git commit -m "feat: PromotionEngine validate ma con + danh dau used khi checkout"
```

**Lưu ý cho implementer:** `used_invoice_id` chưa được set trong engine vì engine không biết invoice. Nếu cần truy vết invoice, cập nhật trong `CheckoutService` sau khi tạo invoice (xem Task 5 bước bổ sung). Tạm thời `used_at` đủ cho "đã dùng".

---

### Task 4: PromotionController — store/update kèm batch + rules + index expose batch fields

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php`
- Test: `tests/Feature/PromotionControllerTest.php`

**Interfaces:**
- Consumes: `PromotionCodeService::generate`.
- Produces: request fields `code_prefix`, `code_quantity`, `code_random` trên POST/PUT promotion.
- Produces: campaign payload thêm `code_prefix`, `code_quantity`, `code_random`, `codes_count` (tổng mã con), `codes_used` (đã dùng).

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/PromotionControllerTest.php`:

```php
test('store coupon voi code_prefix + quantity tao du ma con', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Batch coupon',
        'code' => 'BATCHCOUPON',
        'code_prefix' => 'BC01',
        'code_quantity' => 3,
        'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();

    $promo = \App\Models\Promotion::where('name', 'Batch coupon')->first();
    expect($promo->codes)->toHaveCount(3);
    expect($promo->codes()->pluck('code')->sort()->values()->all())->toBe(['BC01-01', 'BC01-02', 'BC01-03']);
});

test('store prefix trung bi 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon', 'name' => 'A', 'code' => 'A1',
        'code_prefix' => 'DUPB', 'code_quantity' => 1, 'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 1000]],
    ])->assertSessionHasNoErrors();

    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon', 'name' => 'B', 'code' => 'B1',
        'code_prefix' => 'DUPB', 'code_quantity' => 1, 'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 1000]],
    ])->assertSessionHasErrors('code_prefix');
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionControllerTest'`
Expected: FAIL — store chưa xử lý batch, prefix trùng chưa bị chặn.

- [ ] **Step 3: Cập nhật `rules()`**

Thêm vào mảng rules (sau `code`):
```php
'code_prefix' => ['nullable', 'string', 'max:30', 'required_with:code_quantity'],
'code_quantity' => ['nullable', 'integer', 'min:1', 'max:100000', 'required_with:code_prefix'],
'code_random' => ['sometimes', 'boolean'],
```

- [ ] **Step 4: Cập nhật `store`**

Trong `DB::transaction`, sau khi tạo promotion + conditions + actions (trước khi đóng transaction), thêm:

```php
            // Sinh mã con hàng loạt (nếu có prefix + quantity)
            if ($validated['code_prefix'] ?? null) {
                try {
                    PromotionCodeService::generate($promotion);
                } catch (\InvalidArgumentException $e) {
                    throw new \Illuminate\Validation\ValidationException(
                        \Illuminate\Validation\Validator::make([], ['code_prefix' => 'required'])
                            ->errors()
                            ->add('code_prefix', $e->getMessage())
                    );
                }
            }
```

Thêm `use App\Services\Promotions\PromotionCodeService;` đầu file.

- [ ] **Step 5: Cập nhật `update`**

Trong `$promotion->update([...])`, thêm:
```php
'code_prefix' => $validated['code_prefix'] ?? null,
'code_quantity' => $validated['code_quantity'] ?? null,
'code_random' => $validated['code_random'] ?? false,
```
(Không sinh lại mã khi update — chỉ lưu metadata; mã con giữ nguyên.)

- [ ] **Step 6: Cập nhật `index` payload**

Trong map promotions (dòng ~44-64), thêm:
```php
'code_prefix' => $p->code_prefix,
'code_quantity' => $p->code_quantity,
'code_random' => (bool) $p->code_random,
'codes_count' => $p->codes_count ?? 0,
'codes_used' => $p->codes_used ?? 0,
```
Và trước `latest('id')`, eager load counts:
```php
$query->withCount(['codes as codes_count', 'codes as codes_used' => fn ($q) => $q->where('status', 'used')]);
```

- [ ] **Step 7: Chạy test xác nhận pass**

Run: `php artisan test --filter='PromotionControllerTest'`
Expected: PASS (test cũ + 2 test mới).

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Manager/PromotionController.php tests/Feature/PromotionControllerTest.php
git commit -m "feat: store/update promotion kem batch code + validation prefix"
```

---

### Task 5: PaymentController — validate mã con tại POS + CheckoutService đánh dấu invoice

**Files:**
- Modify: `app/Http/Controllers/Staff/PaymentController.php`
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/POSCheckoutTest.php`

**Interfaces:**
- Consumes: engine `already_used` reason (Task 3).
- Produces: `validatePromotion` map thêm `'already_used' => 'Mã khuyến mãi đã được sử dụng.'`.
- Produces: `CheckoutService::runBulk` sau khi tạo invoice — đánh dấu `used_invoice_id` cho các mã con đã dùng (chỉ có thể biết qua `$appliedPromotions`).

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/POSCheckoutTest.php`:

```php
test('checkout voi ma con chi dung duoc 1 lan', function () {
    $admin = posAdmin();
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'POS1', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $code = $p->codes()->first()->code;

    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    // Lần 1: dùng được
    $r1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => $code,
    ]);
    $r1->assertOk();

    // Mã đã used
    expect($p->codes()->first()->status)->toBe('used');

    // Lần 2: đơn khác, cùng mã → reject already_used
    $o2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);
    $r2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o2->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => $code,
    ]);
    $r2->assertStatus(422);
});

test('validate-promotion ma con da dung tra loi ro rang', function () {
    $admin = posAdmin();
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'POSV', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $pc = $p->codes()->first();
    $pc->update(['status' => 'used', 'used_at' => now()]);

    $this->actingAs($admin)->postJson('/staff/pos/validate-promotion', [
        'code' => $pc->code, 'subtotal' => 100000,
    ])->assertStatus(422)
        ->assertJson(['error' => 'Mã khuyến mãi đã được sử dụng.']);
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='POSCheckoutTest'`
Expected: FAIL — lần 2 không reject; validate message chưa có `already_used`.

- [ ] **Step 3: Cập nhật `validatePromotion` reason map**

Trong `PaymentController::validatePromotion`, mảng `$map` (dòng ~70-77) thêm:
```php
'already_used' => 'Mã khuyến mãi đã được sử dụng.',
```

- [ ] **Step 4: Chạy test xác nhận pass (phần validate)**

Run: `php artisan test --filter='validate-promotion ma con da dung'`
Expected: PASS.

- [ ] **Step 5: Đánh dấu used_invoice_id trong CheckoutService**

Trong `CheckoutService::runBulk`, sau khi tạo invoice (sau block tạo `Invoice::create`, dòng ~157-169), thêm:

```php
            // Đánh dấu mã con đã dùng gắn với invoice này (promotion_id + invoice_id truy vết)
            foreach ($appliedPromotions as $pr) {
                $p = $pr['promotion'];
                if ($p->code === null && $p->code_prefix) {
                    // Mã con: xác định qua order_promotions.code_used (đã ghi ở bước 7b)
                }
            }
```

Thực tế: mã con đã được mark used trong engine (Task 3). `used_invoice_id` được set ở đây — nhưng engine không trả về PromotionCode id. **Giải pháp gọn:** trong `runBulk` bước 7b (vòng `foreach ($appliedPromotions as $pr)` tạo `OrderPromotion::create`), sau khi tạo order_promotion với `code_used => $pr['code']`, set `used_invoice_id`:

```php
                    // Truy vết invoice cho mã con đã dùng
                    if ($pr['code']) {
                        \App\Models\PromotionCode::where('code', $pr['code'])
                            ->where('status', 'used')
                            ->whereNull('used_invoice_id')
                            ->update(['used_invoice_id' => $invoice->id]);
                    }
```

Thêm dòng này ngay sau `OrderPromotion::create([...])` trong vòng lặp (bước 7b). Dùng `\App\Models\PromotionCode` fully-qualified nếu chưa import.

- [ ] **Step 6: Chạy test toàn bộ POSCheckoutTest**

Run: `php artisan test --filter='POSCheckoutTest'`
Expected: PASS (gồm test lần 2 reject + truy vết invoice).

- [ ] **Step 7: Chạy full suite**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Staff/PaymentController.php app/Services/Checkout/CheckoutService.php tests/Feature/POSCheckoutTest.php
git commit -m "feat: POS validate + checkout danh dau ma con used, truy vet invoice"
```

---

### Task 6: Endpoint GET danh sách mã con (phân trang + export)

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php`
- Modify: `routes/web.php`
- Test: `tests/Feature/PromotionControllerTest.php`

**Interfaces:**
- Consumes: `PromotionCode` model.
- Produces: `GET /manager/promotions/{promotion}/codes?per_page=50&export=1` → JSON:
  - Không `export`: `{ codes: [{id, code, status, used_at, invoice_code}], meta: { per_page, has_more, next_page } }`.
  - Có `export=1`: `{ codes: [...] }` toàn bộ (no pagination), mỗi item `{code, status, used_at, invoice_code}`.

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/PromotionControllerTest.php`:

```php
test('GET codes tra danh sach ma con + bo dem', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'CODES1', 'code_quantity' => 3, 'code_random' => false]);
    addAction($p, 'discount_amount', 1000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $p->codes()->first()->update(['status' => 'used', 'used_at' => now()]);

    $res = $this->getJson("/manager/promotions/{$p->id}/codes")->assertOk();
    expect($res->json('codes'))->toHaveCount(3);
    expect($res->json('meta.per_page'))->toBe(50);
    $usedCount = collect($res->json('codes'))->where('status', 'used')->count();
    expect($usedCount)->toBe(1);
});

test('GET codes export=1 tra toan bo khong phan trang', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'CODESX', 'code_quantity' => 5, 'code_random' => false]);
    addAction($p, 'discount_amount', 1000);
    \App\Services\Promotions\PromotionCodeService::generate($p);

    $res = $this->getJson("/manager/promotions/{$p->id}/codes?export=1")->assertOk();
    expect($res->json('codes'))->toHaveCount(5);
    expect($res->json('meta'))->toBeNull();
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='GET codes'`
Expected: FAIL — route/endpoint chưa có.

- [ ] **Step 3: Thêm method `codes` vào PromotionController**

```php
public function codes(Request $request, Promotion $promotion): JsonResponse
{
    $query = PromotionCode::query()
        ->where('promotion_id', $promotion->id)
        ->leftJoin('invoices', 'invoices.id', '=', 'promotion_codes.used_invoice_id')
        ->select('promotion_codes.id', 'promotion_codes.code', 'promotion_codes.status', 'promotion_codes.used_at', 'invoices.invoice_code')
        ->orderBy('promotion_codes.id', 'desc');

    if ($request->boolean('export')) {
        return response()->json(['codes' => $query->get()]);
    }

    $perPage = min(max((int) $request->input('per_page', 50), 1), 200);
    $paginator = $query->simplePaginate($perPage);

    return response()->json([
        'codes' => $paginator->items(),
        'meta' => [
            'per_page' => $paginator->perPage(),
            'has_more' => $paginator->hasMorePages(),
            'next_page' => $paginator->nextPageUrl(),
        ],
    ]);
}
```

Thêm `use App\Models\PromotionCode;` nếu chưa có.

- [ ] **Step 4: Thêm route**

`routes/web.php` — sau dòng invoices:
```php
Route::get('/promotions/{promotion}/codes', [PromotionController::class, 'codes'])->middleware('permission:promotions.view');
```

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `php artisan test --filter='GET codes'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Manager/PromotionController.php routes/web.php tests/Feature/PromotionControllerTest.php
git commit -m "feat: endpoint danh sach ma con (phan trang + export)"
```

---

### Task 7: Frontend — PromotionFormDrawer section "Phát hành mã hàng loạt"

**Files:**
- Modify: `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx`
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx` (interface PromotionData thêm batch fields)

**Interfaces:**
- Consumes: campaign payload batch fields (`code_prefix`, `code_quantity`, `code_random`, `codes_count`, `codes_used`).
- Produces: form payload gửi `code_prefix`, `code_quantity`, `code_random` khi type = coupon/voucher.

- [ ] **Step 1: Cập nhật `PromotionData` interface**

Trong `PromotionsManager.tsx`, thêm vào interface:
```ts
code_prefix: string | null;
code_quantity: number | null;
code_random: boolean;
codes_count: number;
codes_used: number;
```

- [ ] **Step 2: Thêm state vào PromotionFormDrawer**

```ts
const [codePrefix, setCodePrefix] = useState('');
const [codeQuantity, setCodeQuantity] = useState('');
const [codeRandom, setCodeRandom] = useState(false);
```

Load khi edit (trong useEffect `promotionToEdit`):
```ts
setCodePrefix(promotionToEdit.code_prefix || '');
setCodeQuantity(promotionToEdit.code_quantity === null ? '' : String(promotionToEdit.code_quantity));
setCodeRandom(promotionToEdit.code_random);
```

Reset khi tạo mới: `setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false);`

- [ ] **Step 3: Thêm section UI**

Trong phần "Điều kiện & Giới hạn" (sau `PromotionConditionsEditor`), thêm khi `type !== 'promotion'`:

```jsx
{(type === 'coupon' || type === 'voucher') && (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
        <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Phát hành mã hàng loạt (tùy chọn)</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Chuỗi tiền tố</label>
                <input value={codePrefix} onChange={(e) => setCodePrefix(e.target.value.toUpperCase())}
                    placeholder={codeRandom ? 'VD: DK' : 'VD: GIAM30'} className={inputCls} />
            </div>
            <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Số lượng mã</label>
                <input type="number" min={1} max={100000} value={codeQuantity} onChange={(e) => setCodeQuantity(e.target.value)}
                    placeholder="VD: 500" className={inputCls} />
            </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={codeRandom} onChange={(e) => setCodeRandom(e.target.checked)} className="h-4 w-4 accent-sky-600" />
            Mã ngẫu nhiên (mỗi mã dùng 1 lần — voucher)
        </label>
        <p className="text-[11px] text-zinc-500">
            {codeRandom
                ? `Hệ thống tự sinh ${codeQuantity || 'N'} mã khác nhau không trùng (VD: ${codePrefix || 'DK'}123…).`
                : `Sinh ${codeQuantity || 'N'} mã theo thứ tự (VD: ${codePrefix || 'GIAM30'}-001…).`}
        </p>
        {promotionToEdit && promotionToEdit.codes_count > 0 && (
            <p className="text-[11px] font-medium text-zinc-600">
                Đã tạo: {promotionToEdit.codes_count} mã · Đã dùng: {promotionToEdit.codes_used}
            </p>
        )}
        {errors.code_prefix && <p className="text-xs text-rose-500">{errors.code_prefix}</p>}
    </div>
)}
```

- [ ] **Step 4: Thêm vào payload submit**

```ts
code_prefix: codePrefix || null,
code_quantity: codeQuantity === '' ? null : Number(codeQuantity),
code_random: codeRandom,
```

- [ ] **Step 5: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx resources/js/pages/manager/promotions/PromotionsManager.tsx
git commit -m "feat: form phat hanh ma hang loat (prefix + so luong + ma ngau nhien)"
```

---

### Task 8: Frontend — modal danh sách mã con + Export Excel

**Files:**
- Create: `resources/js/pages/manager/promotions/components/PromotionCodesModal.tsx`
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx` (thêm nút xem mã + render modal)
- Modify: `resources/js/pages/manager/promotions/components/PromotionInvoicesModal.tsx` (không đổi — tách modal mới)

**Interfaces:**
- Consumes: endpoint `GET /manager/promotions/{id}/codes?per_page=50` và `?export=1`; `exportXLSX` từ `reportExport`.
- Produces: `PromotionCodesModal({ isOpen, onClose, promotion })`.

- [ ] **Step 1: Tạo `PromotionCodesModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { X, ChevronDown, Download } from 'lucide-react';
import DataTable, { DataTableColumn } from '../../../../components/DataTable';
import { exportXLSX } from '../../../../components/reports/reportExport';

interface CodeRow {
    id: number;
    code: string;
    status: string;
    used_at: string | null;
    invoice_code: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    promotion: { id: number; code_prefix: string | null; name: string } | null;
}

export default function PromotionCodesModal({ isOpen, onClose, promotion }: Props) {
    const [codes, setCodes] = useState<CodeRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [nextPage, setNextPage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !promotion) return;
        setLoading(true);
        setError(null);
        setCodes([]);
        setHasMore(false);
        setNextPage(null);
        fetch(`/manager/promotions/${promotion.id}/codes?per_page=50`, { headers: { Accept: 'application/json' } })
            .then((r) => {
                if (!r.ok) throw new Error('fail');
                return r.json();
            })
            .then((data) => {
                setCodes(data.codes || []);
                setHasMore(data.meta?.has_more ?? false);
                setNextPage(data.meta?.next_page ?? null);
            })
            .catch(() => setError('Không thể tải danh sách mã. Vui lòng thử lại.'))
            .finally(() => setLoading(false));
    }, [isOpen, promotion]);

    useEffect(() => {
        if (!isOpen) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [isOpen, onClose]);

    const loadMore = () => {
        if (!nextPage || loadingMore) return;
        setLoadingMore(true);
        fetch(nextPage, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                setCodes((prev) => [...prev, ...(data.codes || [])]);
                setHasMore(data.meta?.has_more ?? false);
                setNextPage(data.meta?.next_page ?? null);
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
    };

    const handleExport = async () => {
        if (!promotion || exporting) return;
        setExporting(true);
        try {
            const res = await fetch(`/manager/promotions/${promotion.id}/codes?export=1`, { headers: { Accept: 'application/json' } });
            const data = await res.json();
            const all = (data.codes || []) as CodeRow[];
            const rows = all.map((c) => [
                c.code,
                c.status === 'used' ? 'Đã dùng' : 'Chưa dùng',
                c.used_at ? new Date(c.used_at).toLocaleString('vi-VN') : '—',
                c.invoice_code || '—',
            ]);
            await exportXLSX(
                `Danh sách mã ${promotion.code_prefix || 'KM'}`,
                promotion.name,
                ['Mã', 'Trạng thái', 'Thời gian dùng', 'Hoá đơn'],
                rows,
                `ma-${promotion.code_prefix || 'km'}`,
            );
        } catch {
            setError('Không thể xuất Excel. Vui lòng thử lại.');
        } finally {
            setExporting(false);
        }
    };

    if (!isOpen) return null;

    const columns: DataTableColumn<CodeRow>[] = [
        { key: 'code', header: 'Mã', render: (c) => <span className="font-mono font-medium">{c.code}</span> },
        { key: 'status', header: 'Trạng thái', align: 'center', render: (c) => (
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${c.status === 'used' ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                {c.status === 'used' ? 'Đã dùng' : 'Chưa dùng'}
            </span>
        )},
        { key: 'used_at', header: 'Thời gian dùng', render: (c) => c.used_at ? new Date(c.used_at).toLocaleString('vi-VN') : '—' },
        { key: 'invoice_code', header: 'Hoá đơn', render: (c) => c.invoice_code || '—' },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Danh sách mã {promotion?.code_prefix || ''}</h3>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={handleExport} disabled={exporting || codes.length === 0}
                            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
                            <Download className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>{exporting ? 'Đang xuất...' : 'Export Excel'}</span>
                        </button>
                        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg"><X className="w-5 h-5" /></button>
                    </div>
                </div>
                {loading ? (
                    <div className="py-10 text-center text-sm text-zinc-500">Đang tải...</div>
                ) : error ? (
                    <div className="py-10 text-center text-sm text-rose-600">{error}</div>
                ) : (
                    <>
                        <DataTable<CodeRow> columns={columns} rows={codes} rowKey={(c) => c.id}
                            emptyMessage="Chưa có mã nào" showCompactToggle={false} showPageSize={false} defaultPageSize={50} />
                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <button type="button" onClick={loadMore} disabled={loadingMore}
                                    className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
                                    <ChevronDown className="h-3.5 w-3.5 stroke-[1.5]" />
                                    <span>{loadingMore ? 'Đang tải...' : 'Tải thêm'}</span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Nối modal vào PromotionsManager**

Thêm state `codeView` + import modal:
```ts
const [codeView, setCodeView] = useState<PromotionData | null>(null);
```
Import `PromotionCodesModal`. Thêm nút "xem mã" cạnh icon eye trong cột actions:
```jsx
<button type="button" onClick={() => setCodeView(p)} title="Xem danh sách mã"
    className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
    <Ticket className="w-4 h-4" />
</button>
```
Render modal cuối component:
```jsx
<PromotionCodesModal isOpen={codeView !== null} onClose={() => setCodeView(null)} promotion={codeView} />
```
(cập nhật `PromotionData` interface — task 7 đã thêm batch fields, dùng chung.)

- [ ] **Step 3: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 4: Kiểm tra thủ công**

Tạo campaign coupon với prefix + quantity 5 → mở modal thấy 5 mã; bấm Export tải file Excel; trạng thái mã chuyển "Đã dùng" sau khi checkout.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/manager/promotions/components/PromotionCodesModal.tsx resources/js/pages/manager/promotions/PromotionsManager.tsx
git commit -m "feat: modal danh sach ma con + export excel"
```

---

### Task 9: Test toàn diện + cleanup

**Files:**
- Toàn bộ thay đổi.

- [ ] **Step 1: Chạy full test suite PHP**

Run: `php artisan test`
Expected: PASS (toàn bộ).

- [ ] **Step 2: Type check + build**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 3: ESLint các file sửa**

Run: `npx eslint resources/js/pages/manager/promotions/`
Expected: không có lỗi mới do thay đổi (bỏ qua lỗi style pre-existing không liên quan).

- [ ] **Step 4: Kiểm tra git status**

```bash
git status
```
Đảm bảo không có file tạm, không có thay đổi ngoài phạm vi. Commit các thay đổi còn sót (nếu có) theo task tương ứng.
