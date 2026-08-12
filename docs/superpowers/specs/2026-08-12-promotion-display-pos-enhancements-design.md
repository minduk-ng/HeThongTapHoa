# Design: Hiển thị Promotion chính xác trong POS & Nâng cấp trang Khuyến mãi

**Ngày:** 2026-08-12
**Phạm vi:** POS PaymentDrawer, PromotionEngine, CheckoutService, Promotion analytics, Campaign Performance table, DataTable header.

---

## Bối cảnh & Vấn đề

1. **PaymentDrawer không hiển thị đầy đủ promotion.** Khi checkout với mã L3UC5R35 (free 1 món), `validatePromotion` (PaymentController) trả về `promotions` array đầy đủ (gồm cả auto promotions + tổng discount), nhưng frontend `usePOSCheckout.applyPromotion` chỉ lưu `promotionName` = mã đầu tiên và `promotionDiscount` = tổng. PaymentDrawer chỉ render 1 dòng. Khi checkout thật, `CheckoutService::runBulk` gọi lại `resolveAll` → auto promotions được áp thêm nhưng không hiển thị → khách trả tiền theo số không đúng discount thực tế.

2. **Doanh thu analytics bị double-count.** `CheckoutService::runBulk` (dòng ~289-312) upsert `daily_promotion_stats` với vòng `foreach ($appliedPromotions)` — mỗi promotion áp dụng lại cộng **full `$invoiceTotal`** vào `revenue`. 1 hoá đơn dùng 2 promotion → revenue nhân đôi (89.6k hiển thị 179.2k). Command `AggregateDailyPromotionStats` cũng gán full `invoices.total_amount` cho mỗi promotion → cùng bug.

3. **Lỗi % hiển thị trong pie chart.** `PromotionAnalyticsCharts.tsx:33`: `percent * 100` — recharts v3 trả `percent` là 0–100, nhân thêm 100 → 5000%.

4. **Campaign Performance thiếu cột doanh thu/giảm giá, căn lề chưa hợp lý, thao tác phải ấn cả dòng.** Chưa có chế độ xem chi tiết hoá đơn đã dùng mã.

---

## Mục tiêu

- PaymentDrawer hiển thị **từng promotion áp dụng** (auto + coupon/voucher) với số tiền giảm riêng, khớp chính xác discount checkout thật.
- Nhân viên POS được **chọn 1 auto promotion cụ thể** (thay vì engine tự chọn tốt nhất); coupon/voucher vẫn nhập mã.
- Danh sách auto promotions được **cache** khi vào POS (không query DB mỗi lần mở drawer), **nhưng không ảnh hưởng quyết định quota** — quota vẫn qua DB lock.
- Sửa double-count revenue + lỗi % pie chart.
- Campaign Performance: thêm cột Tổng doanh thu / Tổng giảm giá, căn giữa, thao tác bằng icon, xem chi tiết hoá đơn.
- DataTable header: tiêu đề căn giữa không bị chevron làm lệch.

---

## Phần 1 — Backend: cho phép chọn auto promotion

### `PromotionEngine::resolveAll` — thêm tham số `?int $preferredAutoId = null`

- Giữ nguyên chữ ký cũ (backward compatible). Tham số mới đặt cuối.
- Logic step 3 (chọn auto promotion):
  - `$preferredAutoId === null` → hành vi cũ: `sortByDesc(estimateDiscount)->first()`.
  - `$preferredAutoId !== null` → chọn promotion ứng viên có `id === $preferredAutoId` thay vì `first()`. Nếu id không thoả `matchesConditions` hoặc `quotaOk` hoặc không tồn tại/non-active → coi như không có auto (không reject).

### `CheckoutService::runBulk` — thêm tham số `?int $selectedPromotionId = null`

- Truyền xuống `resolveAll($promotionCodes, $engineLines, $subtotal, true, $selectedPromotionId)`.
- `run()` (single) truyền tiếp cho `runBulk`.

### `PaymentController::checkout` & `bulkCheckout`

- Validation thêm: `'selected_promotion_id' => ['nullable', 'integer', Rule::exists('promotions', 'id')->whereNull('deleted_at')]`.
- Truyền vào `CheckoutService::runBulk(..., $validated['selected_promotion_id'] ?? null)`.

---

## Phần 2 — PaymentDrawer: hiển thị promotion đầy đủ + ô chọn + cache

### 2a. Cache danh sách promotions khi vào POS

- `POSController::index`: thêm payload `promotions` = danh sách promotion `type=promotion`, `status=true`, còn hiệu lực (start/end date), kèm `conditions` + `actions` (đủ để ước tính discount). Nạp qua:
  ```php
  $this->cachedPayload($isLocal, 'pos_promotions', 'pos_promotions_list', 300, fn () => $this->loadPromotionsPayload());
  ```
  - `loadPromotionsPayload()`: `Promotion::with(['conditions','actions'])->where('type','promotion')->where('status',true)->where(ngày hợp lệ)->get()->toArray()`.
  - Pattern giống hệt `pos_products` / `pos_categories` hiện có.

