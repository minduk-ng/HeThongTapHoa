# Design: 4 Cải Tiến Cốt Lõi Khuyến Mãi (Chồng Tầng / Free Product / VAT Thực Thu / Vô Hiệu Batch)

**Ngày:** 2026-08-14
**Phạm vi:** Sửa 4 điểm trong lõi tính toán thanh toán & khuyến mãi: (1) tính giảm giá chồng tầng promotion → mã (hết bug 60%+60%=120%), (2) free product theo luồng thật (món tặng phải có trong giỏ, set giá 0, trừ kho đúng), (3) VAT theo giá thực thu (giảm giá làm giảm cơ sở thuế), (4) nút vô hiệu hoá/kích hoạt lại batch mã.

---

## Bối cảnh & Vấn đề

1. **Giảm giá cộng dồn độc lập trên subtotal gốc** (`PromotionEngine.php:113-142`): mỗi mã tính % trên `$subtotal` cố định. 2 mã 60%+60% = 120% (bị chặn ở 100% bởi `$remaining` nhưng gây hiểu nhầm, sai bản chất chồng tầng).
2. **Free product không trừ kho** (`CheckoutService.php:231-248`): món tặng chỉ thêm `InvoiceLine` 0đ, không nằm trong `order_items` → `createStockExportVoucher()` (đếm `order_items`) bỏ qua → kho lệch.
3. **VAT tính trên subtotal gốc** (`CheckoutService.php:172-173`, `OrderTotals.php`): `vat_amount` không giảm khi có discount → báo cáo thuế sai.
4. **Không thể thu hồi batch mã** đã phát hành khi phát hiện lỗi.

## Quyết định

| # | Thay đổi | Hành vi mới |
|---|---|---|
| 1 | **Chồng tầng (tiered)** | Promotion tự động tính TRƯỚC trên subtotal; mã coupon/voucher (chỉ 1 mã/đơn) tính SAU trên giá đã giảm. |
| 2 | **Free product theo luồng thật** | Nhân viên bấm thêm món tặng vào giỏ (giá đầy đủ). Khi nhập mã có `free_product`: nếu món ĐÃ có trong giỏ → set giá món đó = 0; nếu không → chặn mã (lỗi). Bỏ cơ chế tự thêm line 0đ. |
| 3 | **VAT thực thu** | VAT tính trên giá thực thu sau discount: `total = subtotal − discount`; VAT của hoá đơn = VAT tỷ lệ trên total. Mỗi line `vat_amount` tỷ lệ theo discount phân bổ. |
| 4 | **Vô hiệu batch mã** | Thêm `status='disabled'` cho `promotion_codes`. Nút "Vô hiệu hoá"/"Kích hoạt lại" trên Quản lý KM cho campaign có mã. Engine từ chối mã `disabled`. |

---

## Kiến trúc & Thay đổi

### 1. Engine chồng tầng — `app/Services/Promotions/PromotionEngine.php`

**Vòng lặp áp dụng (dòng 113-162):** thay `$subtotal` cố định bằng `$base` giảm dần.

```php
// Trước:
$totalDiscount = 0.0;
foreach ($pool as $p) {
    $discount = 0.0;
    foreach ($p->actions as $action) {
        if ($action->action_type === 'discount_percent') {
            $d = $subtotal * ($action->action_value / 100);   // subtotal cố định
            ...
        }
    }
    $remaining = max(0.0, $subtotal - $totalDiscount);
    $amount = round(min(max(0.0, $discount), $remaining), 2);
    $totalDiscount += $amount;
    ...
}
```

```php
// Sau:
$base = $subtotal;
$totalDiscount = 0.0;
foreach ($pool as $p) {
    $discount = 0.0;
    foreach ($p->actions as $action) {
        if ($action->action_type === 'discount_percent') {
            $d = $base * ($action->action_value / 100);       // base giảm dần
            if ($action->max_discount_amount !== null) {
                $d = min($d, (float) $action->max_discount_amount);
            }
            $discount += $d;
            $actionsApplied[] = ['type' => 'discount_percent', 'value' => $action->action_value];
        } elseif ($action->action_type === 'discount_amount') {
            $discount += (float) $action->action_value;
            $actionsApplied[] = ['type' => 'discount_amount', 'value' => (float) $action->action_value];
        } elseif ($action->action_type === 'free_product') {
            // Xử lý free product ở bước 2b bên dưới (không cộng vào $discount)
        }
    }
    $remaining = max(0.0, $base - $totalDiscount);
    $amount = round(min(max(0.0, $discount), $remaining), 2);
    $totalDiscount += $amount;
    $base = max(0.0, $base - $amount);   // giảm base cho promotion kế tiếp / mã
    ...
}
```

**Thứ tự pool:** promotion tự động đã được thêm SAU codePromotions trong pool (dòng 108-111: `$pool = $codePromotions; $pool[] = $auto`). ĐỔI thứ tự: pool = `[$auto, ...$codePromotions]` (auto trước, mã sau) để đúng "promotion trước, mã sau".

