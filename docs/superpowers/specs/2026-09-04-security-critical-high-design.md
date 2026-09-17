# Design: Security Critical + High Fixes

Ngay: 2026-09-04
Trang thai: Approved

## Muc tieu

Loại bỏ 2 Critical + 7 High từ security audit bằng kiến trúc bảo mật trung tâm:

- root admin bất biến trong DB
- cash-out hậu kiểm qua một money ledger duy nhất
- permission tách theo hành động
- cọc bank bắt buộc reference + xác nhận
- hoàn/cancel/NCC payment có kiểm tra quyền và invariant server-side
- checkout lock có thẩm quyền ở server
- CSV export an toàn
- credential plaintext bị loại bỏ khỏi workspace

## A. Root Admin va PrivilegeGuard

### Schema

Them `users.is_root_admin boolean default false`, index riêng.

- AuthorizationSeeder đặt `true` đúng user được tạo/tìm từ `ADMIN_EMAIL`.
- Field không nằm trong `$fillable`, không expose trong form/API đại trà.
- Root admin giữ quyền ngay cả khi đổi email.

### `PrivilegeGuard`

Service `App\Services\Security\PrivilegeGuard` cung cấp:

- `assertCanAssignRoles(User $actor, User $target, array $roleNames): void`
- `assertCanModifyRole(User $actor, Role $role, array $permissionNames, array $pageIds): void`
- `assertCanModifyUser(User $actor, User $target): void`

Rules:

- Chỉ tài khoản `is_root_admin=true` được giữ role `admin`; UI/API không được gán role `admin` cho bất kỳ user khác, kể cả khi actor là root.
- Chỉ root admin được sửa root admin hoặc cấu hình role/permission đặc quyền.
- Non-root không được sửa chính mình theo hướng tăng permission/page/role.
- Non-root không được cấp permission/page họ không sở hữu.
- Không cho rename role bất kỳ thành `admin`.
- Bulk user-role actions đi qua cùng guard.

### Security audit log

Bang `security_audit_logs`:

- `actor_id`, `action`, `target_type`, `target_id`
- `before`, `after` JSON
- `ip`, `user_agent`, `created_at`

Ghi cho mọi thay đổi user role, role permission/page, root-admin-sensitive operation.

## B. Permission rieng cho money mutation

Permissions mới:

- `payments.refund`
- `deposits.create`
- `deposits.refund`
- `suppliers.pay`
- `orders.cancel`
- `shifts.movement`
- `cash-flow.view`

Role Thu ngân được cấp các permission thao tác tiền phù hợp. Guest, bếp, kho không được.

HTTP route và controller guard dùng permission mới, không tái sử dụng quyền đọc hoặc `pos.create` cho cash-out/cancel.

## C. MoneyLedgerService va trang hau kiem dong tien

### Schema `money_ledger_entries`

- `direction`: `in|out`
- `type`: `sale|deposit|deposit_refund|order_refund|supplier_payment|shift_income|shift_expense|cash_change`
- `amount decimal(15,2)` (luôn dương; direction thể hiện dấu)
- `method`: `cash|bank_transfer|e_wallet|mixed`
- `reference`, `reason`
- nullable FKs: `shift_id`, `invoice_id`, `order_id`, `supplier_id`
- `performed_by`, `occurred_at`
- `warning_flags JSON`, `meta JSON`
- indexes: `(occurred_at,type)`, `shift_id`, `performed_by`

### Service

`App\Services\Money\MoneyLedgerService`:

- `recordIn(...)`
- `recordOut(...)`
- Không controller nào tự ghi money audit theo format riêng.
- Service tự xác định shift đang mở nếu caller không truyền.
- Cash-out >= config `money.large_cash_out_threshold` (default 1,000,000 VND) → flag `large_cash_out`.
- Bank deposit hoàn cash → flag `bank_to_cash_refund`.
- Nhiều refund trong ca (ngưỡng config) → flag `refund_burst`.
- Ngoài ca mở → flag `outside_shift`.

### Page `/manager/cash-flow`

- Permission `cash-flow.view`.
- Filters: date, shift, employee, direction, type, method, warning.
- Metrics: total in, total out, net, warning count.
- Table drilldown tới invoice/order/supplier payment.
- Không cho sửa/xóa ledger từ UI; append-only.

## D. Coc bank va cash refund

### Deposit fields

Them:

- `reference nullable`
- `bank_verified boolean default false`
- `verified_by nullable FK users`
- `verified_at nullable datetime`
- `shift_id nullable FK shifts`

Rules:

