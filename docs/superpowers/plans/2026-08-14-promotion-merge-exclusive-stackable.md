# Gộp "Độc quyền" + "Áp dụng đồng thời" thành 1 toggle `stackable` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hợp nhất 2 toggle `exclusive` + `stackable` của promotion thành 1 toggle duy nhất "Độc quyền" (chỉ cho loại coupon/voucher), giữ cột `stackable`, bỏ cột `exclusive`, và dọn toàn bộ dead code `exclusive`.

**Architecture:** Migration mới chuyển `exclusive=true → stackable=false` rồi drop cột `exclusive`. `PromotionEngine` bỏ 2 khối logic exclusive (loại mã khác khi >1 mã; chặn auto khi có mã exclusive) — chỉ còn `stackable` quyết định mã có áp chung với auto promotion. Form `PromotionFormDrawer` bỏ toggle "Áp dụng đồng thời", đổi toggle "Độc quyền" thành nghịch đảo của `stackable`, ẩn với loại promotion. Tests cập nhật theo.

**Tech Stack:** Laravel 13 (PHP 8.3), Pest, React 19 + TypeScript + Inertia.js.

## Global Constraints

- Xoá toàn bộ tham chiếu `exclusive` (model, controller, engine, tests, frontend type/state). Không sót field nào.
- Chỉ dùng `stackable`: `true` = áp chung với auto promotion; `false` = độc quyền, không áp chung.
- Frontend toggle "Độc quyền": bật → `stackable=false`; tắt → `stackable=true`; ẩn khi `type === 'promotion'`.
- Migration lịch sử `2026_08_10_000014_create_promotion_v2_tables.php` KHÔNG sửa — cột `exclusive` bị xoá bởi migration mới.
- Giữ nguyên frontend POS (1 ô nhập mã, gửi `code` đơn) — không đổi `PaymentDrawer.tsx`/`usePOSCheckout.ts`.
- Giữ nguyên cơ chế tính % trên subtotal gốc (không đổi `$subtotal` logic).
- Bắt buộc chạy: `php artisan test` toàn bộ xanh, `npx eslint`, `npm run types:check`, `npm run build`.
- Commit message tiếng Việt. Không dùng emoji/inline SVG trong JSX.
- Docblock của model phải khớp fillable (xoá `exclusive` ở cả 2 chỗ).

---

### Task 1: Migration bỏ cột `exclusive` + cập nhật Model

**Files:**
- Create: `database/migrations/2026_08_14_000001_drop_exclusive_from_promotions.php`
- Modify: `app/Models/Promotion.php`
- Test: `tests/Feature/MigrationRebuildTest.php`

**Interfaces:**
- Consumes: `Promotion` model (`$fillable`, `$casts`).
- Produces: bảng `promotions` không còn cột `exclusive`; model không còn tham chiếu `exclusive`. Các task sau rely on: `stackable` boolean (default true) là field duy nhất điều khiển áp chung.

- [ ] **Step 1: Viết migration**

Tạo `database/migrations/2026_08_14_000001_drop_exclusive_from_promotions.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('promotions')->where('exclusive', true)->update(['stackable' => false]);
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn('exclusive');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->boolean('exclusive')->default(false)->after('stackable');
        });
    }
};
```

- [ ] **Step 2: Cập nhật Model**

`app/Models/Promotion.php`:
- Xoá dòng `@property bool $exclusive` (dòng 21).
- Xoá `'exclusive'` khỏi `$fillable` (dòng 30).
- Xoá `'exclusive' => 'bool',` khỏi `$casts` (dòng 41).

- [ ] **Step 3: Cập nhật test schema**

`tests/Feature/MigrationRebuildTest.php:47` — xoá `'exclusive',` khỏi mảng `hasColumns`:

```php
expect(Schema::hasColumns('promotions', [
    'id', 'name', 'type', 'code', 'start_date', 'end_date', 'status',
    'max_usage', 'used_count', 'stackable',
]))->toBeTrue();
```

Thêm test assert cột `exclusive` đã bị xoá:

```php
test('promotion v2: cot exclusive da bi xoa', function () {
    expect(Schema::hasColumn('promotions', 'exclusive'))->toBeFalse();
});
```

- [ ] **Step 4: Chạy migration + test**

```bash
php artisan migrate
php artisan test --filter=MigrationRebuildTest
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_08_14_000001_drop_exclusive_from_promotions.php app/Models/Promotion.php tests/Feature/MigrationRebuildTest.php
git commit -m "feat: bo cot exclusive khoi promotions, chuyen du lieu sang stackable"
```

---