```php
$pool = [];
if ($auto) {
    $pool[] = $auto;
}
foreach ($codePromotions as $cp) {
    $pool[] = $cp;
}
```

Lưu ý: `$hasNonStackable` chặn auto khi mã `stackable=false` vẫn giữ nguyên (không có auto trong pool → chỉ mã tính trên subtotal).

### 2. Free product theo luồng thật

**2a. Engine (`PromotionEngine.php`):**

- Bỏ `$freeItems[] = [...]` cũ (dòng 131-136) — không còn tự thêm line 0đ.
- Với action `free_product`: kiểm tra **món tặng có trong lines** không:
```php
} elseif ($action->action_type === 'free_product') {
    $hasFreeInCart = $lines->contains(fn ($l) => (int) ($l['menu_item_id'] ?? 0) === (int) $action->action_value);
    if (! $hasFreeInCart) {
        return ['status' => 'rejected', 'reason' => 'free_product_not_in_cart', 'code' => null];
    }
    $actionsApplied[] = ['type' => 'free_product', 'value' => (int) $action->action_value];
    $freeItemIds[] = (int) $action->action_value;   // chỉ 1 món tặng đầu tiên mỗi loại
}
```

- Kết quả trả về: `free_item_ids` thay cho `free_items`:
```php
'free_item_ids' => array_values(array_unique($freeItemIds)),
```

- Thêm reason `free_product_not_in_cart` → PaymentController map message: `'Đơn cần có món tặng mới áp dụng được mã này.'`

**2b. CheckoutService (`app/Services/Checkout/CheckoutService.php`):**

- Bỏ block 6b (tự thêm InvoiceLine 0đ, dòng 231-248).
- Sau khi phân bổ discount (bước 2b, dòng 126-137): với mỗi `free_item_id`, tìm line trong `lineInputs` có `menu_item_id` khớp (món tặng đầu tiên) và **set `unit_price=0`, `subtotal=0`, `discount_amount=subtotal_gốc`** — tức món tặng thành 0đ nhưng vẫn là order_item → **trừ kho đúng luồng** (vì `createStockExportVoucher` đếm order_items có quantity).
- Cụ thể trong vòng lặp 2b, sau khi tính `lineDiscount`, thêm:
```php
$isFree = in_array((int) $li['menu_item_id'], $freeItemIds, true);
if ($isFree && ! in_array($li['order_item_id'], $freeHandledIds, true)) {
    $lineInputs[$idx]['unit_price'] = 0.0;
    $lineInputs[$idx]['subtotal'] = 0.0;
    $lineInputs[$idx]['vat_amount'] = 0.0;
    $lineInputs[$idx]['discount_amount'] = round((float) $li['subtotal'], 2);
    $freeHandledIds[] = $li['order_item_id'];
    continue; // không tính lineDiscount bình thường
}
```

- `$totalDiscount` phải được **cộng thêm giá trị món tặng** (vì subtotal giảm tương ứng). Sau bước 2b:
```php
foreach ($freeItemIds as $fid) {
    $freeLine = collect($lineInputs)->firstWhere('menu_item_id', $fid);
    if ($freeLine) {
        $totalDiscount += (float) $freeLine['subtotal'];   // món tặng trừ cả giá
    }
}
$total = max(0.0, $subtotal - $totalDiscount);
```
Lưu ý: `lineInputs[]['subtotal']` đã bị set 0 ở trên → cần lưu `subtotal_gốc` trước khi set 0 (dùng biến tạm).

- `appliedPromotions` vẫn ghi promotion free_product với `amount` = giá trị món tặng (để báo cáo đúng) — cần engine trả `amount` cho free action = subtotal món tặng (xem 2c).

**2c. Engine — amount của free_product action:**

Trong vòng lặp áp dụng, `$discount` cho free_product = tổng subtotal của các line món tặng tương ứng (để `$amount` của promotion phản ánh giá trị tặng):
```php
} elseif ($action->action_type === 'free_product') {
    $freeSubtotal = $lines->where('menu_item_id', (int) $action->action_value)->sum('subtotal');
    $discount += (float) $freeSubtotal;
    ...
}
```
→ promotion free_product có `amount` = giá trị món tặng, `total_discount` tăng tương ứng, và `$base` giảm — nhất quán với 2b.

### 3. VAT thực thu

**`app/Services/Checkout/CheckoutService.php`:**

- Hiện: `vatTotal` tính trên subtotal từng line (dòng 56-80), `total = subtotal − discount` (dòng 139), `vat_amount = $vatTotal` (dòng 172).
- Mới: VAT tính trên **giá thực thu sau discount** của từng line:
```php
// Trong vòng lặp lineInputs (bước 1), lưu cả subtotal gốc và vat theo subtotal gốc để tham chiếu.
// Sau bước 2b (sau khi có discount_amount mỗi line):
$lineNetTotal = max(0.0, (float) $li['subtotal'] - (float) $li['discount_amount']);
$li['vat_amount'] = OrderTotals::vatInPrice($lineNetTotal, (float) $li['vat_rate']);
```

