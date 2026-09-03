# Design: Nghiệp vụ vận hành hằng ngày — Customer, Supplier & Công nợ, Hoàn/Trả hàng, Chi tiêu trong ca

Ngày: 2026-09-04
Trạng thái: Approved (design trình bày + xác nhận từng mục)

## Bối cảnh

Audit nghiệp vụ toàn hệ thống (routes, pages, models, migrations) cho thấy hệ thống là POS
F&B/tạp hóa đã phủ tốt (bán hàng, bếp, phục vụ realtime, khuyến mãi v2, kho FIFO + HSD,
kiểm kê, ca làm việc, 13 báo cáo, RBAC). Các nghiệp vụ thực tế còn thiếu và được chọn làm
trong đợt này (loại bỏ barcode — chưa có dữ liệu/kiến thức nghiệp vụ):

1. Khách hàng (chỉ thông tin + gắn đơn — không tích điểm, không ghi nợ khách)
2. Nhà cung cấp + công nợ (đầy đủ: phiếu nhập + thanh toán nợ)
3. Hoàn/trả hàng (hoàn một phần dòng món)
4. Chi tiêu trong ca (ghi chi + thu ngoài)

## A. Khách hàng (Customer)

**Model `Customer`** (`app/Models/Customer.php`):
- `name: string`, `phone: string|unique` (tối đa 20, normalize strip spaces), `note: string|null`
- `created_by: FK users nullable`

**Migration**: `create_customers_table` — `id, name, phone (unique), note, created_by, timestamps`
+ index `phone`.

**Trang quản lý** `/manager/customers`:
- `CustomerController::index` — bảng: tên, SĐT, ghi chú, tổng số đơn, tổng tiền mua (subquery orders);
  tìm theo tên/SĐT (like / like phone).
- `store` / `update` / `destroy` — phân quyền `customers.create/edit/delete`, `customers.view` cho index.
- Route group `Route::prefix('manager')` cùng pattern còn lại, middleware `permission:customers.view`...
- Frontend `manager/customers/CustomersManager.tsx` theo pattern các manager hiện có
  (search bar + DataTable + form drawer).

**Gắn khách tại POS**:
- `PaymentDrawer` (staff/pos/components/PaymentDrawer.tsx): khối `Khách hàng` —
  input tìm theo SĐT (min 3 số) → dropdown kết quả gọi `POST /staff/pos/customers/search`
  (xác thực `pos.create`), hiển thị tên + SĐT; nút "Tạo mới" (modal tên + SĐT, ghi chú optional);
  sau khi chọn/tạo, badge khách hiển thị; có thể xoá chọn (×).
- Khi thanh toán: `customer_id` (nullable) gửi kèm `POST /staff/pos/checkout`.
- **Backend**: `CheckoutService::runBulk` nhận thêm `?int $customerId = null`, lưu vào `orders.customer_id`
  (đã có cột trong `orders.the` migration gốc — đặt lại đảm bảo foreignId nullable) và
  thêm cột `invoices.customer_id` (nullable FK) — lưu khi tạo invoice.
- `OrderList`/`OrderDetail`/`SalesInvoiceReport` hiển thị tên khách (join) nếu có.

## B. Nhà cung cấp (Supplier) + Công nợ

**Model `Supplier`**:
- `name: string`, `phone: string (nullable)`, `address: string|null`, `note: string|null`,
  `is_active: bool default true`.

**Migration**: `create_suppliers_table` + thêm cột cho `stock_vouchers`:
- `supplier_id: FK suppliers nullOnDelete`
- `is_paid: bool default false` (field trả tiền trên phiếu nhập)

**Trang quản lý** `/manager/suppliers`:
- `SupplierController::index` — bảng: tên, SĐT, địa chỉ, tổng nhập (SUM imports),
  đã trả (SUM paid), công nợ (chênh lệch), trạng thái; tìm theo tên/SĐT.
- CRUD standard + phân quyền `suppliers.*`.
- Frontend `manager/suppliers/SuppliersManager.tsx` + `SupplierFormDrawer` (pattern hiện có).

**Phiếu nhập** (`StockVoucherController::store`, route `/manager/inventory/vouchers`):
- Add select `Nhà cung cấp` (nullable) + checkbox `Đã trả tiền` (bool, mặc định unchecked).
- Validate: `supplier_id` nullable `exists:suppliers,id`, `is_paid` bool.

**Thanh toán công nợ**:
- Model `SupplierPayment`: `supplier_id FK`, `amount decimal(15,2)`, `paid_at datetime`,
  `note string|null`, `created_by FK`.
- Route `POST /manager/suppliers/{supplier}/payments` (`suppliers.edit`) — body: `amount`, `note`,
  `voucher_ids[]` (các phiếu nhập chưa trả được chọn). Transaction:
  1. Tạo `SupplierPayment`.
  2. `stock_vouchers` của supplier với id ∈ voucher_ids → update `is_paid = true`
     (hoặc nếu đã trả hết trước đó thì giữ nguyên).
- Nút "Thanh toán" ở bảng / modal chọn phiếu chưa trả của supplier đó,
  hiển thị `pending_amount = tổng nhập chưa paid`. Thanh toán đặt `is_paid = true` trên các phiếu
  đã chọn trong giao dịch đó. `debt = SUM(import chưa paid)` — nếu một phiếu đã trả một phần
  (thanh toán nhỏ hơn tổng phiếu chọn) thì phiếu đó phân ly thành "đang trả" không được hỗ trợ
  trong đợt này; ghi chú cho chủ giám sát: thanh toán nên chọn đúng nhóm phiếu chưa trả.

## C. Hoàn/Trả hàng (Refund)