### Task 2: Backend engine — bỏ logic exclusive

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php`
- Modify: `app/Http/Controllers/Staff/PaymentController.php`
- Test: `tests/Feature/PromotionV2Test.php`, `tests/Feature/PromotionTest.php`

**Interfaces:**
- Consumes: `resolveAll(array $codes, Collection $lines, float $subtotal, bool $lockForUpdate, ?int $preferredAutoId): array` — signature KHÔNG đổi.
- Produces: engine chỉ dùng `stackable` (không còn `$p->exclusive`). `PaymentController` không còn `exclusive_conflict` reason.

- [ ] **Step 1: Xoá khối exclusive (PromotionEngine.php:75-81)**

Xoá toàn bộ:

```php
        // 2. exclusive: 1 mã exclusive → bỏ hết khác
        if (count($codePromotions) > 1) {
            $exclusive = collect($codePromotions)->first(fn ($p) => $p->exclusive);
            if ($exclusive) {
                $codePromotions = [$exclusive];
            }
        }
```

Lưu ý: sau khi xoá, comment "// 3. PROMOTION tự động..." hiện còn nguyên — nếu còn comment đánh số "// 2." đang bị lệch thì sửa lại cho khớp (đổi thành `// 2.` hoặc xoá hẳn comment cũ).

- [ ] **Step 2: Bỏ điều kiện chống exclusive khi thêm auto (dòng 109)**

Đổi:

```php
        if ($auto && collect($codePromotions)->doesntContain(fn ($p) => $p->exclusive)) {
            $pool[] = $auto;
        }
```

thành:

```php
        if ($auto) {
            $pool[] = $auto;
        }
```

- [ ] **Step 3: Xoá `exclusive_conflict` (PaymentController.php:84)**

Xoá dòng:

```php
                'exclusive_conflict' => 'Mã khuyến mãi xung đột với khuyến mãi khác.',
```

- [ ] **Step 4: Cập nhật test helper `promoV2`**

`tests/Pest.php:199` — xoá `'exclusive' => false,`. Sửa comment dòng 183 thành:

```php
/**
 * Tạo promotion v2 (type/code/status/max_usage/stackable).
 */
```

- [ ] **Step 5: Cập nhật PromotionV2Test — xoá test exclusive, thêm test stackable chặn auto**

`tests/Feature/PromotionV2Test.php:131-142` — XOÁ test `exclusive=true bo het promotion khac` (vì không còn exclusive; 2 mã nhập cùng lúc giờ cộng dồn theo stackable — nhưng UI chỉ gửi 1 mã nên không cần test hành vi này).

THÊM test mới thay thế (kiểm tra `stackable=false` chặn auto promotion):

```php
test('coupon stackable=false: bo auto promotion khi nhap ma', function () {
    $coupon = promoV2(['type' => 'coupon', 'code' => 'NOSTACK', 'stackable' => false]);
    addAction($coupon, 'discount_amount', 20000);
    $auto = promoV2();
    addAction($auto, 'discount_amount', 5000);

    $res = PromotionEngine::resolveAll(['NOSTACK'], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);
    expect($res['promotions'][0]['promotion']->id)->toBe($coupon->id);
    expect($res['total_discount'])->toBe(20000.0);
});
```

THÊM test `stackable=true` (mặc định) vẫn áp cả mã + auto:

```php
test('coupon stackable=true: ap chung auto promotion', function () {
    $coupon = promoV2(['type' => 'coupon', 'code' => 'STACKOK', 'stackable' => true]);
    addAction($coupon, 'discount_percent', 10);
    $auto = promoV2();
    addAction($auto, 'discount_amount', 5000);

    $res = PromotionEngine::resolveAll(['STACKOK'], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(2);
    // 10% của 150000 = 15000 (mã) + 5000 (auto) = 20000
    expect($res['total_discount'])->toBe(20000.0);
});
```

- [ ] **Step 6: Cập nhật PromotionTest (đang dùng exclusive)**

`tests/Feature/PromotionTest.php` — đọc file, xoá mọi `exclusive` (vd dòng 11 `'exclusive' => true,` và dòng 19 `expect($fresh->exclusive)->toBeTrue();`). Nếu test đó chỉ verify fillable, đổi thành `'stackable' => false` tương ứng.

- [ ] **Step 7: Cập nhật PromotionControllerTest + PromotionAnalyticsTest**

- `tests/Feature/PromotionControllerTest.php:30` — xoá `'exclusive' => false,`.
- `tests/Feature/PromotionAnalyticsTest.php:18` — xoá `'exclusive' => false,`.

- [ ] **Step 8: Chạy test**

```bash
php artisan test
```
Expected: toàn bộ suite xanh (355 hiện tại, có thể thay đổi số lượng do thêm/xoá test).

- [ ] **Step 9: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php app/Http/Controllers/Staff/PaymentController.php tests/Pest.php tests/Feature/PromotionV2Test.php tests/Feature/PromotionTest.php tests/Feature/PromotionControllerTest.php tests/Feature/PromotionAnalyticsTest.php
git commit -m "feat: bo logic exclusive khoi engine, stackable quyet dinh ap chung auto"
```

---

### Task 3: Frontend — form 1 toggle "Độc quyền" + dọn type

**Files:**
- Modify: `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx`
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx`

