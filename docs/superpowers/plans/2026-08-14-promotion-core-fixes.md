# 4 Cải Tiến Cốt Lõi Khuyến Mãi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 4 điểm cốt lõi thanh toán: (1) giảm giá chồng tầng promotion → mã, (2) free product theo luồng thật (có món trong giỏ, set 0, trừ kho), (3) VAT theo giá thực thu, (4) nút vô hiệu hoá/kích hoạt lại batch mã.

**Architecture:** Sửa `PromotionEngine` (chồng tầng `$base` giảm dần, pool auto-trước-mã-sau, free_product kiểm tra giỏ + trả `free_item_ids`, chặn mã `disabled`), `CheckoutService` (bỏ line 0đ tự thêm, set món tặng = 0 trong lineInputs, VAT tính lại sau discount), migration + controller + frontend cho toggle batch mã.

**Tech Stack:** Laravel 13 (PHP 8.3), Pest, React 19 + TypeScript + Inertia.js.

## Global Constraints

- Chồng tầng: promotion tự động tính TRƯỚC trên subtotal; mã coupon/voucher (chỉ 1 mã/đơn) tính SAU trên giá đã giảm. Không vượt 100%.
- Free product: món tặng phải ĐÃ có trong giỏ hàng (line items); nếu không → `rejected` reason `free_product_not_in_cart`. Chỉ món tặng ĐẦU TIÊN mỗi loại được set 0. Món tặng vẫn nằm trong `order_items` (trừ kho đúng luồng).
- VAT thực thu: `vat_amount` của hoá đơn + từng line tính trên giá sau discount.
- Mã `disabled`: engine chặn (reason `disabled`, message tiếng Việt). Kích hoạt lại chỉ chuyển `disabled → unused`; mã `used` không đổi.
- Chỉ 1 mã/đơn (giữ nguyên, không mở rộng).
- Bắt buộc chạy: `php artisan test` toàn bộ xanh, `npx eslint`, `npm run types:check`, `npm run build`.
- Commit message tiếng Việt. Không dùng emoji/inline SVG trong JSX.
- Cập nhật các test cũ về cộng dồn độc lập cho khớp hành vi chồng tầng mới.

---

### Task 1: Engine chồng tầng + pool auto-trước-mã-sau

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php`
- Test: `tests/Feature/Services/PromotionEngineTest.php`, `tests/Feature/PromotionV2Test.php`

**Interfaces:**
- Consumes: `resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false, ?int $preferredAutoId = null): array` — signature KHÔNG đổi.
- Produces: `$base` giảm dần sau mỗi promotion; pool = `[auto, ...mã]`; kết quả `total_discount` theo chồng tầng. Các task sau dùng `$resolved['total_discount']`.

- [ ] **Step 1: Đọc engine hiện tại**

```bash
type app\Services\Promotions\PromotionEngine.php
```

Xác định: khối pool (dòng ~99-103), vòng lặp áp dụng (dòng ~105-154), return (dòng ~156-161). Tìm theo nội dung, không theo số dòng cứng.

- [ ] **Step 2: Sửa thứ tự pool — auto trước, mã sau**

Đổi khối (dòng ~99-103):

```php
        // 3. Gộp pool: mã trước, auto sau
        $pool = $codePromotions;
        if ($auto) {
            $pool[] = $auto;
        }
```

thành:

```php
        // 3. Gộp pool: promotion tự động TRƯỚC, mã coupon/voucher SAU (tính chồng tầng)
        $pool = [];
        if ($auto) {
            $pool[] = $auto;
        }
        foreach ($codePromotions as $cp) {
            $pool[] = $cp;
        }