- **Invalidate cache `pos_promotions`:**
  - `PromotionController::store / update / destroy` → flush tag (qua `safeDispatch` như các controller khác — an toàn khi Redis down).
  - `CheckoutService::runBulk` sau transaction → flush tag `pos_promotions` (used_count thay đổi ảnh hưởng quota hiển thị).
  - Lưu ý: `pos_promotions` là cache **hiển thị** (danh sách ứng viên + ước tính). Quyết định áp dụng/quota **không** đọc từ cache — luôn qua DB + lock ở checkout.

### 2b. Endpoint `POST /staff/pos/available-promotions`

- Input: giống `validatePromotion` (`items`, `subtotal`).
- Logic: không query DB toàn bộ — đọc danh sách promotions từ cache `pos_promotions_list` (hoặc query trực tiếp nếu cache trống / env local). Lọc ứng viên khớp giỏ hàng hiện tại.
- Thêm method `PromotionEngine::candidates(array $lines, float $subtotal): array` trả về list promotion thoả `matchesConditions` + `quotaOk`, kèm `estimated_discount = estimateDiscount(...)`. Không increment used_count.
- Response: `{ ok: true, promotions: [{id, name, code, estimated_discount}] }`.

### 2c. Frontend `usePOSCheckout`

- Thay cặp state `promotionName` / `promotionDiscount` bằng:
  - `availablePromotions: {id, name, code, estimated_discount}[]` (từ props POSManager truyền xuống, không cần fetch khi mở drawer).
  - `selectedAutoId: number | null` (mặc định = promotion có estimated_discount cao nhất khi mở drawer).
  - `appliedPromotions: {id, name, code, discount_amount}[]`.
  - `totalDiscount: number`.
- Khi mở drawer payment: tự chọn auto tốt nhất mặc định, gọi `validate-promotion` với `{ items, subtotal, selected_promotion_id }` (không cần mã) → nhận `promotions` list + tổng discount → populate `appliedPromotions`.
- Khi user đổi lựa chọn auto hoặc nhập mã coupon/voucher → gọi `validate-promotion` lại với `{ codes, selected_promotion_id }`.
- Checkout gửi `selected_promotion_id` + `promotion_code` (Phần 1) → discount hiển thị = discount thực tế.
- `validatePromotion` (PaymentController) hiện trả `promotions` array — giữ nguyên, chỉ bổ sung `selected_promotion_id` vào input validation.

### 2d. UI PaymentDrawer — cột phải sắp xếp lại

- **Khu "Khuyến mãi"** (chỉ mode payment):
  - Ô chọn auto promotion: dropdown/radio liệt kê `availablePromotions` (chỉ type=promotion). Mặc định chọn tốt nhất.
  - Ô nhập mã coupon/voucher + nút "Áp dụng" (giữ nguyên luồng hiện có).
  - Danh sách mã đã áp: mỗi dòng hiển thị tên mã + số tiền giảm riêng (từ `appliedPromotions`), có nút "Hủy mã" per mã.
- **Khu tổng tiền:** subtotal → VAT → từng dòng giảm promotion → tổng giảm → cọc → KHÁCH CẦN TRẢ. Tách section rõ ràng, bố cục rộng rãi hơn.

---

## Phần 3 — Campaign Performance & DataTable

### 3a. Backend — `PromotionController::index`

- Thêm vào mỗi campaign payload: `revenue`, `discount_total` (từ `daily_promotion_stats` — tái dùng logic trong `analytics()`). Query riêng group by promotion_id cho range toàn bộ, map vào từng promotion.
- Giữ nguyên các field hiện có.

### 3b. Bảng Campaign Performance — dùng `DataTable`

- Thay toàn bộ `<table>` thủ công bằng `<DataTable>`:
  - Columns:
    - Mã / Tên chiến dịch (`left`)
    - Loại (`center`)
    - Số đơn (`center`)
    - Tổng doanh thu (`center`)
    - Tổng giảm giá (`center`)
    - Hiệu suất (`center`)
    - Thao tác (`center` — icon sửa + icon eye, dừng event propagation)
  - **Không truyền `onRowClick`** → ấn dòng không làm gì, chỉ icon mới thao tác.
  - `defaultSortKey`, `getSortValue`, `emptyMessage` từ props.
- Bỏ wrapper `bg-white/rounded` bên ngoài (DataTable tự wrap `bg-white rounded-2xl shadow-xs`).

### 3c. DataTable header — tiêu đề căn giữa không bị chevron làm lệch

- `DataTable.tsx` dòng ~137-143:
  - Cell giữ `text-center` + `relative`.
  - Text căn giữa theo toàn bộ chiều rộng ô (`flex-1 text-center`).
  - Icon sort dùng **absolute positioning** bên cạnh text (vd `absolute right-2` với align center) — không nằm trong flex flow, không đẩy text.
  - Với align `left`/`right`: giữ hành vi hiện tại (icon sát text, text căn theo align).

