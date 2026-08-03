# POS Frontend Hardening — Design

Ngày: 2026-08-03
Phạm vi: phần frontend của đợt hardening POS/promotion. (Spec backend riêng: `2026-08-03-pos-hardening-backend-design.md`.)

## 1. Sửa Rules of Hooks trong PaymentDrawer (vấn đề #5)

### Vấn đề
`PaymentDrawer.tsx:40` có `if (!isOpen || !selectedTable) return null;` đứng TRƯỚC toàn bộ hooks (`useState` 53-57, `useEffect` 59-72). Vi phạm Rules of Hooks: khi `isOpen`/`selectedTable` đổi, số hooks thay đổi giữa các lần render → React báo lỗi "Rendered more/fewer hooks than during the previous render" hoặc reset state sai nhịp.

### Giải pháp
1. Khai báo **tất cả hooks trước**, không early-return đứng đầu component.
2. Chuyển các giá trị derived (`subtotal`, `vatTotal`, `totalAmount`, `discountedTotal`, `payable`, `depositRefund`, `cashPresets`, `changeAmount`, `itemsByOrder`) xuống **sau các hooks**, trước JSX.
3. Giữ gate render `if (!isOpen || !selectedTable) return null;` ở **cuối**, sau khi đã gọi hết hooks, ngay trước câu lệnh `return (...)`.
4. Không thay đổi logic kinh doanh — chỉ sắp lại thứ tự hooks + derived. Lưu ý `useEffect` dòng 59 phụ thuộc `[isOpen, mode, payable, totalAmount]`; `payable`/`totalAmount` phải sẵn sàng khi effect chạy nên derived phải đặt trước effect hoặc trước khi JSX dùng — thứ tự hợp lệ: hooks khai báo trước, derived tính trước `useEffect` reset (nhưng sau `useState`).

## 2. Hiển thị trạng thái "đã áp" cho mã giảm 0đ (vấn đề #4)

### Vấn đề
Frontend điều kiện hiển thị trạng thái "đã áp" dựa trên `promotionDiscount > 0` (PaymentDrawer:244, 248, 272; `usePOSCheckout` set `promotionDiscount = data.discount_amount || 0`). Mã hợp lệ cho giảm 0đ → không nhận diện đã áp: input không disabled, không nút "Hủy mã", không dòng giảm giá.

### Giải pháp — tách "hợp lệ" khỏi "số tiền"
1. **Backend (`validatePromotion`, spec backend mục 3):** `status=ok` phản ánh tính hợp lệ bất kể `discount_amount` bằng 0.
2. **`usePOSCheckout`:** dùng `promotionCode !== null` làm flag đã áp (đã set khi `data.ok`). Giữ `promotionDiscount` cho số tiền. Thêm state `promotionName` (nullable) lưu tên KM khi áp; clear cùng `promotionCode`.
3. **`PaymentDrawer`:** thêm prop `promotionName?: string | null`. Điều kiện "đã áp" đổi từ `promotionDiscount > 0` → `promotionApplied = promotionName != null && promotionName !== ''` (hoặc flag tường minh).
   - Input disabled, hiện badge "Đã áp: {promotionName}".
   - Nút "Hủy mã" xuất hiện khi `promotionApplied`.
   - Dòng "Giảm giá: −{promotionDiscount}" hiển thị rõ cả khi bằng 0 (hiện "−0 đ") khi `promotionApplied`.
4. Khi user mở drawer với discount đã áp trước đó, `usePOSCheckout` đã giữ state; PaymentDrawer hiển thị tên như hiện hành.

## 3. Test frontend

Repo không có framework test JS (không vitest/jest — chỉ `tsc --noEmit`, `eslint`, `vite build`). Do đó:
- Kiểm chứng bằng `npm run types:check` (tsc --noEmit), `npm run lint`, `npm run build`.
- Không thêm jest/vitest mới (tránh phình hạ tầng; chưa có hạ tầng sẵn).
- Kiểm chứng hành vi backend (reason phân biệt, status=ok 0đ) nằm trong test Pest của spec backend.