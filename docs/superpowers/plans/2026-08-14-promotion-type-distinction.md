# Phân biệt rõ 3 loại Promotion / Coupon / Voucher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo khác biệt hành vi + ràng buộc rõ ràng giữa 3 loại khuyến mãi: Promotion (tự động, không mã), Coupon (chỉ mã đơn, dùng chung), Voucher (bắt buộc batch mã ngẫu nhiên, mỗi mã 1 lần).

**Architecture:** Chỉ sửa 2 file: frontend `PromotionFormDrawer.tsx` (hiện/ẩn trường theo loại, tự bật `code_random` cho voucher, label rõ ràng, cảnh báo bản ghi cũ) và backend `PromotionController.php` (validation chặn cấu hình sai loại + ép `code_random=true` cho voucher khi lưu). Engine không đổi.

**Tech Stack:** React 19 + TypeScript (Inertia.js), Laravel 13 (PHP 8.3) + Pest.

## Global Constraints

- Chỉ áp ràng buộc cho bản ghi MỚI — dữ liệu cũ giữ nguyên, không migration, không đổi/xoá.
- Coupon: chỉ mã đơn (`code`); cấm `code_prefix`/`code_quantity`; `code_random` luôn `false`.
- Voucher: bắt buộc `code_prefix` + `code_quantity`; cấm `code` đơn; `code_random` luôn `true`.
- Promotion: không code, không prefix (giữ nguyên hành vi hiện tại).
- Bản ghi cũ không khớp loại mới → vẫn lưu được (cảnh báo amber frontend, không chặn backend).
- `PromotionEngine` KHÔNG sửa.
- Bắt buộc chạy: `php artisan test` toàn bộ xanh, `npx eslint`, `npm run types:check`, `npm run build`.
- Commit message tiếng Việt. Không dùng emoji/inline SVG trong JSX.
- Message lỗi validation bằng tiếng Việt.

---

### Task 1: Backend validation theo loại + ép buộc khi lưu

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php`

**Interfaces:**
- Consumes: `rules(?Promotion $promotion = null): array`, `store()`, `update()` — giữ nguyên signature.
- Produces: `store`/`update` chặn cấu hình sai loại (422 với message tiếng Việt); voucher được ép `code_random=true`; coupon không bao giờ lưu `code_prefix`/`code_quantity`.

- [ ] **Step 1: Đọc controller hiện tại**

```bash
type app\Http\Controllers\Manager\PromotionController.php
```

Xác định vị trí: `rules()` (~dòng 441-468), `store()` (~320-373), `update()` (~375-430). Lưu ý số dòng có thể lệch — tìm theo nội dung.

- [ ] **Step 2: Thêm phương thức kiểm tra theo loại**

Thêm vào cuối class (sau `flushPosPromotionsCache`, dòng ~470-477), trước dấu đóng `}` cuối file:

```php
    private function assertTypeConfigValid(array $validated): void
    {
        if (($validated['type'] ?? null) === 'coupon' && ! empty($validated['code_prefix'] ?? null)) {
            throw ValidationException::withMessages([
                'code_prefix' => 'Coupon chỉ dùng 1 mã đơn, không phát hành mã hàng loạt.',
            ]);
        }

        if (($validated['type'] ?? null) === 'voucher') {
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
    }
```

- [ ] **Step 3: Gọi `assertTypeConfigValid` trong `store` và `update`**

Trong `store()` — ngay sau `$validated = $request->validate($this->rules());` (dòng ~322):

```php
        $this->assertTypeConfigValid($validated);
```

Trong `update()` — ngay sau `$validated = $request->validate($this->rules($promotion));` (dòng ~377):

```php
        $this->assertTypeConfigValid($validated);
```

- [ ] **Step 4: Ép `code_random` + cấm `code` đơn cho voucher khi ghi**

Trong `store()` (dòng ~327-340, mảng `Promotion::create([...])`), đổi 2 dòng:

```php
                'code' => $validated['type'] === 'promotion' || $isBatch ? null : (mb_strtoupper(trim($validated['code'] ?? '')) ?: null),
```

thành:

```php
                'code' => in_array($validated['type'], ['promotion', 'voucher'], true) || $isBatch ? null : (mb_strtoupper(trim($validated['code'] ?? '')) ?: null),
```

Và dòng `code_random`:

```php
                'code_random' => $isBatch ? ($validated['code_random'] ?? false) : false,
```

thành:

```php
                'code_random' => $isBatch ? ($validated['type'] === 'voucher' ? true : ($validated['code_random'] ?? false)) : false,
```

Làm TƯƠNG TỰ 2 dòng này trong `update()` (khoảng dòng ~388-398, mảng `$promotion->update([...])`).

- [ ] **Step 5: Thêm test validation theo loại**

Thêm vào `tests/Feature/PromotionControllerTest.php`:

```php
test('coupon gui code_prefix bi chan 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Coupon sai', 'type' => 'coupon', 'code' => 'C1'.substr(uniqid(), -4),
        'code_prefix' => 'C1', 'code_quantity' => 5,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasErrors('code_prefix');
});