- `vatTotal` của hoá đơn = sum `vat_amount` đã tính lại (sau discount), không còn tính ở bước 1.
- `OrderTotals::preview()` — cập nhật signature nhận thêm discount per line hoặc tính lại trong CheckoutService trực tiếp. Đơn giản: CheckoutService tự tính `vat_amount` sau khi phân bổ discount, bỏ dùng `preview()` cho mục đích này.

**`app/Services/Checkout/OrderTotals.php`:**

- Giữ `vatInPrice`/`netOf` nguyên (đã đúng: net = floor(subtotal/(1+rate)), vat = subtotal − net).
- `preview()`: giữ nguyên cho mục đích hiển thị subtotal/vat không discount (POS trước khi áp mã). Không đổi.

**Kết quả:** đơn 100k (vat_rate 10%, ~9.09k VAT) giảm 28k → total 72k → net = floor(72/1.1) = 65.45k → VAT = 6.55k. Đúng thuế thực thu.

### 4. Vô hiệu hoá/kích hoạt lại batch mã

**Migration** (`2026_08_14_000001_add_disabled_to_promotion_codes_status.php`):
```php
DB::statement("ALTER TABLE promotion_codes MODIFY COLUMN status ENUM('unused','used','disabled') NOT NULL DEFAULT 'unused'");
```

**`app/Models/PromotionCode.php`:** bổ sung `const STATUS_DISABLED = 'disabled';` (nếu chưa có constant).

**`PromotionEngine.php`:** trong bước match mã con (dòng 32-35):
```php
if ($pc->status === 'used') {
    return ['status' => 'rejected', 'reason' => 'already_used', 'code' => $code];
}
if ($pc->status === 'disabled') {
    return ['status' => 'rejected', 'reason' => 'disabled', 'code' => $code];
}
```

**`PaymentController.php`:** thêm map `'disabled' => 'Mã khuyến mãi đã bị vô hiệu hoá.'`

**`PromotionController.php`** — thêm route + method:
```php
public function toggleCodes(Promotion $promotion): RedirectResponse
{
    $to = request('action') === 'disable' ? 'disabled' : 'unused';
    PromotionCode::where('promotion_id', $promotion->id)
        ->where('status', 'unused')      // chỉ unused chuyển được; used/disabled giữ
        ->update(['status' => $to]);
    $this->flushPosPromotionsCache();
    return back()->with('success', request('action') === 'disable' ? 'Đã vô hiệu hoá các mã chưa dùng.' : 'Đã kích hoạt lại các mã.');
}
```
Route trong `routes/web.php`: `POST /manager/promotions/{promotion}/codes/toggle` (middleware quyền promotions.edit).

**Frontend `PromotionsManager.tsx`:** thêm nút "Vô hiệu hoá"/"Kích hoạt lại" bên cạnh nút Export (chỉ khi `codes_count > 0` và type là coupon/voucher). Confirmation nếu vô hiệu hoá. Dùng `router.post` gọi route trên.

**Ghi chú:** kích hoạt lại chỉ chuyển `disabled → unused`; mã đã `used` không khôi phục.

---

## Error handling

- `free_product_not_in_cart` → PaymentController map message "Đơn cần có món tặng mới áp dụng được mã này." (validate + checkout).
- `disabled` → map "Mã khuyến mãi đã bị vô hiệu hoá.".
- Chồng tầng: `$remaining` cap giữ nguyên → không bao giờ âm.
- VAT: món tặng vat=0 (free).

## Testing

- **Engine (`PromotionV2Test` / `Services/PromotionEngineTest`):**
  - `chồng tầng: promotion 10% + mã 20% trên 100k = 28k` (10k + 18k).
  - `free_product khi món KHÔNG trong giỏ → rejected free_product_not_in_cart`.
  - `free_product khi món trong giỏ → amount = subtotal món tặng`.
  - `mã disabled → rejected disabled`.
  - Test cũ về cộng dồn độc lập (`coupon stackable=true ap chung auto` kỳ vọng 20000 cho 10%+5000 → giờ khác) — CẬP NHẬT kỳ vọng theo chồng tầng.
- **CheckoutService (`POSCheckoutTest` / `PromotionV2Test`):**
  - `free product: thêm món tặng có giá vào order, checkout với mã → món đó 0đ, kho trừ nguyên liệu món tặng`.
  - `VAT sau discount: đơn 100k vat 10% giảm 28k → total 72k, vat ≈ 6.5k`.
  - `voucher disabled không checkout được`.
  - `toggle codes: disable → unused thành disabled; enable → disabled về unused; used không đổi`.
- `php artisan test` toàn bộ xanh, `npx eslint`, `npm run types:check`, `npm run build`.

---

## Không nằm trong phạm vi

- Thay đổi giới hạn "1 mã/đơn" (giữ nguyên).
- Migration dữ liệu cũ (chỉ add enum value).
- Thay đổi `max_discount_amount`, `min_order_value`, time slot.
- Khôi phục mã đã `used`.
