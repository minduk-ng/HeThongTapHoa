# Promotion v2 — DB + Engine (Spec 1/3)

> Spec 1 của loạt 3 spec: DB redesign (tách 3 bảng promotions) + engine khuyến mãi mới (conditions/actions, race condition, FREE_PRODUCT). Spec 2 = frontend quản lý (2 trang mẫu HTML). Spec 3 = analytics + daily_promotion_stats.

**Goal:** Thay schema promotions 1 bảng bằng 3 bảng tách (promotions + promotion_conditions + promotion_actions) + bảng fact order_promotions; viết lại engine hỗ trợ nhiều điều kiện AND, nhiều hành động đồng thời, 3 loại (PROMOTION tự động / COUPON / VOUCHER), FREE_PRODUCT (tặng món giá 0đ), và race-condition-safe quota.

**Scope:** Backend toàn bộ (migration + models + engine + CheckoutService + PromotionController + tests). KHÔNG làm UI (spec 2), KHÔNG làm analytics (spec 3). DB hiện tại: bảng `promotions` RỖNG, nhưng `orders.promotion_id` có dữ liệu đơn cũ + `invoice_promotions` snapshot đã ghi.

---

## Phần 1 — Schema 4 bảng mới

### `promotions` (mới, thay bảng cùng tên cũ)

```
id
name                 string
type                 enum['promotion','coupon','voucher']
code                 string nullable unique       // COUPON/VOUCHER bắt buộc; PROMOTION null
start_date           datetime nullable
end_date             datetime nullable
status               boolean default true          // active / paused
max_usage            int nullable                 // tổng giới hạn toàn hệ thống; null = không giới hạn
used_count           int default 0
exclusive            boolean default false         // không stack với mã khác
stackable            boolean default true          // cho phép đè lên promotion tự động
timestamps
softDeletes
```

### `promotion_conditions` (điều kiện — TẤT CẢ phải thoả, AND)

```
id
promotion_id         FK promotions cascadeOnDelete
cond_type            enum['min_order_value','min_quantity','specific_product']
cond_value           string    // '200000' tiền | '3' số lượng | menu_item_id món
timestamps
```

### `promotion_actions` (hành động — áp dụng ĐỒNG THỜI)

```
id
promotion_id         FK promotions cascadeOnDelete
action_type          enum['discount_percent','discount_amount','free_product']
action_value         decimal(15,2)  // 10 = 10%; 50000 = 50k; free_product = menu_item_id
max_discount_amount  decimal(15,2) nullable   // cap khi discount_percent
timestamps
```

### `order_promotions` (fact — báo cáo spec 3 + lịch sử)

```
id
invoice_id           FK invoices cascadeOnDelete
order_id             FK orders nullOnDelete
promotion_id         FK promotions nullOnDelete    // null nếu promotion bị xoá
code_used            string nullable
discount_applied     decimal(15,2)
timestamps
```

### Migration path (bảng `promotions` cũ RỖNG, orders.promotion_id có dữ liệu)

Thứ tự trong 1 migration (transaction):
1. **Rename** `promotions` → `legacy_promotions` (giữ FK orders nguyên vẹn tạm thời).
2. **Create** `promotions` (mới) + `promotion_conditions` + `promotion_actions` + `order_promotions`.
3. **Drop FK** `orders.promotion_id` → set column null → drop column.
4. **Drop** `legacy_promotions`.
5. Model `Promotion` giữ tên, tự trỏ bảng `promotions` mới (cùng tên → không đổi).

Lịch sử đơn cũ không mất: `invoice_promotions` (snapshot code/name/discount_type/discount_value/amount) giữ nguyên, không phụ thuộc bảng promotions.

**Down():** recreate legacy nếu có, drop 3 bảng mới + order_promotions, khôi phục orders.promotion_id FK.

---

## Phần 2 — Models