test('voucher thieu code_prefix/quantity bi chan 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Voucher sai', 'type' => 'voucher', 'code' => 'V1'.substr(uniqid(), -4),
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasErrors('code_prefix');
});

test('voucher gui code don bi chan 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Voucher sai code', 'type' => 'voucher',
        'code' => 'V2'.substr(uniqid(), -4), 'code_prefix' => 'V2', 'code_quantity' => 3,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasErrors('code');
});

test('voucher hop le duoc ep code_random=true', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Voucher dung', 'type' => 'voucher',
        'code_prefix' => 'VOK'.substr(uniqid(), -4), 'code_quantity' => 3, 'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasNoErrors();

    $p = \App\Models\Promotion::where('name', 'Voucher dung')->first();
    expect($p->code_random)->toBeTrue();
});

test('coupon hop le chi luu code don, khong prefix', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Coupon dung', 'type' => 'coupon', 'code' => 'COK'.substr(uniqid(), -4),
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasNoErrors();

    $p = \App\Models\Promotion::where('name', 'Coupon dung')->first();
    expect($p->code)->not->toBeNull();
    expect($p->code_prefix)->toBeNull();
    expect($p->code_quantity)->toBeNull();
    expect($p->code_random)->toBeFalse();
});
```

Kiểm tra `posAdmin()` có trong `tests/Pest.php` (đã có — dùng để authenticate admin). Lưu ý route POST `/manager/promotions` phải có `name` bắt buộc — các test trên đã có `name`.

- [ ] **Step 6: Chạy test**

```bash
php artisan test --filter=PromotionControllerTest
```
Expected: PASS. Sau đó `php artisan test` — toàn bộ xanh.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Manager/PromotionController.php tests/Feature/PromotionControllerTest.php
git commit -m "feat: validation theo loai promotion/coupon/voucher, voucher ep code_random"
```

---

### Task 2: Frontend form — hiện/ẩn theo loại + tự bật random cho voucher

**Files:**
- Modify: `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx`

**Interfaces:**
- Consumes: state `type`, `code`, `codePrefix`, `codeQuantity`, `codeRandom`, `maxUsage`, `exclusive`, `promotionToEdit` (đã có).
- Produces: form chỉ hiện trường đúng loại; khi chọn voucher → `setCodeRandom(true)` + clear `code`; khi chọn coupon → clear batch. Payload: voucher không gửi `code`, `code_random` luôn `true`.

- [ ] **Step 1: Sửa handler `<select>` loại hình**

`PromotionFormDrawer.tsx:197` — đổi `onChange` thành:

```tsx
<select value={type} onChange={(e) => {
    const t = e.target.value as 'promotion' | 'coupon' | 'voucher';
    setType(t);
    if (t === 'voucher') {
        setCode(''); setCodeRandom(true);
    } else if (t === 'coupon') {
        setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false);
    }
}} className={inputCls}>
```

Đồng thời đổi label 3 option (dòng 198-200):

```tsx
<option value="promotion">Khuyến mãi tự động (Promotion)</option>
<option value="coupon">Mã giảm giá (Coupon) — dùng chung, nhập 1 mã</option>
<option value="voucher">Mã quà tặng (Voucher) — mỗi khách 1 mã riêng</option>
```

- [ ] **Step 2: Sửa điều kiện hiện ô "Mã Code"**

Dòng 203 — đổi `type !== 'promotion' && codePrefix === '' && codeQuantity === ''` thành `type === 'coupon'`:

```tsx
{type === 'coupon' && (
    <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Mã Code <span className="text-rose-500">*</span></label>
        <div className="flex gap-2">
            <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false); }} placeholder="Nhập mã hoặc tạo ngẫu nhiên" className={inputCls} />
            <button type="button" onClick={() => { setCode(randomCode()); setCodePrefix(''); setCodeQuantity(''); setCodeRandom(false); }} title="Tạo mã ngẫu nhiên"
                className="px-3 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <Shuffle className="w-4 h-4" />
            </button>
        </div>
        {errors.code && <p className="text-xs text-rose-500 mt-1">{errors.code}</p>}
    </div>
)}
```

