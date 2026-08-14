# Design: Phân biệt rõ 3 loại Promotion / Coupon / Voucher

**Ngày:** 2026-08-14
**Phạm vi:** Tạo khác biệt hành vi + ràng buộc rõ ràng giữa 3 loại khuyến mãi trong form tạo/sửa và backend validation. Chỉ áp cho bản ghi MỚI — dữ liệu cũ giữ nguyên.

---

## Bối cảnh & Vấn đề

Hiện tại 3 loại `promotion` / `coupon` / `voucher` chỉ khác nhau ở nhãn hiển thị. Về logic:
- `PromotionEngine.php:151` chỉ phân biệt `type === 'promotion'` (tự động, không code) với các loại còn lại.
- `coupon` và `voucher` được xử lý **y hệt nhau**: cùng form (mã đơn hoặc batch), cùng cách nhập, cùng cơ chế — không có ràng buộc phân biệt.
- Form `PromotionFormDrawer.tsx` chỉ đổi label, có gợi ý "Mã ngẫu nhiên (mỗi mã dùng 1 lần — voucher)" nhưng không bắt buộc.

Người dùng muốn mỗi loại có ý nghĩa + hành vi riêng rõ ràng, đúng chuẩn kinh doanh.

## Định nghĩa phân loại (chuẩn áp dụng)

| | **Promotion** | **Coupon** | **Voucher** |
|---|---|---|---|
| Cách áp dụng | Tự động khi đơn đủ điều kiện | Nhập 1 mã đơn | Nhập mã con (mỗi mã 1 lần) |
| Dạng mã | Không có code | **Chỉ mã đơn** (`code`) — cấm batch | **Bắt buộc batch ngẫu nhiên** (`code_random=true`) — cấm mã đơn |
| Số lần dùng | `max_usage` tùy chọn (trống = không giới hạn) | `max_usage` tùy chọn (trống = không giới hạn) | Mỗi mã con dùng đúng 1 lần (`promotion_codes.status: unused→used`) |
| Đối tượng | Số đông, tự động | Số đông, cần mã | Cá nhân, mã riêng |
| Toggle "Độc quyền" | Ẩn (đã làm) | Hiện | Hiện |

## Mục tiêu

- Chọn loại Coupon → form chỉ cho nhập 1 mã đơn (ẩn hẳn phần batch + mã ngẫu nhiên hàng loạt).
- Chọn loại Voucher → form chỉ cho cấu hình batch ngẫu nhiên (ẩn hẳn ô mã đơn, tự bật `code_random`, ẩn `max_usage`).
- Backend validation chặn cấu hình không hợp lệ theo loại với message rõ ràng.
- Bản ghi cũ không bị đổi/xoá.

---

## Kiến trúc & Thay đổi

### 1. Frontend form — `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx`

**Hiện/ẩn theo `type`:**

- **Ô "Mã Code" đơn** (dòng ~204-215): chỉ hiện khi `type === 'coupon'`.
  - Hiện tại điều kiện là `type !== 'promotion' && codePrefix === '' && codeQuantity === ''` — đổi thành `type === 'coupon'`.
- **Phần "Phát hành mã hàng loạt" (batch)** (dòng ~257-288): chỉ hiện khi `type === 'voucher'`.
  - Hiện tại điều kiện là `(type === 'coupon' || type === 'voucher') && code === ''` — đổi thành `type === 'voucher'`.
- **`max_usage`** (dòng ~243-248): hiện khi `codePrefix === '' && codeQuantity === ''` — đổi thành hiện khi `type === 'coupon' || type === 'promotion'` (ẩn với voucher).
- **Checkbox "Mã ngẫu nhiên"** (dòng ~272-275): khi `type === 'voucher'` → tự bật `codeRandom = true` và **khóa** (disabled, không cho tắt). Khi chuyển sang voucher, trong handler `<select>`:
  ```ts
  onChange={(e) => {
      const t = e.target.value as any;
      setType(t);
      if (t === 'voucher') {
          setCode(''); setCodeRandom(true);
      } else if (t === 'coupon') {
          setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false);
      }
  }}
  ```
- **Label + mô tả** từng loại trong `<select>` (dòng ~199-201):
  - `promotion`: "Khuyến mãi tự động (Promotion)"
  - `coupon`: "Mã giảm giá (Coupon) — dùng chung, nhập 1 mã"
  - `voucher`: "Mã quà tặng (Voucher) — mỗi khách 1 mã riêng"

**Khi sửa bản ghi cũ không khớp loại mới** (vd coupon cũ đang có `code_prefix`):
- Không chặn lưu. Hiện cảnh báo nhẹ dưới phần loại:
  ```tsx
  {promotionToEdit && (
      (type === 'coupon' && (codePrefix !== '' || codeQuantity !== '')) ||
      (type === 'voucher' && code !== '') ||
      (type === 'voucher' && !codeRandom)
  ) && (
      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Cấu hình này không khớp với loại {type === 'coupon' ? 'Coupon (chỉ mã đơn)' : 'Voucher (bắt buộc mã ngẫu nhiên hàng loạt)'}. Bản ghi cũ vẫn lưu được.
      </p>
  )}
  ```