- `Promotion` — fillable mới; relations: `conditions` (hasMany), `actions` (hasMany). **BỎ** các cột cũ `target_type`/`target_value`/`min_order_amount`/`max_discount_amount` + static methods `targetSubtotal`/`allocateLineDiscounts`.
- `PromotionCondition` — fillable, `promotion()` belongsTo.
- `PromotionAction` — fillable, `promotion()` belongsTo.
- `OrderPromotion` — fillable, `invoice()`/`order()`/`promotion()` belongsTo.

---

## Phần 3 — Engine mới (PromotionEngine viết lại)

### Input
`resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array`
- `lines`: `{order_item_id, menu_item_id, quantity, subtotal, category_id}`
- Return: `{status, promotions?: [{promotion, amount, code, actions_applied}], total_discount, free_items?: [{menu_item_id, name}]}`

### Bước 1 — Xác định pool
- **PROMOTION tự động**: quét `type=promotion` active trong hạn, eager-load conditions/actions, lọc thoả điều kiện, **chọn 1 TỐT NHẤT** (ước lượng discount cao nhất). Chỉ 1.
- **COUPON/VOUCHER**: từng `code` nhập → `lockForUpdate()->where('code', $code)` → validate (tồn tại/active/trong hạn/quota). Nếu 1 mã lỗi → `rejected(reason)`.

### Bước 2 — exclusive / stackable
- Có mã `exclusive=true` → bỏ hết promotion khác (chỉ giữ nó).
- PROMOTION tự động bị loại nếu có COUPON `stackable=false` trong pool.
- Thứ tự ưu tiên: **mã nhập trước, tự động sau; exclusive thắng tất cả.**

### Bước 3 — Match điều kiện (AND)
Mỗi `condition` phải thoả:
- `min_order_value`: `subtotal >= cond_value`
- `min_quantity`: `sum(lines.quantity) >= cond_value`
- `specific_product`: `lines` có `menu_item_id == cond_value`
Mọi condition false → loại promotion.

### Bước 4 — Áp dụng hành động (đồng thời)
- `discount_percent`: `subtotal × action_value/100`, cap `max_discount_amount` (nếu có)
- `discount_amount`: `+ action_value`
- `free_product`: thu `menu_item_id`, thêm vào `free_items` (món đã soft-delete → bỏ qua)
- Tổng discount cap ở subtotal (không bao giờ âm tiền): `min(total_discount, subtotal)`

### Bước 5 — Ghi discount (quyết định: tổng, không line-level)
**KHÔNG phân bổ xuống từng line.** `order_promotions.discount_applied` ghi **tổng discount của từng mã** theo invoice. Báo cáo spec 3 đọc theo invoice (`SUM(order_promotions.discount_applied) GROUP BY promotion_id`), không cần line-level. `invoice_lines.discount_amount` giữ nguyên như hiện tại (phân bổ sẵn từ hệ cũ cho hoá đơn cũ); engine mới không thay đổi nó.

---

## Phần 4 — CheckoutService + race condition + order_promotions

### Race condition — quota (bắt buộc)
```php
// TRONG DB::transaction của runBulk:
$p = Promotion::where('code', $code)->lockForUpdate()->first();   // khóa row
if ($p->max_usage !== null && $p->used_count >= $p->max_usage) {
    return rejected('out_of_uses');
}
$p->increment('used_count');   // trong cùng transaction, sau lock
```
→ 2 bàn thanh toán đồng thời: bàn A lock → increment 9→10 → commit; bàn B chờ lock → thấy 10 đủ → từ chối. Không bao giờ vượt quota.

### FREE_PRODUCT — thêm line 0đ
Sau khi tạo invoice_lines từ order_items, mỗi free_item:
```php
InvoiceLine::create([
    'invoice_id' => $invoice->id,
    'menu_item_id' => $freeItemId,
    'name_snapshot' => $menuItem->name,
    'quantity' => 1, 'unit_price' => 0, 'subtotal' => 0,
    'vat_rate' => 0, 'vat_amount' => 0, 'discount_amount' => 0,
]);
```

