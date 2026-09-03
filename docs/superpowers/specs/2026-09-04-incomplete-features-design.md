# Design: Hoàn thiện phần dở dang — unit_conversion, QR VietQR, In ticket bếp

Ngày: 2026-09-04
Trạng thái: Approved

## Bối cảnh

Sau audit: `purchase_unit`/`unit_conversion` được lưu và hiển thị nhưng **không nơi nào áp dụng**
(nhập kho theo thùng/kg → tồn kho sai hệ số). Thanh toán chỉ có cash/bank_transfer/e_wallet
không sinh mã QR. Bếp chỉ xem màn hình, không in được ticket.

Đợt này hoàn thiện 3 phần (Combo bỏ khỏi scope theo quyết định):

## E. Áp dụng unit_conversion khi nhập kho

**Nguyên tắc:**
- Mỗi nguyên liệu có đơn vị gốc `unit` (vd `chai`, `g`, `ly`) và tùy chọn
  `purchase_unit` (vd `thùng`) với `unit_conversion` (1 thùng = 24 chai).
- **Tồn kho luôn theo đơn vị gốc**: `stock_quantity`/`quantity_remaining`/`quantity`
  lưu theo `unit`. Không đổi ngữ nghĩa các cột tồn hiện có.
- `unit_conversion` chỉ áp dụng tại thời điểm **nhập vào** (và hiển thị khi xuất bếp).

**StockImportModal** (`resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx`):
- Mỗi dòng nhập thêm select "Đơn vị nhập": 2 option — `purchase_unit` (kèm `× conversion`)
  và `unit` (conversion = 1). Mặc định `purchase_unit` nếu có.
- Input `quantity` nhập theo đơn vị đang chọn; `expiry_date` giữ nguyên.
- `unit_price` nhập theo đơn vị đang chọn → quy về đơn vị gốc khi gửi
  (`toBasePrice` đã có, giữ nguyên).
- `toBaseQuantity` (đã có) — chỉ cần đảm bảo conversion lấy đúng theo đơn vị chọn
  (vd chọn `unit` thì conversion = 1).
- UI hiển thị thông tin quy đổi ngay dưới dòng: `1 thùng = 24 chai`
  (nếu purchase_unit tồn tại) + tổng quy đổi (vd `2 thùng × 24 = 48 chai`).

**Backend** (`StockVoucherController::store`):
- Vẫn nhận `quantity` theo đơn vị gốc (frontend đã quy đổi trước khi gửi) —
  backend không cần đổi; `unit_price` cũng quy về gốc từ frontend.
- Sinh `StockVoucherItem` với `quantity`/`quantity_remaining` đơn vị gốc như hiện tại.

**Hiển thị trong hệ thống:**
- `IngredientsManager`/`IngredientFormDrawer`: giữ field `purchase_unit`, `unit_conversion`
  + thêm mô tả nhỏ `1 {purchase_unit} = X {unit}`.
- StockVoucherDetail / InventoryValueReport hiển thị đơn vị gốc theo cột `unit` (không đổi).

**Ghi chú ưu tiên:** Đây là tính năng chính — đảm bảo mọi chỗ nhập mới đều quy đổi đúng.
Kho xuất (recipe consumption) đã tính theo đơn vị gốc; không đổi.

## F. QR VietQR tĩnh

**Cấu hình `.env`** (file `config/payment.php` mới):
```
PAYMENT_QR_BANK_CODE=970422      # Mã BIN ngân hàng (vd 970422 VCB, 970405 TPBank)
PAYMENT_QR_ACCOUNT_NO=0368192905
PAYMENT_QR_ACCOUNT_NAME=NGUYEN MINH DUC
PAYMENT_QR_ENABLED=true
```
- Đọc các env này trong `config/payment.php` (chưa có file — tạo mới, dùng pattern config/services).
- Nếu `PAYMENT_QR_ENABLED=false` → hide khối QR ở PaymentDrawer.

**PaymentDrawer** (`resources/js/pages/staff/pos/components/PaymentDrawer.tsx`):
- Khi `paymentMethod === 'bank_transfer'` và QR enabled: hiển thị `<img>`
  `https://img.vietqr.io/image/{bank}-{account}-qr_only.png?amount={payable}&addInfo={encodeURIComponent('Thanh toan hoa don ' + orderCode)}&accountName={encodeURIComponent(accountName)}`.
- Số tiền `payable` (đã tính trong drawer) — QR nhập giờ.
- "Xác nhận đã nhận chuyển khoản" → checkout với method `bank_transfer`;
  lưu `payment.reference = addInfo` nếu có (header server lưu reference hiện có trong PaymentController).
- Không gọi API ngân hàng, không tự kiểm tra thành công (theo quyết định — nhân viên xác nhận tay;
  để lại việc check tự động cho tương lai).

## G. In ticket bếp bằng CSS print

**KitchenDisplay** (`resources/js/pages/staff/kitchen/KitchenDisplay.tsx`):
- Nút "In ticket" trên card order (nhỏ, góc đầu card).
- Khi bấm: tạo/render vùng `div#print-area` (ẩn khỏi màn hình — `position:fixed; left:-9999px` hoặc
  class `.print-only`), chứa ticket: tên quán + `order_code` + bàn + các món (`qty × name`, note mỗi món)
  + ghi chú tổng + thời gian gửi + mô tả khu.
- `window.print()` sau khi render; CSS `@media print` ẩn những gì còn lại, chỉ hiện `#print-area`.
- Không thư viện bên thứ ba (không ESC/POS, không driver máy in).

**POSManager** (in hoá đơn):
- ReceiptPrintModal hiện có dùng `window.print()` với CSS print riêng (đã in ổn).
- Thêm nút "In" cho một hoá đơn đã lưu (OrderList/OrderDetail) tái sử dụng cùng phong cách CSS.

**CSS**:
- Thêm vào `resources/css/app.css` (hoặc file `print.css` mới): 
  - `@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; } }`
  - Chiều rộng ticket theo máy in 58mm (mặc định) — webkit ẩn margin, font-size nhỏ hơn.
- Tách ticket bếp ra một component `KitchenPrintTicket.tsx` (props: order) để tái sử dụng+test.

## Testing

- Unit_conversion: `StockImportModal` quy đổi khi chọn thùng/chai (1 thùng = 24 chai, nhập 2 = 48 chai)
  + test back: nhập đơn vị gốc (đơn vị 1) không quy đổi sai. `StockVoucherController` luôn lưu đơn vị gốc.
- QR: test cấu hình thành (không QR khi disabled; có khi enabled, URL chứa code/account/amount/addInfo).
- Print: kiểm tra component `KitchenPrintTicket` render đúng nội dung.

## Files chạm

- Tạo: `config/payment.php`
- Sửa: `resources/js/pages/manager/inventory/ingredients/components/StockImportModal.tsx`,
  `resources/js/pages/staff/pos/components/PaymentDrawer.tsx`,
  `resources/js/pages/staff/kitchen/KitchenDisplay.tsx`,
  `resources/js/components/...`, `resources/css/app.css`
- Tạo mới: `resources/js/components/KitchenPrintTicket.tsx` (hoặc trong kitchen/components)
- `.env.example`: thêm các biến `PAYMENT_QR_*`