**Payload submit (dòng ~141-161):**
- Giữ nguyên cấu trúc. Thêm ép buộc cho voucher: `code_random: type === 'voucher' ? true : (code !== '' ? false : codeRandom)`.
- Voucher không gửi `code` đơn: `code: type === 'promotion' || type === 'voucher' || isBatch ? null : (code.toUpperCase() || null)`.

### 2. Backend validation — `app/Http/Controllers/Manager/PromotionController.php`

**`rules()` (dòng ~441-468):** thêm điều kiện theo loại:
```php
'code' => ['nullable', 'string', 'max:50',
    Rule::requiredIf(fn () => (string) request('type') === 'coupon'),
    Rule::prohibitedIf(fn () => (string) request('type') === 'voucher'),
    Rule::unique('promotions', 'code')->ignore($promotion?->id)],
'code_prefix' => ['nullable', 'string', 'max:30',
    Rule::prohibitedIf(fn () => (string) request('type') === 'coupon'),
    'required_with:code_quantity'],
'code_quantity' => ['nullable', 'integer', 'min:1', 'max:100000',
    Rule::prohibitedIf(fn () => (string) request('type') === 'coupon'),
    Rule::requiredIf(fn () => (string) request('type') === 'voucher')],
'code_random' => ['sometimes', 'boolean'],
```

Lưu ý: `Rule::prohibitedIf` có sẵn trong Laravel — khi loại khác coupon mà gửi `code_prefix` thì báo lỗi `prohibited`. Message mặc định tiếng Anh ("prohibited") — cần attribute override cho tiếng Việt, hoặc dùng `validation()` sau `validate()` để map. Đơn giản nhất: sau khi `$request->validate()` thành công, thêm kiểm tra thủ công ném `ValidationException::withMessages` với message tiếng Việt rõ ràng (như pattern `PromotionCodeService` prefix đã dùng).

**`store()` / `update()` (dòng ~320-395):** ép buộc theo loại khi ghi:
```php
'code' => in_array($validated['type'], ['promotion', 'voucher'], true) || $isBatch ? null : (mb_strtoupper(trim($validated['code'] ?? '')) ?: null),
'code_random' => $isBatch ? ($validated['type'] === 'voucher' ? true : ($validated['code_random'] ?? false)) : false,
```

**Kiểm tra thủ công sau validate (dùng chung store + update):**
```php
if ($validated['type'] === 'coupon' && ! empty($validated['code_prefix'] ?? null)) {
    throw ValidationException::withMessages([
        'code_prefix' => 'Coupon chỉ dùng 1 mã đơn, không phát hành mã hàng loạt.',
    ]);
}
if ($validated['type'] === 'voucher') {
    if (empty($validated['code_prefix'] ?? null) || empty($validated['code_quantity'] ?? null)) {
        throw ValidationException::withMessages([
            'code_prefix' => 'Voucher phải phát hành mã hàng loạt (chuỗi tiền tố + số lượng mã).',
        ]);
    }
    if (! empty($validated['code'] ?? null)) {
        throw ValidationException::withMessages([
            'code' => 'Voucher không dùng mã đơn — dùng batch mã ngẫu nhiên.',
        ]);
    }
}
```

### 3. Engine — KHÔNG đổi

`PromotionEngine` đã phân biệt promotion vs mã; voucher dùng mã con qua `promotion_codes` (status `unused→used`, 1 lần) — cơ chế đã có sẵn.

### 4. Tests

- **`tests/Feature/PromotionControllerTest.php`** — thêm test:
  - Tạo coupon kèm `code_prefix` → 422 với message "Coupon chỉ dùng 1 mã đơn".
  - Tạo voucher không có `code_prefix`/`code_quantity` → 422 với message "Voucher phải phát hành mã hàng loạt".
  - Tạo voucher kèm `code` đơn → 422 với message "Voucher không dùng mã đơn".
  - Tạo voucher hợp lệ (`code_prefix` + `code_quantity`) → `code_random` được ép `true` trong DB.
  - Tạo coupon hợp lệ (chỉ `code`) → `code_prefix`/`code_quantity` là `null`, `code_random` là `false`.
  - Sửa voucher cũ → vẫn lưu được (không bị chặn bởi ràng buộc bản ghi mới) — test một trường hợp bản ghi cũ không khớp loại vẫn lưu OK.
- Chạy `php artisan test` toàn bộ xanh.

---

## Error handling

- Lỗi cấu hình sai loại → `ValidationException` với message tiếng Việt, hiển thị dưới field tương ứng (đã có sẵn cơ chế `errors` trong form).
- Bản ghi cũ không khớp → cảnh báo amber, không chặn lưu.

## Testing

- `php artisan test` toàn bộ xanh.
- `npx eslint`, `npm run types:check`, `npm run build` pass.
- Kiểm tra thủ công form: chọn Coupon → chỉ thấy ô mã đơn; chọn Voucher → chỉ thấy batch + checkbox random khóa bật + ẩn max_usage; chọn Promotion → không có mã.

---

## Không nằm trong phạm vi

- Migration/chuyển đổi dữ liệu cũ.
- Thay đổi cơ chế engine tính discount.
- Thay đổi `max_usage` semantics (chỉ ẩn/hiện theo loại).
