# POS/Backend Hardening — Design

Ngày: 2026-08-03
Phạm vi: phần backend của đợt hardening POS/promotion/shift. (Spec frontend riêng: `2026-08-03-pos-hardening-frontend-design.md`.)

## 1. Atomic status transition cho order_items (race cancelOrder / Kitchen)

### Vấn đề
`POSController::cancelOrder` (POSController.php:1415) load `$order->items` (không khóa hàng `order_items`), lặp và với mỗi item `completed` gọi `InventoryIngredientService::restoreIngredients`. Song song đó `KitchenController::cancelItem` (:203) và `completeItems` (:125) đọc `status` cũ rồi cập nhật (TOCTOU), dẫn tới:
- Hoàn nguyên liệu (import) **2 lần** cho cùng order_item khi cả POS và Bếp đều cancel.
- Hoàn/trừ kho cho item đã đổi trạng thái giữa chừng.

### Giải pháp — atomic transition guard
Mọi thay đổi `status` của `order_items` từ một trạng thái nhập → trạng thái đích dùng **câu UPDATE có WHERE trên status hiện tại**, và chỉ thực hiện tác động kho khi câu đó thật sự thay đổi đúng 1 dòng.

- **cancelItem (Kitchen):** thay đoạn `lockForUpdate()` + đọc + `update()` bằng:
  ```php
  $updated = OrderItem::where('id', $item->id)
      ->where('status', '<>', 'cancelled')
      ->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => ..., 'cancelled_by_user_id' => ...]);
  if ($updated === 1) { /* restoreIngredients chỉ chạy khi transition thắng */ }
  ```
- **cancelOrder (POS):** lặp `$order->items` như hiện tại, nhưng mỗi item dùng cùng guard WHERE (`where status <> cancelled`); restore chỉ khi `$updated === 1`.
- **completeItems / completeOrder (Kitchen):** chuyển `pending|processing → completed` bằng guard `whereIn('status', ['pending','processing'])`; `deductIngredients` chỉ khi câu UPDATE thay đổi đúng 1 dòng.

### Chống deadlock
Trong cùng một transaction, thứ tự khóa cố định: `orders` → `order_items` → `ingredients`. `cancelOrder` đã khóa `orders` bằng `lockForUpdate` (giữ nguyên); các endpoint Kitchen hiện không khóa `orders` — giữ nguyên, chỉ đảm bảo không có hai transaction nào khóa `order_items` theo thứ tự ngược nhau. Không thêm khóa `orders` vào Kitchen để tránh mở rộng phạm vi.

### Kiểm chứng
Test mô phỏng (xem mục 4) đảm bảo `InventoryTransaction` loại `import` chỉ tạo 1 lần cho 1 order_item dù nhiều nguồn cancel.

## 2. Soft delete khuyến mãi

### Vấn đề
`PromotionController::destroy` (:64) gọi `delete()` hard delete. Design gốc `2026-08-01-promotions-design.md` yêu cầu soft delete. Hard delete phá lịch sử: order/invoice đã lưu `promotion_id` mất tham chiếu tên KM trong báo cáo.

### Giải pháp
1. Migration mới: `deleted_at` nullable trên `promotions` (`Schema::table('promotions', fn ($t) => $t->softDeletes())`).
2. `Promotion` model: `use SoftDeletes;`.
3. `destroy` giữ nguyên lời gọi `$promotion->delete()` — tự thành soft delete.
4. `resolvePromotion`/`validatePromotion` (POSController) dùng `Promotion::query()->whereRaw('UPPER(code) = ?', ...)` — Eloquent mặc định thêm `whereNull('deleted_at')`, không cần sửa code; xác nhận bằng test.
5. Toggle `is_active` giữ vai trò tạm ẩn; soft delete dành cho xóa hẳn khỏi danh sách nhưng giữ lịch sử.

### Lưu ý đã biết
Cột `code` vẫn unique nên sau soft delete không tạo lại được mã cũ. Chấp nhận theo quyết định "soft delete chuẩn" (không giải phóng unique).

## 3. Phân tầng thông báo lỗi mã khuyến mãi

### Vấn đề
`resolvePromotion` trả `null` cho mọi lý do không hợp lệ; `validatePromotion` và `checkout`/`bulkCheckout` đều hiển thị generic "Mã khuyến mãi không hợp lệ hoặc đã hết hạn."

### Giải pháp — tách lý do
1. `resolvePromotion` đổi kiểu trả về:
   ```php
   // ['status' => 'ok', 'discount_amount' => float]
   // ['status' => 'rejected', 'reason' => 'not_found'|'inactive'|'not_started'|'expired'|'out_of_uses'|'below_min'|'no_eligible_line']
   // null vẫn giữ nghĩa "không nhập mã"
   ```
   Thứ tự kiểm tra: không tồn tại → không hoạt động → chưa tới hạn → hết hạn → hết lượt → dưới min → không có dòng khớp target.
2. `validatePromotion`: map `reason` → message VN:
   - `not_found` → "Mã khuyến mãi không tồn tại."
   - `inactive` → "Mã khuyến mãi đang tạm ngưng."
   - `not_started` → "Mã khuyến mãi chưa tới hạn áp dụng."
   - `expired` → "Mã khuyến mãi đã hết hạn."
   - `out_of_uses` → "Mã khuyến mãi đã hết lượt sử dụng."
   - `below_min` → "Đơn hàng chưa đạt giá trị tối thiểu."
   - `no_eligible_line` → "Không có món trong đơn thuộc đối tượng áp dụng."
3. `checkout` / `bulkCheckout`: giữ message **generic** ("Mã khuyến mãi không hợp lệ hoặc đã hết hạn.") để không lộ thông tin mã khi thanh toán.
4. `status => 'ok'` phản ánh tính hợp lệ bất kể `discount_amount` bằng 0 — phục vụ frontend (spec frontend, mục B).

## 4. Test backend bổ sung

Mô phỏng atomic race trong môi trường sequential/transaction-rollback (không dùng DB concurrency thật).

1. **Atomic race:** tạo order có item `completed`; gọi `cancelOrder` rồi `cancelItem` (hoặc ngược lại) trên cùng order_item. Assert: item có 1 `cancelled_at`, `InventoryTransaction` loại `import` chỉ tạo **1** lần cho các nguyên liệu của item đó; không throw.
2. **Permission denial:** kiểm tra các endpoint trả 403 khi thiếu quyền, theo mẫu `DashboardTest`/`SecurityAndAccessTest`:
   - `POST /staff/pos/validate-promotion`
   - `POST /staff/pos/cancel-order`
   - `POST /staff/pos/checkout`
   - `POST /staff/pos/bulk-checkout`
   - `GET/POST/PUT/DELETE /manager/promotions` (index/store/update/destroy)
3. **Promotion kết hợp deposit:** tạo order có item `completed` + deposit `held`; checkout với `promotion_code` hợp lệ. Assert: `total = subtotal − discount`, `payable = total − deposit`, deposit chuyển `applied`, invoice `total_amount` đúng, `used_count` tăng 1.
4. **Bulk rollback:** `bulk-checkout` với điều kiện fail (thiếu `amount_received`, hoặc một đơn đã `paid`). Assert: không tạo invoice, không order nào thành `paid`, `used_count` không tăng, deposit không thành `applied`.
5. **Boundary thời gian ca:** `ShiftController::expectedCash` (whereBetween `issued_at` trên `[opened_at, closed_at]`) bao gồm invoice đúng tại `opened_at` và đúng tại `closed_at`. Mở ca song song bị chặn bởi cache lock trả 409.