### Ghi order_promotions (fact)
Với mỗi mã/promotion áp dụng, ghi **1 dòng per order** (bulk checkout nhiều order → nhiều dòng, mỗi dòng 1 order, cùng discount_applied của mã đó — tổng đúng theo invoice khi SUM):
```php
foreach ($orders as $order) {
    foreach ($applied as $promo) {
        OrderPromotion::create([
            'invoice_id' => $invoice->id,
            'order_id' => $order->id,
            'promotion_id' => $promo->promotion->id,
            'code_used' => $promo->code ?? null,
            'discount_applied' => $promo->amount,
        ]);
    }
}
```
→ `SUM(discount_applied) WHERE invoice_id = X` = tổng giảm của hóa đơn; `COUNT(DISTINCT order_id)` = số đơn đã dùng mã.

### invoice_promotions (snapshot hoá đơn)
Giữ nguyên (code/name/discount_type/discount_value/amount) để hoá đơn in/render không đổi. Bỏ `Promotion::increment('used_count')` cũ (đã làm trong lock).

### Thay đổi khác
- `PromotionController::store/update` — validate + ghi 3 bảng (promotions + conditions + actions) trong transaction. Nhận payload mới: `{name, type, code?, start_date, end_date, status, max_usage, exclusive, stackable, conditions:[{cond_type, cond_value}], actions:[{action_type, action_value, max_discount_amount?}]}`.
- `validatePromotion` (POS preview) — gọi engine mới, trả preview.
- `Promotion::where()->increment('used_count')` trong CheckoutService bỏ.
- Routes giữ nguyên tên (`GET/POST /manager/promotions`, `/pos/validate-promotion`).

---

## Phần 5 — Thứ tự ưu tiên & xử lý lỗi

**Ưu tiên:**
```
1. COUPON/VOUCHER nhập mã: áp tất cả theo thứ tự nhập (trừ khi 1 mã exclusive)
2. PROMOTION tự động: chỉ áp nếu KHÔNG có mã stackable=false
3. exclusive=true: bỏ hết mọi thứ, chỉ giữ nó
```

**Lỗi (reason string cho validatePromotion/checkout):**
- `not_found` — mã không tồn tại
- `inactive` — bị tạm dừng
- `not_started` / `expired` — ngoài hạn
- `out_of_uses` — hết quota (sau lock)
- `condition_not_met` — không thoả điều kiện (thay `below_min`/`no_eligible_line` cũ)
- `exclusive_conflict` — có exclusive nhưng vẫn có mã khác
- FREE_PRODUCT món soft-delete → bỏ qua action, không chặn checkout

---

## Phần 6 — Kiểm thử

- **Migration:** 4 bảng mới tồn tại; `legacy_promotions` không tồn tại; `orders.promotion_id` không còn; order_promotions ghi đúng FK.
- **Conditions:** min_order_value / min_quantity / specific_product — đơn không thoả → rejected; nhiều condition AND (tất cả phải thoả).
- **Actions:** discount_percent (cap max_discount_amount), discount_amount, free_product (line 0đ xuất hiện trên invoice_lines), nhiều action đồng thời.
- **3 loại:** PROMOTION tự chọn tốt nhất; COUPON/VOUCHER theo code; exclusive vs stackable.
- **Race:** 2 checkout đồng thời → used_count không vượt max_usage (test với transaction lồng hoặc lockForUpdate).
- **Regression:** 8 test promotion cũ chuyển đổi assertion (below_min → condition_not_met, target_type → conditions); full suite pass.

## File Structure

**Migration:** `2026_08_10_000001_create_promotion_v2_tables.php` (rename legacy + 4 bảng mới + drop FK + drop legacy).

**Models:** `Promotion` (sửa), `PromotionCondition` (mới), `PromotionAction` (mới), `OrderPromotion` (mới).

**Services:** `PromotionEngine` (viết lại), `CheckoutService` (sửa call engine + free_product + order_promotions + bỏ increment cũ).

**Controllers:** `PromotionController` (store/update validate 3 bảng), `PaymentController::validatePromotion` (engine mới).

**Tests:** mới `PromotionV2Test.php` (conditions/actions/types/race) + chuyển đổi 8 test cũ.