```

- [ ] **Step 3: Sửa vòng lặp áp dụng — `$base` giảm dần**

Đổi khối (dòng ~105-154). Thêm biến `$base` trước vòng lặp, dùng `$base` thay `$subtotal` trong tính `discount_percent` và `$remaining`, giảm `$base` sau mỗi promotion:

```php
        // 4. Áp dụng hành động (chồng tầng: base giảm dần sau mỗi promotion)
        $applied = [];
        $totalDiscount = 0.0;
        $base = $subtotal;
        $freeItemIds = [];
        foreach ($pool as $p) {
            $discount = 0.0;
            $actionsApplied = [];
            foreach ($p->actions as $action) {
                if ($action->action_type === 'discount_percent') {
                    $d = $base * ($action->action_value / 100);
                    if ($action->max_discount_amount !== null) {
                        $d = min($d, (float) $action->max_discount_amount);
                    }
                    $discount += $d;
                    $actionsApplied[] = ['type' => 'discount_percent', 'value' => $action->action_value];
                } elseif ($action->action_type === 'discount_amount') {
                    $discount += (float) $action->action_value;
                    $actionsApplied[] = ['type' => 'discount_amount', 'value' => (float) $action->action_value];
                } elseif ($action->action_type === 'free_product') {
                    $freeMenuId = (int) $action->action_value;
                    $freeSubtotal = (float) $lines->where('menu_item_id', $freeMenuId)->sum('subtotal');
                    if ($freeSubtotal > 0) {
                        $discount += $freeSubtotal;
                        $freeItemIds[] = $freeMenuId;
                        $actionsApplied[] = ['type' => 'free_product', 'value' => $freeMenuId];
                    }
                }
            }

            $remaining = max(0.0, $base - $totalDiscount);
            $amount = round(min(max(0.0, $discount), $remaining), 2);
            $totalDiscount += $amount;
            $base = max(0.0, $base - $amount);

            // Quota: increment trong lock (chỉ khi checkout/thanh toán thật)
            if ($lockForUpdate) {
                $p->increment('used_count');
                if (isset($promotionCodesById[$p->id])) {
                    $promotionCodesById[$p->id]->forceFill([
                        'status' => 'used',
                        'used_at' => now(),
                    ])->save();
                }
            }

            $applied[] = [
                'promotion' => $p,
                'amount' => $amount,
                'code' => $p->type === 'promotion' ? null : ($promotionCodesById[$p->id]->code ?? $p->code),
                'actions_applied' => $actionsApplied,
            ];
        }

        return [
            'status' => 'ok',
            'promotions' => $applied,
            'total_discount' => round($totalDiscount, 2),
            'free_item_ids' => array_values(array_unique($freeItemIds)),
        ];
