# Design: Gộp "Độc quyền" + "Áp dụng đồng thời" thành 1 toggle `stackable`

**Ngày:** 2026-08-14
**Phạm vi:** Hợp nhất 2 toggle `exclusive` + `stackable` của promotion thành 1 toggle duy nhất `stackable` (giữ cột `stackable`, bỏ cột `exclusive`). Giới hạn mỗi đơn tối đa 1 promotion tự động + 1 coupon/voucher (đã đúng qua UI POS 1 ô nhập mã). Dọn toàn bộ dead code `exclusive`.

---

## Bối cảnh & Vấn đề

Hiện tại promotion có 2 toggle gần giống nhau khiến người dùng khó hiểu:
- **Độc quyền** (`exclusive`): nếu nhiều mã code được nhập, mã `exclusive` loại hết mã khác (PromotionEngine.php:76-81); đồng thời chặn auto promotion (PromotionEngine.php:109).
- **Áp dụng đồng thời** (`stackable`): `false` → chặn auto promotion (PromotionEngine.php:88-89), NHƯNG không ảnh hưởng tới các mã code khác.

Sự mơ hồ: khi `exclusive=true`, `stackable` trở nên vô nghĩa (đã chặn hết). Khi chỉ có 1 mã code, `exclusive=true` và `stackable=false` cho kết quả y hệt nhau. UI hiện hiển thị cả 2 checkbox độc lập → người dùng có thể bật cùng lúc 2 trạng thái mâu thuẫn.

Ngoài ra: UI POS (`PaymentDrawer.tsx`) chỉ có **1 ô nhập mã** và `usePOSCheckout.ts` giữ `promotionCode` là **1 string** — nên thực tế mỗi đơn chỉ nhập được 1 mã. Backend `PromotionEngine::resolveAll` nhận mảng `codes` nhưng frontend chỉ gửi 1. Vậy việc "nhiều mã code cùng lúc" không tồn tại ở UI — chỉ còn quan hệ **mã code ↔ promotion tự động**.

## Quyết định

- **Mỗi đơn tối đa 1 promotion tự động + 1 coupon/voucher** (đúng hiện trạng UI, không mở rộng sang nhiều mã).
- **1 toggle duy nhất "Độc quyền"** chỉ hiển thị cho loại `coupon`/`voucher`:
  - **Tắt** (mặc định) → `stackable=true` → mã áp chung với promotion tự động (1+1).
  - **Bật** → `stackable=false` → mã KHÔNG áp chung với promotion (không có auto).
- Loại **promotion** (tự động) → **ẩn toggle** (không có mã nên vô nghĩa).
- Cột DB: giữ `stackable`, **bỏ `exclusive`**.
- Dọn toàn bộ dead code `exclusive` (model, controller, engine, tests, frontend type/state).

## Mục tiêu

- User chỉ thấy 1 toggle "Độc quyền" trên form coupon/voucher, không còn 2 toggle mâu thuẫn.
- Mã `stackable=false` → chặn auto promotion (hành vi nhất quán).
- Không còn tham chiếu `exclusive` trong codebase.

---

## Kiến trúc & Thay đổi

### 1. Database & Model

**Migration mới** (`2026_08_14_drop_exclusive_from_promotions.php`):
- `DB::table('promotions')->where('exclusive', true)->update(['stackable' => false])` — chuyển dữ liệu cũ.
- `Schema::table('promotions', fn ($t) => $t->dropColumn('exclusive'))`.

**`app/Models/Promotion.php`:**
- Xoá `@property bool $exclusive`.
- Xoá `'exclusive'` khỏi `$fillable`.
- Xoá `'exclusive' => 'bool'` khỏi `$casts`.

### 2. Backend engine — `app/Services/Promotions/PromotionEngine.php`

- **Xoá bước 2** (dòng 75-81): logic "1 mã exclusive → bỏ hết mã khác" không còn (chỉ 1 mã được nhập từ UI; nếu nhiều mã vẫn đến, không còn luật exclusive để loại — chấp nhận cộng dồn như stackable quyết định).

```php
// XOÁ toàn bộ khối:
if (count($codePromotions) > 1) {
    $exclusive = collect($codePromotions)->first(fn ($p) => $p->exclusive);
    if ($exclusive) {
        $codePromotions = [$exclusive];
    }
}
```

- **Dòng 109** — bỏ điều kiện chống exclusive, chỉ giữ stackable:

```php
// Trước:
if ($auto && collect($codePromotions)->doesntContain(fn ($p) => $p->exclusive)) {
    $pool[] = $auto;
}

// Sau:
if ($auto) {
    $pool[] = $auto;
}
```

- **Dòng 88** — giữ nguyên: `$hasNonStackable = collect($codePromotions)->contains(fn ($p) => ! $p->stackable);` → nếu mã `stackable=false` thì auto không được quét (`$auto` vẫn `null`). Đây chính là hành vi "không áp chung".

Kết quả sau khi xoá: engine chỉ dùng `stackable` để quyết định mã có áp chung với auto hay không.

### 3. Backend controller

**`app/Http/Controllers/Manager/PromotionController.php`:**
- Dòng 66: xoá `'exclusive' => $p->exclusive,` khỏi response index/show.
- Dòng 337, 393: xoá `'exclusive' => $validated['exclusive'] ?? false,` khỏi store/update.
- Dòng 462: xoá `'exclusive' => ['sometimes', 'boolean'],` khỏi validation rules.