- [ ] **Step 3: Sửa điều kiện hiện "Tổng số lượt sử dụng tối đa"**

Dòng 243 — đổi `codePrefix === '' && codeQuantity === ''` thành `type !== 'voucher'`:

```tsx
{type !== 'voucher' && (
    <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tổng số lượt sử dụng tối đa</label>
        <input type="number" value={maxUsage} onChange={(e) => setMaxUsage(e.target.value)} placeholder="Không giới hạn" className={inputCls} />
    </div>
)}
```

- [ ] **Step 4: Sửa điều kiện hiện phần "Phát hành mã hàng loạt"**

Dòng 257 — đổi `(type === 'coupon' || type === 'voucher') && code === ''` thành `type === 'voucher'`:

```tsx
{type === 'voucher' && (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
        <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Phát hành mã hàng loạt</h5>
        ...
    </div>
)}
```

BÊN TRONG block này:
- Đổi checkbox "Mã ngẫu nhiên" (dòng ~272-275) thành luôn bật + disabled:

```tsx
<label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
    <input type="checkbox" checked disabled className="h-4 w-4 accent-sky-600" />
    Mã ngẫu nhiên (mỗi mã dùng 1 lần — voucher)
</label>
```

- Đổi text mô tả (dòng ~276-280) thành cố định theo random:

```tsx
<p className="text-[11px] text-zinc-500">
    Hệ thống tự sinh {codeQuantity || 'N'} mã ngẫu nhiên khác nhau không trùng (VD: {codePrefix || 'DK'}12345…).
</p>
```

- Đổi `onChange` của 2 input prefix/quantity (dòng 263, 268) — vẫn giữ `setCode('')` trong handler (đảm bảo code đơn luôn trống):

```tsx
<input value={codePrefix} onChange={(e) => { setCodePrefix(e.target.value.toUpperCase()); setCode(''); }}
    placeholder="VD: DK" className={inputCls} />
```

```tsx
<input type="number" min={1} max={100000} value={codeQuantity} onChange={(e) => { setCodeQuantity(e.target.value); setCode(''); }}
    placeholder="VD: 100" className={inputCls} />
```

- [ ] **Step 5: Sửa payload submit cho voucher**

`PromotionFormDrawer.tsx:143` — đổi `code`:

```ts
code: type === 'promotion' || type === 'voucher' || isBatch ? null : (code.toUpperCase() || null),
```

`PromotionFormDrawer.tsx:150` — đổi `code_random`:

```ts
code_random: type === 'voucher' ? true : (code !== '' ? false : codeRandom),
```

- [ ] **Step 6: Thêm cảnh báo bản ghi cũ không khớp loại**

Ngay dưới `<select>` loại hình (sau dòng 201, trước khi đóng `</div>` dòng 216), thêm:

```tsx
{promotionToEdit && (
    (type === 'coupon' && (codePrefix !== '' || codeQuantity !== '')) ||
    (type === 'voucher' && code !== '') ||
    (type === 'voucher' && !codeRandom)
) && (
    <p className="text-xs text-amber-600 dark:text-amber-400">
        Cấu hình này không khớp với loại {type === 'coupon' ? 'Coupon (chỉ mã đơn)' : 'Voucher (bắt buộc mã ngẫu nhiên hàng loạt)'}. Bản ghi cũ vẫn lưu được.
    </p>
)}
```

- [ ] **Step 7: Verify lint + types + build**

```bash
npx eslint resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx
npm run types:check
npm run build
```
Expected: 0 lỗi mới (file có thể có sẵn vài lỗi style pre-existing — chỉ cần không thêm lỗi mới), pass.

- [ ] **Step 8: Verify backend tests**

```bash
php artisan test
```
Expected: toàn bộ xanh (357+).

- [ ] **Step 9: Commit**

```bash
git add resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx
git commit -m "feat: form phan biet loai - coupon chi ma don, voucher batch ngau nhien"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 = backend validation + ép code_random + tests; Task 2 = form hiện/ẩn + label + cảnh báo bản ghi cũ. Tất cả mục spec đều có task tương ứng. Engine không đổi (đúng spec).
- **Không placeholder:** mọi bước có code/lệnh cụ thể.
- **Type consistency:** `type: 'promotion' | 'coupon' | 'voucher'`, `codeRandom`, `codePrefix`, `codeQuantity` giữ nguyên tên xuyên suốt. `assertTypeConfigValid` dùng chung store + update.
- **Lưu ý:** các test mới cần `posAdmin()` từ `tests/Pest.php` (đã tồn tại). Route POST `/manager/promotions` — nếu cần xác minh tên route, dùng `php artisan route:list | Select-String promotions`.
