# Payment Core Restructure — Thiết kế

> Ngày: 2026-08-05 · Trạng thái: đã duyệt kiến trúc (phương án A) · Dữ liệu cũ: giữ song song tham khảo

## 1. Bối cảnh & vấn đề

Thanh toán hiện phải đụng cả `orders` (tiền tạm) lẫn `invoices` (tiền thực). `orders.total` bị tính lại ở nhiều nơi (giảm món, gọi thêm, checkout trừ KM) → nguy cơ lệch; thêm một loại tiền mới (KM, cọc, ví...) là phải thêm cột và sửa nhiều nơi.

Nhu cầu thực sắp tới (đã xác nhận):
- **Split payment**: 1 hoá đơn trả bằng nhiều phương thức.
- **Khuyến mãi nâng cao**: coupon/voucher, stack nhiều chương trình trên 1 đơn.
- **In hoá đơn VAT chặt**: thuế theo từng dòng, sẵn chỗ tích hợp hoá đơn điện tử.

Quyết định nghiệp vụ VAT (đã chốt): **giá menu đã bao gồm VAT** — khách trả = giá menu; VAT chỉ tách ra để in báo cáo/hoá đơn.

## 2. Kiến trúc — 2 tầng

```
[ Tầng NGHIỆP VỤ — orders, order_items ]
   Trạng thái vận hành đơn (thêm/giảm/huỷ/gọi thêm, merge bàn).
   Chỉ giữ tiền tạm để hiển thị UI drawer; không là số ghi sổ.

[ Tầng THANH TOÁN — invoices, invoice_lines, invoice_promotions, payments ]
   Nguồn sự thật duy nhất về tiền sau khi đơn hoàn tất.
   Chỉ ghi khi checkout. orders.total lúc paid = invoice.total_amount (1 công thức duy nhất).
```

Luồng: vận hành chỉ đụng tầng nghiệp vụ; checkout đọc `order_items` → dựng `invoice_lines` → áp N khuyến mãi (`invoice_promotions`) → tính total → ghi `invoices` + `payments` (+ settlement cọc) → khoá order `paid`. Báo cáo đọc từ tầng thanh toán.

## 3. Data model

### `payments` (mới) — split payment
```
id, invoice_id -> invoices
method      enum('cash','bank_transfer','e_wallet')
amount      decimal(15,2)      // > 0
reference   string nullable    // mã GD ngân hàng/ví
received_by -> users nullable, note nullable, timestamps
```
`invoices.payment_method`: giá trị method nếu 1 dòng; `'mixed'` nếu nhiều dòng.

### `invoice_lines` (mới) — snapshot từng món lúc checkout
```
id, invoice_id, order_item_id nullable, menu_item_id nullable
name_snapshot, quantity, unit_price, subtotal
vat_rate decimal(5,2), vat_amount decimal(15,2)   // VAT chứa trong giá
discount_amount decimal(15,2)                     // phân bổ từ invoice_promotions
```

### `invoice_promotions` (mới) — stack nhiều KM trên 1 invoice
```
id, invoice_id, promotion_id nullable -> promotions
code, name                          // snapshot
discount_type, discount_value       // snapshot cấu hình lúc áp
amount decimal(15,2)                // giảm thực đã áp
stack_order smallint                // thứ tự chạy (mã trước giảm trước)
```
Gom chung cho promotion/coupon/voucher (voucher = promotion `max_uses=1` + `fixed_amount`) — KHÔNG tạo bảng coupons riêng.

### `invoices` (cập nhật)
```
+ subtotal_amount, vat_amount, discount_amount   // tổng từ invoice_lines
+ external_no, external_ref nullable             // chỗ cho hoá đơn điện tử (nullable, chưa dùng)
total_amount, deposit_amount, payment_method     // giữ
```

### `orders` (giữ nguyên cột) — 1 nguồn cập nhật duy nhất
Khi `paid`: `orders.total = invoice.total_amount`; `orders.discount_amount = invoice.discount_amount`. khi chưa checkout, preview dùng helper tính JIT, không tin vào cột total cho quyết toán.

### `deposits` (giữ)
+ `payment_id nullable -> payments` — khi `applied`, cọc là một nguồn thanh toán.

### Quan hệ
```
orders 1:N order_items
orders N:1 invoices            // bulk: nhiều orders / 1 invoice
invoices 1:N invoice_lines | payments | invoice_promotions
deposits N:1 orders; deposits.payment_id -> payments khi applied
```

## 4. Luồng checkout (CheckoutService)

Service mới `App\Services\Checkout\CheckoutService::run(orderIds, payments[], promotionCodes, user)` trong 1 transaction:

1. **Validate** (giữ): lock orders; chặn paid/cancelled/reserved; khoá bếp/bypass; tổng amount_received >= payable.
2. **Dựng invoice_lines** từ order_items active: snapshot name/vat_rate/unit_price; `subtotal = qty*unit_price`; `vat_amount` theo công thức VAT-trong-giá (xem §5).
3. **PromotionEngine::resolveAll(codes, lines, subtotal)**: chạy từng mã theo stack_order trên subtotal còn lại; cap `min(discount, subtotal_còn_lại)`. Per-code kết quả: mã nào reject → engine trả `status=rejected` cho mã đó, không hạ các mã khác. Ở checkout: nếu bất kỳ mã nào reject → abort toàn bộ checkout lỗi rõ (không ghi hoá đơn), vì lúc đó promotion nhân viên nhập sai. Ghi `invoice_promotions` (amount thực) cho từng mã ok + phân bổ theo tỷ trọng xuống `invoice_lines.discount_amount` (dùng lại `Promotion::allocateLineDiscounts`).
4. **Total 1 chỗ**: `invoice.total_amount = max(0, subtotal_amount - discount_amount)` (VAT đã trong giá, không cộng thêm).
5. **Ghi payments** (N dòng), tổng amount_received/change; cọc `held -> applied` kèm `payment_id`.
6. `orders.total = invoice.total_amount`, status `paid`, giải phóng bàn (giữ logic hiện có).

Preview trước checkout dùng `OrderTotals::preview(order)` (JIT từ order_items), không lưu; xoá mọi chỗ ghi `total` trong `sendToKitchen`.

API compat: `/staff/pos/validate-promotion` giữ single-code (gọi resolveAll([code])); mở rộng chấp nhận `codes[]`.

PaymentDrawer: dòng VAT đổi thành **"Trong đó VAT:"** (không cộng vào tổng), giá trị từ preview/total VAT trong giá.

## 5. Công thức VAT (giá đã gồm thuế)

```
net   = floor(subtotal / (1 + vat_rate/100))
vat   = subtotal - net
total = subtotal - discount          // discount cap ở subtotal
```

Làm tròn: net lấy `floor` (chẵn đồng); `vat = subtotal - net` giúp `net + vat = subtotal` chính xác, không lẻ hao. Mọi nơi thay `subtotal * vat_rate/100` (tính tiến, sai với giá-gồm-thuế và lẻ sai số) bằng công thức trên. Ghi chú: `menu_items.vat_rate` có thể là null → coi = 0.

## 6. Migration dữ liệu cũ (song song, giữ bảng cũ)

- Tạo bảng mới + thêm cột; KHÔNG xoá orders/invoices/order_items/promotions cũ.
- **Backfill** (tùy chọn, chạy 1 lần): với mỗi invoice cũ → 1 `payments` (method cũ); `invoice_lines` từ order_items (vat_amount=0 vì lịch sử không có rate; discount_amount từ `order_items.discount_amount` có sẵn); `invoice_promotions` 1 dòng nếu `orders.promotion_id` (snapshot từ promotions, amount = orders.discount_amount). Tổng giữ như cũ.
- Báo cáo chuyển nguồn: món → `invoice_lines`; phương thức → `payments`.

## 7. Phase triển khai

1. **P0** — Schema + `OrderTotals`, `PromotionEngine`, `CheckoutService` (chưa gắn controller) + test engine.
2. **P1** — checkout/bulkCheckout qua CheckoutService, ghi bảng mới; giữ API cũ.
3. **P2** — báo cáo + PaymentDrawer đọc lines/payments, hiển thị VAT-trong-giá.
4. **P3** — backfill + gỡ cập nhật total trong sendToKitchen.

## 8. Testing (Pest)

- `OrderTotals`: VAT trong giá (50k, 10% → net 45454, vat 4546 — 45454+4546=50000 đoạn đúng); discount > subtotal cap 0; N KM.
- `PromotionEngine`: stack 2 mã (percentage rồi fixed) trên base còn lại; mã reject không hạ cả stack; voucher max_uses=1.
- `CheckoutService`: split payment (cash + transfer); cọc applied kèm payment_id; invoice_lines đủ vat/discount; total consistent order = invoice.
- Báo cáo đọc từ invoice_lines/payments.

## 9. Ngoài phạm vi

- Không dùng EAV / ledger append-only.
- Không tạo bảng coupons riêng.
- Không đổi nghiệp vụ vận hành (bàn/món/merge/kitchen) ngoài gỡ ghi total.
- external_no/external_ref chỉ là cột chờ, chưa tích hợp nhà cung cấp hoá đơn điện tử.