- Cash deposit không cần reference/verification.
- Bank-transfer deposit bắt buộc `reference` + `bank_verified=true` ngay trong request tạo cọc.
- Server lưu verifier/time/shift, không nhận verifier từ client.
- Nếu thiếu reference hoặc chưa tick verified, request bị 422 và không tạo deposit. Deposit bank chỉ được tạo trực tiếp ở trạng thái `held` sau khi server ghi verifier/time/shift.
- Amount có configurable upper warning; vượt không chặn nhưng ledger flag.

Checkout vẫn cho bank deposit hoàn cash theo quyết định nghiệp vụ. Refund cash được ledger hóa với source method, reference và warning flags.

## E. Refund, cancellation va send-to-kitchen reduction

### Refund

- Route dùng `payments.refund`.
- Thu ngân role được cấp permission mặc định.
- Bắt buộc reason + audit + MoneyLedger `order_refund/out`.
- Giữ lock invoice/lines, refunded_qty bound và lot return hiện có.
- Refund hóa đơn lịch sử được phép (hậu kiểm, không chặn theo ca).

### Reduced items

Nếu payload `send-to-kitchen` có `reduced_items`:

- yêu cầu `orders.cancel`
- lock order + items
- mỗi `order_item_id` phải thuộc đúng `order_id`
- reject item/order paid hoặc cancelled
- validation qty không vượt active quantity

Dedicated cancel endpoints cũng dùng permission mới.

## F. Supplier partial payment allocation

Giữ `supplier_payments` làm payment header. Thêm `supplier_payment_allocations`:

- `supplier_payment_id FK cascade`
- `stock_voucher_id FK restrict/cascade theo history policy`
- `amount decimal(15,2)`
- unique pair payment-voucher

Outstanding mỗi voucher:

`voucher_total - SUM(allocations.amount)`

Flow transaction:

1. Validate allocations array.
2. Lock supplier + selected vouchers + allocation sums.
3. Reject voucher không thuộc supplier / không phải import.
4. Reject allocation <=0 hoặc > outstanding.
5. Tổng allocations phải đúng bằng SupplierPayment.amount.
6. Insert header + allocations.
7. Update `is_paid=true` chỉ khi outstanding = 0; partial giữ false.
8. Record MoneyLedger `supplier_payment/out` với meta allocations.

## G. Server-side checkout lock

Redis key `pos:checkout-lock:{tableId}`:

- value: user_id, user_name, acquired_at
- TTL configurable (default 90 seconds)
- acquire endpoint: permission `pos.create`, atomic add/lock; trả current owner khi conflict
- release endpoint: chỉ owner hoặc root/admin
- heartbeat/renew trong lúc PaymentDrawer mở
- server broadcasts lock acquired/released/expired

Client whisper không còn nguồn có thẩm quyền. DB row locks trong checkout giữ nguyên làm lớp cuối.

## H. CSV formula injection

Service `SpreadsheetCellSanitizer::sanitize(mixed $value): string|int|float`:

- String bắt đầu `=`, `+`, `-`, `@`, tab, CR → prefix `'`.
- Áp dụng cho Product CSV export và report CSV export.
- XLSX ghi explicit string cell khi input là user-controlled string.

Tests payload:

- `=HYPERLINK("https://attacker", "x")`
- `@SUM(1+1)`
- `-1+1`
- tab/CR prefix

## I. Secret cleanup

- Xóa credential plaintext khỏi `.agents/AGENTS.md`, thay bằng placeholders.
- Không copy credentials vào README/spec/test fixtures.
- Operational runbook: rotate password, revoke sessions, inspect login history.

## Testing

- Non-root self-assign admin → 403.
- Non-root self-escalate role → 403.
- Root admin đổi email vẫn giữ root flag.
- Guest/kitchen thiếu permission cash-out → 403; cashier role → allowed.
- Bank deposit thiếu reference hoặc verify → 422; verified deposit → held.
- Bank deposit cash refund → ledger `bank_to_cash_refund`.
- Refund >=1,000,000 → ledger warning.
- Reduced item khác order hoặc thiếu cancel permission → 403/422.
- Partial supplier allocations đúng outstanding; amount=0.01 không thể clear voucher lớn.
- Redis checkout lock owner/conflict/release/TTL.
- CSV formula sanitizer.

## Deployment

- Run migrations + seed new permissions/root flag.
- Backfill existing seeded admin: match `ADMIN_EMAIL`, set `is_root_admin=true` exactly one row; abort if ambiguous.
- Configure `MONEY_LARGE_CASH_OUT_THRESHOLD=1000000`, lock TTL.
- Rotate plaintext credential before deploy.