**Interfaces:**
- Consumes: `PromotionData` (PromotionsManager.tsx) — xoá field `exclusive`, giữ `stackable: boolean`.
- Produces: form gửi payload có `stackable` (nghịch đảo toggle "Độc quyền"), không gửi `exclusive`. Toggle ẩn khi `type === 'promotion'`.

- [ ] **Step 1: Cập nhật interface**

`PromotionsManager.tsx:40` — xoá `exclusive: boolean;`, giữ `stackable: boolean;`.

- [ ] **Step 2: Cập nhật state + useEffect trong form**

`PromotionFormDrawer.tsx:37` — giữ `const [exclusive, setExclusive] = useState(false);` (đổi nghĩa thành toggle "Độc quyền"). Xoá `const [stackable, setStackable] = useState(true);` (dòng 38).

`PromotionFormDrawer.tsx:74` — đổi dòng `setExclusive(promotionToEdit.exclusive); setStackable(promotionToEdit.stackable);` thành:

```ts
setExclusive(!promotionToEdit.stackable);
```

`PromotionFormDrawer.tsx:90` (nhánh create) — bỏ `setStackable(true)`, chỉ giữ `setExclusive(false);`.

- [ ] **Step 3: Cập nhật payload submit**

`PromotionFormDrawer.tsx:148` — đổi dòng `exclusive, stackable,` thành:

```ts
stackable: !exclusive,
```

- [ ] **Step 4: Cập nhật UI toggle**

Thay toàn bộ block "Toggles" (dòng 325-340) bằng block mới chỉ có 1 toggle "Độc quyền" và **ẩn khi type === 'promotion'**:

```jsx
                        {/* Toggles */}
                        {type !== 'promotion' && (
                            <section className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1">Độc quyền</label>
                                        <p className="text-xs text-zinc-500">Không áp dụng chung với các chương trình khuyến mãi tự động.</p>
                                    </div>
                                    <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} className="h-4 w-4 accent-sky-600" />
                                </div>
                            </section>
                        )}
```

- [ ] **Step 5: Verify lint + types + build**

```bash
npx eslint resources/js/pages/manager/promotions/
npm run types:check
npm run build
```
Expected: 0 errors, pass.

- [ ] **Step 6: Verify backend tests + grep không còn exclusive ở frontend**

```bash
php artisan test
rg -n "exclusive" resources/js/ --glob "*.tsx" --glob "*.ts"
```
Expected: test xanh; grep KHÔNG ra dòng nào (ngoài toggle "Độc quyền" là text tiếng Việt, không phải field — nếu rg match `exclusive` chữ thường thì không được ra kết quả nào).

- [ ] **Step 7: Commit**

```bash
git add resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx resources/js/pages/manager/promotions/PromotionsManager.tsx
git commit -m "feat: form promotion gop thanh 1 toggle doc quyen, an khi loai promotion"
```

---

### Task 4: Dọn dead code — verify toàn bộ

**Files:**
- Check: toàn bộ repo (grep `exclusive`)

**Interfaces:**
- Consumes: kết quả 3 task trước.
- Produces: đảm bảo KHÔNG còn `exclusive` ở bất kỳ đâu (trừ migration lịch sử `2026_08_10_000014_create_promotion_v2_tables.php` — chứa cột tạo gốc, KHÔNG được sửa).

- [ ] **Step 1: Grep toàn repo**

```bash
rg -n "exclusive" --glob "!vendor/**" --glob "!node_modules/**" --glob "!.git/**" --glob "!docs/**"
```
Expected: chỉ còn kết quả tại `database/migrations/2026_08_10_000014_create_promotion_v2_tables.php:31` (cột tạo gốc). Mọi nơi khác phải sạch.

- [ ] **Step 2: Nếu còn sót** — xoá từng nơi khớp với pattern spec (model/controller/engine/tests/frontend). Không sửa file migration lịch sử.

- [ ] **Step 3: Verify lần cuối**

```bash
php artisan test
npx eslint resources/js/pages/manager/promotions/
npm run types:check
npm run build
```
Expected: tất cả xanh.

- [ ] **Step 4: Commit (nếu có thay đổi)**

```bash
git add -A
git commit -m "chore: don dead code exclusive"
```
Nếu không có thay đổi nào, bỏ qua bước này.

---

## Self-Review Notes

- **Spec coverage:** Migration (Task 1), engine + PaymentController (Task 2), form + interface (Task 3), dead code sweep (Task 4). Tất cả mục spec đều có task tương ứng.
- **Không placeholder:** mọi bước có code/lệnh cụ thể.
- **Type consistency:** field `stackable: boolean` giữ nguyên xuyên suốt; `exclusive` bị xoá đồng bộ model ↔ controller ↔ frontend.
- **Lưu ý:** test "exclusive=true bo het promotion khac" bị XOÁ vì không còn exclusive; thay bằng 2 test stackable (chặn auto / áp chung auto) — đúng spec.