**`app/Http/Controllers/Staff/PaymentController.php`:**
- Dòng 84: xoá mục map `'exclusive_conflict' => '...'` (reason này không còn ai trả về).

### 4. Frontend form — `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx`

- Xoá state `const [exclusive, setExclusive] = useState(false);` (dòng 37).
- Xoá `setExclusive(...)` trong useEffect (dòng 74).
- Submit payload (dòng 148): xoá `exclusive`, đổi thành **`stackable` là nghịch đảo của toggle "Độc quyền"**:

```ts
stackable: !exclusive,   // toggle "Độc quyền" bật → stackable=false
```

Thiết kế cụ thể trong form:
- Giữ 1 biến state `exclusive` duy nhất, mặc định `false`.
- Bọc phần toggle trong điều kiện `type !== 'promotion'`:

```jsx
{type !== 'promotion' && (
    <div className="flex items-start justify-between gap-4">
        <div>
            <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-1">Độc quyền</label>
            <p className="text-xs text-zinc-500">Không áp dụng chung với các chương trình khuyến mãi tự động.</p>
        </div>
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} className="h-4 w-4 accent-sky-600" />
    </div>
)}
```

- Xoá hoàn toàn toggle "Áp dụng đồng thời" cũ (dòng 333-339).
- Khi `promotionToEdit` load: `setExclusive(!promotionToEdit.stackable)` (vì toggle là nghịch đảo).

**`resources/js/pages/manager/promotions/PromotionsManager.tsx`:**
- Dòng 40: xoá `exclusive: boolean;` khỏi interface `PromotionData`.

### 5. Frontend POS — không đổi

`PaymentDrawer.tsx` / `usePOSCheckout.ts` giữ nguyên: 1 ô nhập mã, gửi `code` đơn. Backend tự loại auto khi mã `stackable=false`.

### 6. Tests

- **`tests/Pest.php`** helper `promoV2`: xoá `'exclusive' => false` (dòng 199), sửa comment.
- **`tests/Feature/PromotionTest.php`**: xoá test dùng `exclusive` (dòng 11, 19) hoặc đổi sang `stackable`.
- **`tests/Feature/PromotionV2Test.php`**:
  - Test "coupon nhap ma: validate + exclusive" (dòng 105) → đổi tên/phần thân cho khớp `stackable`.
  - Test "exclusive=true bo het promotion khac" (dòng 131-132) → đổi thành `stackable=false` với kỳ vọng tương đương: mã áp, auto bị loại.
- **`tests/Feature/PromotionControllerTest.php`** (dòng 30): bỏ `'exclusive' => false`.
- **`tests/Feature/PromotionAnalyticsTest.php`** (dòng 18): bỏ `'exclusive' => false`.
- **`tests/Feature/MigrationRebuildTest.php`** (dòng 47): xoá `'exclusive'` khỏi danh sách cột.
- **Thêm test mới** (Feature): `stackable=false` + có auto promotion khớp điều kiện → `resolveAll` chỉ trả mã, không trả auto; `stackable=true` (mặc định) → trả cả mã + auto.

---

## Error handling

- `exclusive_conflict` reason xoá — không còn đường trả về.
- Nếu frontend cũ gửi `exclusive` lên store/update → bị bỏ qua (validation không còn nhận field) — không crash.
- Nếu DB còn cột `exclusive` (trước khi chạy migration) → model không còn tham chiếu nên vẫn chạy.

---

## Testing

- `php artisan test` — toàn bộ suite xanh.
- Kiểm tra thủ công: tạo coupon `stackable=false` + 1 promotion tự động khớp đơn → POS nhập mã → chỉ giảm theo mã, không cộng auto. `stackable=true` → cả 2 đều áp.

---

## Không nằm trong phạm vi

- Mở rộng cho phép nhập nhiều mã coupon/voucher cùng lúc (giữ 1 mã — đúng hiện trạng UI).
- Thay đổi cơ chế tính % trên subtotal (mỗi mã tính độc lập trên subtotal gốc — giữ nguyên).
- Thay đổi logic `max_discount_amount`, `min_order_value`, time slot, batch code.

## Dead code sẽ được dọn (danh sách)

1. `PromotionEngine.php:75-81` — khối exclusive loại mã khác.
2. `PromotionEngine.php:109` — điều kiện `doesntContain(exclusive)`.
3. `app/Models/Promotion.php:21,30,41` — property/fillable/casts `exclusive`.
4. `PromotionController.php:66,337,393,462` — response/store/update/validation `exclusive`.
5. `PaymentController.php:84` — map `exclusive_conflict`.
6. Migration tạo bảng cũ `2026_08_10_000014_create_promotion_v2_tables.php:31` — để nguyên (migration lịch sử không sửa), cột bị xoá bởi migration mới.
7. `PromotionFormDrawer.tsx:37,74,148,331,333-339` — state/payload/toggle `exclusive` + toggle "Áp dụng đồng thời".
8. `PromotionsManager.tsx:40` — field `exclusive` trong interface.
9. Tests: `Pest.php:199`, `PromotionTest.php:11,19`, `PromotionV2Test.php:105,131-132`, `PromotionControllerTest.php:30`, `PromotionAnalyticsTest.php:18`, `MigrationRebuildTest.php:47`.