**Phạm vi**: hoàn một phần dòng món của hoá đơn đã thanh toán (`Invoice` type `sale`,
status paid, không phải hoá đơn return khác).

**Luồng**:
1. Entry: `manager/orders/OrderDetail.tsx` (hoặc `InvoiceDetail`) nút "Hoàn trả" → modal
   `RefundModal`: danh sách dòng hoá đơn (món, đơn giá, số lượng đã mua, số lượng đã hoàn),
   nhập số lượng hoàn mỗi dòng (min 1, tối đa quantity - refunded), lý do (select:
   `Đổi món`, `Hàng lỗi`, `Khách huỷ`, `Khác`), ghi chú. Chỉ hoàn theo **tiền mặt** trong đợt này
   (dù payment gốc là bank — hoàn cố định `method=cash`).
2. `POST /staff/pos/refund` hoặc `POST /manager/orders/{id}/refund` (chọn `permission:orders.refund`):
   - Validate dòng: `refunded_qty` đã trừ vào `InvoiceLine.refunded_qty` (cột mới).
   - Tạo **Payment âm**: `Payment::create(invoice_id=invoice gốc, method=cash, amount=-(total refund), note='Hoàn trả hoá đơn ...', received_by=user)`.
   - **Trả kho**: với mỗi món hoàn, tìm `ProductRecipe` → `LotService::increment` + `StockVoucher` type `import`
     note `Hoàn trả hoá đơn INV-...` (cộng lại stock_quantity, tạo lô với `quantity_remaining = amount × qty` hoàn).
     Nếu món không có recipe → chỉ hoàn tiền, không đụng kho.
   - Ghi `OrderActivityLogger::log('refund', userId, ['invoice_code', 'amount', 'items'])`.
   - Cache dashboard flush + `IngredientStockUpdated` dispatch.

**Schema**: 
- `invoice_lines.refunded_qty: unsignedInteger default 0` (hoá đơn đã hoàn không được > quantity).
- `payments.amount` đã là decimal(15,2) cho phép âm (đã dùng trong hoàn cọc) — tái sử dụng,
  không đổi schema.

## D. Chi tiêu trong ca (CashMovement)

**Model `CashMovement`**: `shift_id FK shifts`, `type enum('expense','income')`,
`category string (30)` — expense: `mua_nguyen_lieu, dien_nuoc, van_chuyen, khac`;
income: `thu_ngoai, khac`, `amount decimal(15,2)`, `note string|null`, `created_by FK users`.

**Migration**: `create_cash_movements_table` + index `shift_id`.

**ShiftsPage** (staff/shifts/ShiftsPage.tsx): 2 nút "Ghi chi" / "Ghi thu" (chỉ khi ca đang mở)
→ modal: số tiền, loại (select, theo kiểu), ghi chú → `POST /staff/shifts/movements`.
- `ShiftController::storeMovement` — validate shift đang mở (`status=open`), loại hợp lệ,
  amount > 0; chỉ người mở ca hoặc manager được ghi (kiểm tra `shift->opened_by` user hoặc is_admin).

**ShiftService::expectedCash** sửa thành:
- hiện tại: `opening + checkoutCash + depositCash − refundedDeposit`
- thêm: `+ Σ(income CashMovement) − Σ(expense CashMovement)` trong khoảng thời gian ca.
- `ShiftController::close` + `ShiftsPage` hiệu ứng: expected cash đã gồm chi/ thu ngoài.

## Phân quyền mới (Seed)

Permissions mới (AuthorizationSeeder list): `customers.view/create/edit/delete`,
`suppliers.view/create/edit/delete`, `orders.refund` (hoặc dùng `orders.view` + nút cho admin).
`shifts.movement` (hoặc dùng `shifts.view`) — quyết định: thêm `shifts.movement` tách.
`reports.view` giữ nguyên (không đổi).

## Giao diện tóm tắt

- Trang mới `manager/customers/CustomersManager.tsx`, `manager/suppliers/SuppliersManager.tsx`,
  `RefundModal` trong `manager/orders/components/`.
- `PaymentDrawer` thêm khối khách hàng; `ShiftsPage` thêm modal chi/thu.
- Navigation (pages table) thêm các page mới nhóm `Quản lý`.

## Testing

Pest + RefreshDatabase (theo convention hiện có):
- Customer: create/update/search unique phone; checkout gắn customer_id lên order + invoice.
- Supplier: CRUD; import voucher với supplier + is_paid=false; payment → is_paid=true,
  debt = sum import − sum payments.
- Refund: hoàn 1 dòng → payment âm, refunded_qty cập nhật, kho cộng lại (LotService.increment),
  không thể hoàn quá số đã mua; hoàn món không recipe chỉ hoàn tiền.
- CashMovement: ghi chi/ thu khi ca mở; expectedCash bao gồm income − expense.

## Files chạm (dự kiến)

- Migrations: `create_customers_table`, `add_supplier_to_stock_vouchers`, `create_suppliers_table`,
  `create_supplier_payments_table`, `add_customer_to_invoices`, `add_refunded_qty_to_invoice_lines`,
  `create_cash_movements_table`
- Models: `Customer`, `Supplier`, `SupplierPayment`, `CashMovement` (mới); Invoice, Order, InvoiceLine, StockVoucher (sửa)
- Services: `CheckoutService` (customerId), `ShiftService` (cash movements), `LotService` (dùng lại)
- Controllers: `CustomerController`, `SupplierController` (mới); StockVoucherController, PaymentController/CheckoutService, ShiftController, OrderListController
- Seed: AuthorizationSeeder (permissions mới)
- Frontend: CustomersManager, SuppliersManager, RefundModal, PaymentDrawer, ShiftsPage