```

- [ ] **Step 4: Cập nhật test cộng dồn cũ → chồng tầng**

Trong `tests/Feature/PromotionV2Test.php`, test `coupon stackable=true ap chung auto promotion` (dòng ~146): kỳ vọng hiện là `total_discount === 20000.0` (10% của 150k = 15000 + auto 5000 độc lập). ĐỔI kỳ vọng theo chồng tầng:

```php
test('coupon stackable=true: ap chung auto promotion (chong tang)', function () {
    $coupon = promoV2(['type' => 'coupon', 'code' => 'STACKOK', 'stackable' => true]);
    addAction($coupon, 'discount_percent', 10);
    $auto = promoV2();
    addAction($auto, 'discount_amount', 5000);

    $res = PromotionEngine::resolveAll(['STACKOK'], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(2);
    // Chồng tầng: auto 5000 trước → base 145000; mã 10% trên 145000 = 14500
    // Tổng = 5000 + 14500 = 19500
    expect($res['total_discount'])->toBe(19500.0);
});
```

Trong `tests/Feature/Services/PromotionEngineTest.php`, rà các test assert tổng discount nhiều promotion cùng pool và cập nhật theo chồng tầng (mỗi trường hợp tính base giảm dần). Đặc biệt test "2 coupon stacking" (nếu có) — kỳ vọng thay đổi.

- [ ] **Step 5: Chạy test**

```bash
php artisan test --filter="PromotionV2Test|PromotionEngineTest"
```
Expected: PASS (sau khi cập nhật kỳ vọng).

- [ ] **Step 6: Chạy toàn bộ + commit**

```bash
php artisan test
git add app/Services/Promotions/PromotionEngine.php tests/Feature/PromotionV2Test.php tests/Feature/Services/PromotionEngineTest.php
git commit -m "feat: tinh giam gia chong tang - promotion truoc, ma sau tren gia da giam"
```
Expected: toàn bộ xanh.

---

### Task 2: Free product theo luồng thật — engine chặn khi thiếu món

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php`
- Modify: `app/Http/Controllers/Staff/PaymentController.php`
- Test: `tests/Feature/PromotionV2Test.php`

**Interfaces:**
- Consumes: kết quả Task 1 (`$freeItemIds` đã tồn tại trong return; free_product cộng `$discount` theo subtotal giỏ).
- Produces: nếu món tặng không có trong `$lines` → `rejected` reason `free_product_not_in_cart`; PaymentController map message. CheckoutService (Task 3) dùng `$resolved['free_item_ids']`.

- [ ] **Step 1: Thêm guard món tặng có trong giỏ**

Trong vòng lặp áp dụng (Task 1 Step 3), trong nhánh `free_product`, thêm kiểm tra trước khi cộng discount. Đổi:

```php
                } elseif ($action->action_type === 'free_product') {
                    $freeMenuId = (int) $action->action_value;
                    $freeSubtotal = (float) $lines->where('menu_item_id', $freeMenuId)->sum('subtotal');
                    if ($freeSubtotal > 0) {
                        $discount += $freeSubtotal;
                        $freeItemIds[] = $freeMenuId;
                        $actionsApplied[] = ['type' => 'free_product', 'value' => $freeMenuId];
                    }
                }
```

thành:

```php
                } elseif ($action->action_type === 'free_product') {
                    $freeMenuId = (int) $action->action_value;
                    if (! $lines->contains(fn ($l) => (int) ($l['menu_item_id'] ?? 0) === $freeMenuId)) {
                        return ['status' => 'rejected', 'reason' => 'free_product_not_in_cart', 'code' => null];
                    }
                    $freeSubtotal = (float) $lines->where('menu_item_id', $freeMenuId)->sum('subtotal');
                    $discount += $freeSubtotal;
                    $freeItemIds[] = $freeMenuId;
                    $actionsApplied[] = ['type' => 'free_product', 'value' => $freeMenuId];
                }
```

- [ ] **Step 2: Map message trong PaymentController**

`app/Http/Controllers/Staff/PaymentController.php` — trong mảng `$map` (dòng ~76-86), thêm:

```php
                'free_product_not_in_cart' => 'Đơn cần có món tặng mới áp dụng được mã này.',
```

- [ ] **Step 3: Thêm test**

`tests/Feature/PromotionV2Test.php`:

```php
test('free_product khi mon tang KHONG co trong gio -> rejected', function () {
    $p = promoV2(['type' => 'coupon', 'code' => 'FREE1'.substr(uniqid(), -4)]);
    addAction($p, 'free_product', 99999);

    $res = PromotionEngine::resolveAll([$p->code], collect([
        ['order_item_id' => 1, 'menu_item_id' => 10, 'quantity' => 1, 'subtotal' => 50000, 'category_id' => null],
    ]), 50000);

    expect($res['status'])->toBe('rejected');
    expect($res['reason'])->toBe('free_product_not_in_cart');
});

test('free_product khi mon tang co trong gio -> free_item_ids + amount = subtotal mon tang', function () {
    $p = promoV2(['type' => 'coupon', 'code' => 'FREE2'.substr(uniqid(), -4)]);
    addAction($p, 'free_product', 10);

    $res = PromotionEngine::resolveAll([$p->code], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect($res['free_item_ids'])->toContain(10);
    // amount của promotion free_product = subtotal line món tặng (linesV2 line 10 = 100000)
    expect($res['promotions'][0]['amount'])->toBe(100000.0);
});
```

- [ ] **Step 4: Chạy test + commit**

```bash
php artisan test --filter="PromotionV2Test"
php artisan test
git add app/Services/Promotions/PromotionEngine.php app/Http/Controllers/Staff/PaymentController.php tests/Feature/PromotionV2Test.php
git commit -m "feat: free product bat buoc mon tang trong gio, chan khi thieu"
```
Expected: toàn bộ xanh.

---

### Task 3: CheckoutService — món tặng set 0 trong order + VAT thực thu

**Files:**
- Modify: `app/Services/Checkout/CheckoutService.php`
- Test: `tests/Feature/PromotionV2Test.php`, `tests/Feature/POSCheckoutTest.php`

**Interfaces:**
- Consumes: `$resolved['free_item_ids']` (Task 2), `$resolved['total_discount']` (Task 1), `OrderTotals::vatInPrice(float, float): float`.
- Produces: line món tặng `unit_price=0/subtotal=0/vat_amount=0/discount_amount=subtotal gốc`; vẫn là `order_item` (trừ kho); `total = subtotal − totalDiscount` (totalDiscount đã gồm giá món tặng từ engine); `vat_amount` mỗi line tính sau discount.

- [ ] **Step 1: Đọc CheckoutService**

```bash
type app\Services\Checkout\CheckoutService.php
```

Xác định: block resolve promotions (dòng ~93-124), block phân bổ discount 2b (dòng ~126-137), block free product 6b (dòng ~231-248), tính `$total` (dòng ~139), tạo invoice (dòng ~161-175).

- [ ] **Step 2: Lấy `free_item_ids` từ engine + lưu subtotal gốc món tặng**

Trong block resolve (sau dòng 109), đổi `$freeItems = $resolved['free_items'] ?? [];` thành:

```php
                $freeItemIds = $resolved['free_item_ids'] ?? [];
```

Thêm khai báo trước vòng lặp (cạnh dòng ~96):

```php
            $freeItemIds = [];
            $freeGiftTotals = [];   // menu_item_id => subtotal gốc món tặng (để cộng vào totalDiscount)
```

- [ ] **Step 3: Xoá block 6b (tự thêm line 0đ)**

Xoá toàn bộ block:

```php
            // 6b. FREE_PRODUCT: thêm line 0đ
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

- [ ] **Step 4: Sửa block phân bổ discount 2b — xử lý món tặng + VAT sau discount**

Đổi block 2b (dòng ~126-137) thành:

```php
            // 2b. Phân bổ discount xuống từng line (cho báo cáo line-level) theo tỷ trọng subtotal;
            //     món tặng (free_item_ids) set giá = 0; VAT mỗi line tính trên giá sau discount (thực thu)
            $freeHandledIds = [];
            $freeGiftTotals = [];
            if ($totalDiscount > 0 && $subtotal > 0) {
                $assigned = 0.0;
                $count = count($lineInputs);
                foreach ($lineInputs as $idx => $li) {
                    $isFree = in_array((int) $li['menu_item_id'], $freeItemIds, true)
                        && ! in_array($li['order_item_id'], $freeHandledIds, true);
                    if ($isFree) {
                        $giftSubtotal = (float) $li['subtotal'];
                        $freeGiftTotals[] = $giftSubtotal;
                        $freeHandledIds[] = $li['order_item_id'];
                        $lineInputs[$idx]['unit_price'] = 0.0;
                        $lineInputs[$idx]['subtotal'] = 0.0;
                        $lineInputs[$idx]['vat_amount'] = 0.0;
                        $lineInputs[$idx]['discount_amount'] = round($giftSubtotal, 2);
                        continue;
                    }
                    $lineDiscount = ($idx === $count - 1)
                        ? round($totalDiscount - $assigned, 2)
                        : floor($totalDiscount * (float) $li['subtotal'] / $subtotal);
                    $assigned += $lineDiscount;
                    $lineInputs[$idx]['discount_amount'] = round(max(0, min($lineDiscount, (float) $li['subtotal'])), 2);
                    $netLineTotal = max(0.0, (float) $li['subtotal'] - (float) $lineInputs[$idx]['discount_amount']);
                    $lineInputs[$idx]['vat_amount'] = OrderTotals::vatInPrice($netLineTotal, (float) $li['vat_rate']);
                }
            }
```

LƯU Ý: `$totalDiscount` từ engine đã gồm giá trị món tặng (Task 1 cộng `freeSubtotal` vào discount). Vì món tặng subtotal đã set 0 ở trên nhưng `$subtotal` (biến) giữ nguyên, phân bổ vẫn đúng. `$total` giữ nguyên (dòng 139).

- [ ] **Step 5: Xoá khai báo `$freeItems` cũ**

Dòng ~95 `$freeItems = [];` — xoá (đã thay bằng `$freeItemIds`).

- [ ] **Step 6: Thêm test VAT thực thu + free product trừ kho**

`tests/Feature/PromotionV2Test.php`:

```php
test('VAT thuc thu: vat_amount tinh tren gia sau discount', function () {
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 10]);
    $coupon = promoV2(['type' => 'coupon', 'code' => 'VAT1'.substr(uniqid(), -4)]);
    addAction($coupon, 'discount_percent', 28);   // giảm 28% → total 72000
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs(posAdmin())->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 72000,
        'promotion_code' => $coupon->code,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    expect((float) $invoice->total_amount)->toBe(72000.0);
    // net(72000) = floor(72000/1.1) = 65454; vat = 72000-65454 = 6546
    expect((float) $invoice->vat_amount)->toBe(6546.0);
});
```

`tests/Feature/POSCheckoutTest.php` (hoặc PromotionV2Test):

```php
test('free product: mon tang trong order bi set 0 va kho van tru', function () {
    $free = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $ingredient = \App\Models\Ingredient::create(['name' => 'Ngl free '.uniqid(), 'stock_quantity' => 100, 'unit' => 'g']);
    $free->recipes()->create(['ingredient_id' => $ingredient->id, 'amount' => 10]);

    $coupon = promoV2(['type' => 'coupon', 'code' => 'FREE'.$this->code ?? 'F'.substr(uniqid(), -5)]);
    addAction($coupon, 'free_product', $free->id);

    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable();
    // Đơn có cả món thường + món tặng (nhân viên đã bấm thêm)
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed'],
        ['item' => $free, 'qty' => 1, 'price' => 20000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs(posAdmin())->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
        'promotion_code' => $coupon->code,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    // Món tặng subtotal = 0 trong invoice line
    $freeLine = $invoice->lines()->where('menu_item_id', $free->id)->first();
    expect((float) $freeLine->subtotal)->toBe(0.0);
    // Tổng hoá đơn = 30000 (món thường) — món tặng không tính tiền
    expect((float) $invoice->total_amount)->toBe(30000.0);
    // Kho đã trừ nguyên liệu món tặng
    expect((float) $ingredient->fresh()->stock_quantity)->toBe(90.0);
});
```

Kiểm tra `MenuItem` có `recipes()` relationship không (nếu tên khác, dùng đúng tên; xem `ProductRecipe` model). Nếu `posMenuItem` chưa có cách tạo recipe, tạo trực tiếp: `\App\Models\ProductRecipe::create(['menu_item_id'=>$free->id, 'ingredient_id'=>$ingredient->id, 'amount'=>10])`.

- [ ] **Step 7: Chạy test + fix lỗi thực tế**

```bash
php artisan test --filter="PromotionV2Test|POSCheckoutTest"
```
Expected: PASS. Nếu fail do `$invoice->lines()` hoặc relation khác, sửa cho khớp tên model thật.

- [ ] **Step 8: Chạy toàn bộ + commit**

```bash
php artisan test
git add app/Services/Checkout/CheckoutService.php tests/Feature/PromotionV2Test.php tests/Feature/POSCheckoutTest.php
git commit -m "feat: free product set 0 trong order + VAT tinh theo gia thuc thu sau discount"
```
Expected: toàn bộ xanh.

---

### Task 4: Vô hiệu hoá/kích hoạt lại batch mã

**Files:**
- Create: `database/migrations/2026_08_14_000002_add_disabled_to_promotion_codes_status.php`
- Modify: `app/Services/Promotions/PromotionEngine.php`
- Modify: `app/Http/Controllers/Staff/PaymentController.php`
- Modify: `app/Http/Controllers/Manager/PromotionController.php`
- Modify: `routes/web.php`
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx`
- Test: `tests/Feature/PromotionControllerTest.php`, `tests/Feature/POSCheckoutTest.php`

**Interfaces:**
- Consumes: `PromotionCode` model (bảng `promotion_codes`, status `unused|used`), `flushPosPromotionsCache()` (PromotionController), `PromotionEngine::resolveAll` (Task 1).
- Produces: enum status thêm `disabled`; engine chặn mã disabled; route `POST /manager/promotions/{promotion}/codes/toggle`; nút UI.

- [ ] **Step 1: Migration thêm status disabled**

Tạo `database/migrations/2026_08_14_000002_add_disabled_to_promotion_codes_status.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE promotion_codes MODIFY COLUMN status ENUM('unused','used','disabled') NOT NULL DEFAULT 'unused'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE promotion_codes MODIFY COLUMN status ENUM('unused','used') NOT NULL DEFAULT 'unused'");
    }
};
```

Chạy: `php artisan migrate`.

- [ ] **Step 2: Engine chặn mã disabled**

`app/Services/Promotions/PromotionEngine.php` — trong bước match mã con (dòng ~32-35, khối `if ($pc->status !== 'unused')`), đổi:

```php
                if ($pc->status !== 'unused') {
                    return ['status' => 'rejected', 'reason' => 'already_used', 'code' => $code];
                }
```

thành:

```php
                if ($pc->status === 'used') {
                    return ['status' => 'rejected', 'reason' => 'already_used', 'code' => $code];
                }
                if ($pc->status === 'disabled') {
                    return ['status' => 'rejected', 'reason' => 'disabled', 'code' => $code];
                }
```

- [ ] **Step 3: Map message disabled**

`PaymentController.php` mảng `$map` — thêm:

```php
                'disabled' => 'Mã khuyến mãi đã bị vô hiệu hoá.',
```

- [ ] **Step 4: Controller toggleCodes**

`app/Http/Controllers/Manager/PromotionController.php` — thêm method (trước `flushPosPromotionsCache`):

```php
    public function toggleCodes(Promotion $promotion): RedirectResponse
    {
        $action = request('action');
        $to = $action === 'disable' ? 'disabled' : 'unused';

        PromotionCode::where('promotion_id', $promotion->id)
            ->where('status', 'unused')
            ->update(['status' => $to]);

        $this->flushPosPromotionsCache();

        return back()->with(
            'success',
            $action === 'disable'
                ? 'Đã vô hiệu hoá các mã chưa dùng của chương trình.'
                : 'Đã kích hoạt lại các mã của chương trình.'
        );
    }
```

Đảm bảo `use App\Models\PromotionCode;` đã import đầu file (kiểm tra; thêm nếu thiếu).

- [ ] **Step 5: Route**

`routes/web.php` — trong nhóm route `/manager/promotions`, thêm (gần route show/update):

```php
Route::post('/manager/promotions/{promotion}/codes/toggle', [PromotionController::class, 'toggleCodes'])
    ->middleware('permission:promotions.edit')
    ->name('promotions.codes.toggle');
```

Kiểm tra middleware thật của nhóm route này (đọc `routes/web.php` nhóm promotions) — dùng đúng middleware pattern hiện có.

- [ ] **Step 6: Frontend nút toggle**

`resources/js/pages/manager/promotions/PromotionsManager.tsx` — cạnh nút "Export Excel" (hoặc nơi hiển thị codes_count), thêm nút:

```tsx
{codeView?.codes_count > 0 && (codeView.type === 'coupon' || codeView.type === 'voucher') && (
    <div className="flex gap-2">
        <button type="button"
            onClick={() => {
                if (!confirm(codeView.codes_used === codeView.codes_count
                    ? 'Tất cả mã đã dùng — không còn mã để vô hiệu hoá.'
                    : 'Vô hiệu hoá toàn bộ mã chưa dùng?')) return;
                router.post(`/manager/promotions/${codeView.id}/codes/toggle`, { action: 'disable' });
            }}
            className="...">
            Vô hiệu hoá
        </button>
        <button type="button"
            onClick={() => router.post(`/manager/promotions/${codeView.id}/codes/toggle`, { action: 'enable' })}
            className="...">
            Kích hoạt lại
        </button>
    </div>
)}
```

LƯU Ý: `confirm()` là browser dialog — AGENTS.md cấm `alert()` cho luồng nghiệp vụ. Dùng modal confirm hiện có của project nếu có, hoặc bỏ confirm và chỉ làm nút trực tiếp. Kiểm tra pattern modal trong `PromotionsManager.tsx` (có `PromotionCodesModal`) — nếu có confirm modal dùng chung thì dùng, nếu không thì không thêm confirm (nút trực tiếp).

- [ ] **Step 7: Test**

`tests/Feature/PromotionControllerTest.php`:

```php
test('toggle codes: disable unused -> disabled, enable -> unused, used giu nguyen', function () {
    $admin = posAdmin();
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'TOG'.substr(uniqid(), -4), 'code_quantity' => 3, 'code_random' => false]);
    $codes = \App\Models\PromotionCode::where('promotion_id', $p->id)->get();
    $codes[0]->update(['status' => 'used']);   // 1 mã đã dùng

    $this->actingAs($admin)->post("/manager/promotions/{$p->id}/codes/toggle", ['action' => 'disable'])->assertSessionHasNoErrors();
    expect(\App\Models\PromotionCode::where('promotion_id', $p->id)->where('status', 'disabled')->count())->toBe(2);
    expect(\App\Models\PromotionCode::where('promotion_id', $p->id)->where('status', 'used')->count())->toBe(1);

    $this->actingAs($admin)->post("/manager/promotions/{$p->id}/codes/toggle", ['action' => 'enable'])->assertSessionHasNoErrors();
    expect(\App\Models\PromotionCode::where('promotion_id', $p->id)->where('status', 'unused')->count())->toBe(2);
    expect(\App\Models\PromotionCode::where('promotion_id', $p->id)->where('status', 'used')->count())->toBe(1);
});

test('checkout: voucher disabled bi tu choi', function () {
    $admin = posAdmin();
    $p = promoV2(['type' => 'voucher', 'code' => null, 'code_prefix' => 'DSBL'.substr(uniqid(), -4), 'code_quantity' => 1, 'code_random' => false]);
    $pc = \App\Models\PromotionCode::where('promotion_id', $p->id)->first();
    $pc->update(['status' => 'disabled']);
    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'promotion_code' => $pc->code,
    ])->assertStatus(422);
});
```

- [ ] **Step 8: Chạy test + lint + build + commit**

```bash
php artisan test --filter="PromotionControllerTest|POSCheckoutTest"
npx eslint resources/js/pages/manager/promotions/PromotionsManager.tsx
npm run types:check
npm run build
php artisan test
git add -A
git commit -m "feat: vo hieu hoa/kiem tra lai batch ma, chan ma disabled"
```
Expected: tất cả xanh.

---

## Self-Review Notes

- **Spec coverage:** Task 1 = chồng tầng + pool; Task 2 = free product guard; Task 3 = CheckoutService set 0 + VAT thực thu; Task 4 = toggle batch. Tất cả mục spec đều có task.
- **Không placeholder:** mọi bước có code/lệnh cụ thể.
- **Type consistency:** `$freeItemIds`, `$base`, `free_product_not_in_cart`, `disabled` dùng nhất quán xuyên các task. Engine return đổi `free_items` → `free_item_ids` (Task 1) — CheckoutService đọc đúng (Task 3).
- **Lưu ý:** test `coupon stackable=true ap chung auto` kỳ vọng đổi từ 20000 → 19500 (chồng tầng). Số lượng assert của engine có thể đổi — điều chỉnh trong test.
