# Design: Phát hành mã hàng loạt (Coupon theo chuỗi + Voucher ngẫu nhiên + Export Excel)

**Ngày:** 2026-08-13
**Phạm vi:** Phần A — phát hành mã hàng loạt cho Coupon/Voucher. Phần B (lịch giờ/thứ trong tuần) tách plan riêng.

---

## Bối cảnh & Vấn đề

Hiện tại `promotions.code` là **unique** — mỗi mã là 1 row riêng trong `promotions`. Khi cần phát hành 1000 mã:
- Cách hiện tại phải tạo 1000 row `promotions` (mỗi row lặp lại action/condition/status) → **loãng DB**, query campaign chậm, khó quản lý.
- Chưa có cách sinh hàng loạt + export Excel để in / gửi SMS/Zalo.

## Mục tiêu

1. Coupon: tạo 1 campaign + **N mã con có số thứ tự** (vd prefix `GIAM30` → `GIAM30-001` … `GIAM30-1000`), mỗi mã dùng **1 lần**.
2. Voucher: tạo 1 campaign + **N mã ngẫu nhiên không trùng** (vd `DK123`, `DK456`…), lưu DB, **áp dụng được tại POS**, export **Excel** (Mã, Giá trị giảm, Hạn sử dụng, Trạng thái).
3. **DB không loãng:** 1 campaign = 1 row `promotions`; mã con nằm ở bảng riêng `promotion_codes` chỉ 5 cột cốt lõi + index `code` unique → query O(1), 1000 row vô cùng nhẹ.
4. Backward compatible: mã lẻ `promotions.code` cũ vẫn hoạt động.

---

## Kiến trúc

### Schema

**Bảng mới `promotion_codes`:**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigint PK | |
| `promotion_id` | FK → promotions, cascadeOnDelete | |
| `code` | string(50), **unique** | mã con, index unique cho query O(1) |
| `status` | enum `['unused','used']` | default `unused` |
| `used_at` | timestamp nullable | |
| `used_invoice_id` | FK → invoices nullable | truy vết hoá đơn đã dùng |
| timestamps | | |

**`promotions` thêm 3 cột:**
- `code_prefix` string(30) nullable — chuỗi cố định (coupon) hoặc tiền tố random (voucher).
- `code_quantity` integer nullable — số mã con.
- `code_random` boolean default false — `true` = voucher mã ngẫu nhiên, `false` = coupon số thứ tự.

### Service sinh mã — `PromotionCodeService`

- `generate(Promotion $p): void` — gọi sau khi campaign vừa tạo:
  - **Coupon (số thứ tự):** `PREFIX-001` … `PREFIX-N`, padding theo độ rộng của N.
  - **Voucher (random):** sinh N mã không trùng (độ dài cấu hình, mặc định 6 ký tự, bảng chữ cái không nhầm lẫn `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), kiểm tra unique qua DB + retry.
- **Bulk insert 1 lần** bằng query builder `insert()` (không Eloquent per-row) → 1000 row trong vài trăm ms.
- **Tiền kiểm tra trùng:** trước khi sinh, kiểm tra prefix chưa tồn tại trong `promotions.code_prefix` hoặc `promotion_codes.code` → lỗi "Prefix đã được sử dụng".

### Engine validate mã — `PromotionEngine::resolveAll`

- Khi nhận mã nhập (chuẩn hoá uppercase + trim như cũ):
  1. Query `promotion_codes` theo `UPPER(code) = ?` (index unique, case-insensitive). Nếu có → load campaign `promotion` + mã; kiểm tra `status === 'unused'`; reject `already_used` nếu đã dùng.
  2. Nếu không tìm thấy ở `promotion_codes` → fallback `promotions.code` (mã lẻ cũ) như hiện tại.
- Quota mã con (1 lần): khi checkout (`lockForUpdate` trên row `promotion_codes`), chuyển `unused → used`, set `used_at` + `used_invoice_id`. Campaign `used_count` vẫn tăng (phục vụ KPI/hiệu suất).
- **Backward compatible:** không đổi hành vi mã lẻ.

### Endpoints (routes `/manager/promotions`)

| Route | Method | Chức năng |
|---|---|---|
| `/promotions` | POST | Thêm campaign; nếu có `code_prefix` + `code_quantity` → sau khi tạo campaign gọi `generate()` |
| `/promotions/{promotion}/codes` | GET | Danh sách mã con (phân trang) + bộ đếm `unused`/`used`/tổng |
| `/promotions/{promotion}/codes/export` | GET | Export Excel (exceljs — đã dùng ở báo cáo): cột Mã, Giá trị giảm, Hạn sử dụng, Trạng thái |

---

## Frontend — `PromotionFormDrawer`

- Khi type = `coupon`/`voucher`, thêm section **"Phát hành mã hàng loạt"**:
  - Ô `code_prefix` (chuỗi cố định) + nút sinh random prefix.
  - Ô `code_quantity` (số lượng, 1–100.000).
  - Checkbox **"Mã ngẫu nhiên (voucher)"** → bật `code_random`.
- Khi edit campaign đã có mã con: hiển thị bộ đếm (tổng / đã dùng / còn lại) + nút **"Export Excel"** + bảng danh sách mã (phân trang).
- Giữ nguyên các trường campaign hiện có (actions, conditions, dates, target_usage…).

---

## Error handling

- **Prefix trùng** → 422 "Prefix đã được sử dụng, vui lòng chọn prefix khác".
- **Số lượng không hợp lệ** → validation `code_quantity` 1–100.000.
- **Sinh random trùng quá số lần retry** → rollback + "Không đủ tổ hợp mã".
- **Mã đã dùng khi validate** → `validatePromotion` trả `already_used` message rõ cho POS.
- **Race 2 POS cùng mã con** → `lockForUpdate` trên `promotion_codes` row: 1 thắng, 1 nhận `already_used`.
- **Export khi không có mã** → Excel trống + thông báo (hoặc 404).

---

## Testing (Pest)

- `PromotionCodeServiceTest`: coupon số thứ tự đúng format; voucher không trùng + đủ số lượng; bulk insert nhanh.
- `PromotionEngineTest`: mã con chưa dùng → ok; đã dùng → `already_used`; mã lẻ cũ vẫn ok.
- `PaymentControllerTest`: checkout dùng mã con → 1 lần, `used_count` tăng; lần 2 reject.
- `PromotionControllerTest`: store + prefix/quantity → tạo đủ mã; export Excel trả file; prefix trùng → 422.
- Race test: 2 checkout cùng mã con song song → 1 thắng 1 reject.

---

## Không nằm trong phạm vi (Phần B — plan riêng)

- Lịch theo giờ / thứ trong tuần (khung giờ vàng).
- Tích hợp gửi SMS/Zalo (chỉ export Excel để in hoặc nạp vào hệ thống gửi tin).
