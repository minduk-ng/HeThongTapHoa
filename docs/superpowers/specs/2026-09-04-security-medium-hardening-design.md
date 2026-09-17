# Design: Security Medium + Low Hardening

Ngay: 2026-09-04
Trang thai: Approved

## Muc tieu

Khắc phục 9 Medium + 4 Low/hardening còn lại sau Plan 1:

- authorization đúng cho private WebSocket
- OTP brute-force lockout
- session revocation khi thay credential
- promotion free product đúng 1 unit
- cash overpayment không làm lệch shift
- durable idempotency cho money mutations
- reservation locking
- report/import DoS limits
- production-safe defaults, safe errors, dependency/CDN hardening

## A. WebSocket authorization

Channel callbacks:

- `pos-channel`: `pos.view`
- `kitchen-channel`: `kitchen.view`
- `inventory-channel`: `ingredients.view` hoặc `inventory.history.view`
- `pos-room`: `pos.view` hoặc `pos.create`

Dùng cùng `User::hasPermission()`/authorization helper như HTTP. Guest đã login nhưng không permission nhận 403.

Whispers chỉ advisory; checkout lock thật đã chuyển server ở Plan 1.

## B. OTP lockout va purpose isolation

### Schema

- `otp_codes.attempts unsignedTinyInteger default 0`
- `otp_codes.locked_at nullable timestamp`
- composite index `(email,type,expires_at)`
- DB lưu hash OTP (`Hash::make`) thay raw code

### Verify

- Transaction/atomic increment attempts mỗi lần sai.
- Lần sai thứ 5 khóa/vô hiệu code; yêu cầu resend.
- Response chung: "Mã không hợp lệ hoặc đã hết hạn".
- Rate limit đồng thời IP + principal key `otp:{purpose}:{email-or-user}:{sessionId}`.
- Forgot password chỉ xóa OTP `type=reset_password`, không xóa purpose khác.

## C. Session revocation

Sau reset/change password hoặc đổi email:

- rotate `remember_token`
- delete mọi session DB của user trừ session hiện tại
- regenerate session hiện tại
- audit security action

Không logout thiết bị đang thực hiện.

## D. Free product quantity = 1

PromotionEngine output đổi sang:

`free_items: [{ menu_item_id, quantity: 1 }]`

- Chỉ giảm giá 1 unit mỗi lần promotion được áp dụng.
- Nếu item phân nhiều line/order bulk, chọn line theo thứ tự ổn định (order sequence + line id).
- Các quantity còn lại trả giá bình thường.
- Test qty=5 → discount đúng 1 × unit_price.

## E. Cash overpayment accounting

Invoice giữ `amount_received` và `change_amount`.

Payment cash ghi net collected:

`min(cash_received, payable_remaining)`

Không ghi gross amount_received vào cash ledger. Non-cash không vượt payable trừ split-payment server-normalized.

Test invoice 50k, received 100k → invoice change 50k, Payment cash 50k, expectedCash +50k.

## F. Durable idempotency

Bang `idempotency_records`:

- `key`, `action`, `user_id`, `resource_fingerprint`
- `status processing|succeeded|failed`
- `response_code`, `response_body`
- unique `(action,key)`
- timestamps

Áp dụng bắt buộc cho:

- checkout/bulk checkout
- deposit
- refund
- supplier payment
- cash movement

Flow:

- new → processing
- succeeded → replay response
- processing → 409
- failed → cho retry theo policy
- mark succeeded chỉ sau commit
- cleanup >30 ngày

Cache short TTL hiện tại giữ chống double-click phụ.

## G. Reservation locking

- `reserve`: lock table, check status, không tạo multiple active reservation.
- `checkInReservation`: lock order + table.
- `cancelReservation`: lock order + held deposits + table.
- Mọi transition chạy transaction.

## H. Report date and pagination limits

Reusable request/rule:

- start/end valid
- start <= end
- max range **90 ngày**

Áp dụng SalesInvoice, Cancelled, Reservations, Payments, InvoiceItems, Consumption, StockMovement.

Detail lists paginate; summaries aggregate SQL. Export cũng max 90 ngày.

## I. Product import hardening

- Chỉ CSV/MIME text-csv
- max 2MB
- max 5,000 data rows
- stream `fgetcsv`, không `file_get_contents`
- reject XLSX/binary
- preview normalized rows giới hạn + TTL/cache key; không session payload khổng lồ
- generic error response; detailed server log với correlation ID

## J. Production-safe defaults and error disclosure

`.env.example`:

- `APP_DEBUG=false`
- `LOG_LEVEL=warning`
- `SESSION_SECURE_COOKIE=true` note HTTPS; local override false
- QR/bank values dùng placeholders, không data thật-looking

Controllers không trả `$e->getMessage()` cho client. Response generic + correlation ID.

## K. Upload/CDN hardening

- filename sản phẩm = slug + ULID/UUID
- Sirv upload false → throw; DB không lưu URL khi upload fail
- thay asset cũ chỉ sau upload mới thành công
- logs: status/request ID/sanitized path, không full auth response
- tests upload collision và rollback

## L. Dependencies

PR/update riêng:

- upgrade league/commonmark patched version compatible constraints
- `npm audit fix` without `--force`
- review ExcelJS/uuid/postcss/browserslist/nanoid/brace-expansion
- full CI gate

## Testing

- Channel auth permission matrix.
- OTP attempts 1-4 allowed, 5 locks; purpose isolation.
- Password/email change revokes other sessions only.
- free product quantity 5 → 1 free.
- cash overpayment net payment.
- idempotency replay/processing/retry.
- concurrent reservation only one succeeds.
- date range 91 days → 422.
- import >2MB/>5000 rows/XLSX reject.
- upload failure does not persist URL.

## Deployment

- Run migrations, clear/config cache.
- Ensure production HTTPS and secure cookie.
- Upgrade dependencies in controlled commit with audit output.