### 3d. Endpoint `GET /manager/promotions/{id}/invoices`

- Trả danh sách hoá đơn đã dùng mã: join `invoice_promotions` + `invoices`.
- Response: `{ invoices: [{id, invoice_code, issued_at, table_name, subtotal_amount, discount_amount, total_amount, payment_method}] }`, sắp xếp `issued_at DESC`.
- Permission: kiểm tra quyền xem promotions như các route manager hiện tại.

### 3e. Frontend — modal `PromotionInvoicesModal`

- Component mới trong `components/PromotionInvoicesModal.tsx`.
- Ấn icon eye trên 1 campaign → fetch endpoint 3d → render bảng đầy đủ (mã hoá đơn, thời gian, bàn, tổng tiền, tiền giảm, PTTT). Có thể tái dùng `DataTable` cho danh sách.
- Đóng bằng X / click overlay / Escape.

---

## Phần 4 — StatsCards, pie % & sửa double-count revenue

### 4a. Giải thích StatsCards (đưa vào màn hình — không đổi nếu user không yêu cầu)

- Tổng doanh thu từ KM = tổng doanh thu các hoá đơn có dùng KM (sau khi fix double-count).
- Tổng lượt đã dùng = SUM order_count.
- Giá trị giảm trung bình = tổng giảm / số lượt.
- Chi phí khuyến mãi = SUM discount_total.

### 4b. Fix lỗi % pie chart — `PromotionAnalyticsCharts.tsx:33`

- `label={({ percent = 0 }) => \`${percent.toFixed(0)}%\`}` — bỏ `* 100`. (Xác nhận recharts v3 trả 0–100 khi implement; nếu trả 0–1 thì dùng `Math.round(percent * 100)`.)

### 4c. Fix double-count revenue — phân bổ theo tỷ trọng discount

- **Realtime (`CheckoutService::runBulk`, dòng ~287-312):** với 1 hoá đơn có N promotion áp dụng, `revenue` của mỗi promotion = `$invoiceTotal × (discount của promotion đó / tổng discount hoá đơn)`. Tổng revenue các promotion = đúng `$invoiceTotal` 1 lần.
  - Trường hợp tổng discount = 0 (free_product vẫn có discount_amount>0 thường; nếu thực sự = 0) → fallback: chỉ promotion đầu tiên nhận full revenue, các promotion khác 0.
  - `discount_total` vẫn cộng theo từng promotion (không đổi).
- **Command `AggregateDailyPromotionStats`:** thay `MAX(invoices.total_amount)` bằng phân bổ theo tỷ trọng discount:
  - Với mỗi invoice, lấy tổng `SUM(order_promotions.discount_applied)` của các promotion trên invoice đó, phân bổ `total_amount × (discount / tổng)` cho từng promotion.
- **Lưu ý chuyển đổi:** dữ liệu cũ trong `daily_promotion_stats` đã bị nhân đôi → sau khi deploy, chạy lại `php artisan promotions:aggregate-daily` (cho ngày hiện tại hoặc xoá & rebuild range cần thiết).

---

## Testing

- **PHP (Pest):**
  - `PromotionEngine::resolveAll` với `$preferredAutoId`: chọn đúng promotion chỉ định; id không thoả → không áp auto; backward compatible (không truyền param → hành vi cũ).
  - `PaymentController::checkout` với `selected_promotion_id`: discount = đúng promotion đã chọn.
  - `CheckoutService::runBulk`: 1 hoá đơn 2 promotion → `daily_promotion_stats.revenue` tổng = đúng 1 lần invoice total (không double-count).
  - `AggregateDailyPromotionStats`: rebuild → revenue phân bổ tỷ trọng, tổng không nhân N.
  - `available-promotions` endpoint: trả danh sách ứng viên khớp điều kiện + estimated_discount, không increment used_count.
  - Race quota giữ nguyên (test cũ `race: 2 checkout dong thoi khong vuot max_usage` phải pass) — cache không ảnh hưởng quota.
  - `PromotionController::index`: campaign payload có revenue/discount_total.
  - Endpoint `{id}/invoices`: trả đúng danh sách hoá đơn.
- **Frontend:**
  - `tsc --noEmit`, `npm run build`, eslint các file sửa.
  - DataTable header center: không lệch khi có chevron (kiểm tra visual).
  - PaymentDrawer: hiển thị từng promotion + chọn auto + tổng tiền khớp.

---

## Không nằm trong phạm vi

- Đổi giao diện toàn bộ trang Khuyến mãi.
- Thêm tính năng mới cho promotion (ngoài phần đã nêu).
- Sửa lỗi lint pre-existing không liên quan (curly/padding-line trong file cũ).
