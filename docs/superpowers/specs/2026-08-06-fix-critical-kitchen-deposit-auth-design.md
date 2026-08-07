# Design — Sửa Critical (kitchen un-pay) + 4 Important + Auth

**Date:** 2026-08-06
**Branch:** main (head bc98ef0)

## Mục tiêu

Sửa 1 Critical (kitchen hoàn tất có thể un-pay đơn paid → double invoice) + 4 Important (refund cọc dư không persist, TableController hủy đặt rơi cọc, GET mutate xóa nhầm bàn, update thiếu mimes ảnh) + Auth (session regenerate sau Google/OTP login, throttle OTP profile). Không thay đổi shape frontend báo cáo.

## Các lỗi đã xác minh

| # | Mức | Vấn đề | Vị trí |
|---|---|---|---|
| C | Critical | Kitchen completion update order status='completed' bất chấp paid/cancelled → checkout lần 2 | `KitchenController.php:94-107` (completeOrder), `:198-202` (completeItems) |
| I1 | Important | Refund cọc dư (deposit > total) không persist → expectedCash phóng đại | `CheckoutService.php:170-184` |
| I2 | Important | TableController::update hủy reserved order, không xử lý cọc held | `TableController.php:185-188` |
| I3 | Important | TableController::index GET auto-seed + delete "Mang đi %" (xóa bàn thật nhầm) | `TableController.php:17-25` |
| I4 | Important | ProductController::update thiếu `image|mimes` (store có) | `ProductController.php:106` |
| I5a | Auth | Google login không `session()->regenerate()` | `GoogleAuthController.php:58` |
| I5b | Auth | OTP signup login không `session()->regenerate()` | `OtpController.php:75` |
| I5c | Auth | `/profile/verify-email-otp` + `/profile/verify-password-otp` không throttle | `routes/web.php:73,76` |

## Phần 1 — CRITICAL: Kitchen không un-pay / resurrect đơn paid/cancelled

**Sửa `app/Http/Controllers/Staff/KitchenController.php`:**

1. **`completeOrder`** — thay khối `if ($order->status === 'cancelled')` (`:94-98`) bằng:
```php
        if (in_array($order->status, ['paid', 'cancelled'], true)) {
            return $request->wantsJson()
                ? response()->json(['error' => 'Đơn đã thanh toán hoặc đã hủy.'], 422)
                : back()->withErrors(['error' => 'Đơn đã thanh toán hoặc đã hủy.']);
        }
```
   → đơn paid/cancelled không bị đảo status.

2. **`completeItems`** — đổi khối `$remainingActive === 0` (`:198-202`):
```php
                if ($remainingActive === 0 && ! in_array($order->fresh()->status, ['paid', 'cancelled'], true)) {
                    $order->update([
                        'status' => 'completed',
                        'has_additional_items' => false,
                    ]);
                }
```

**Bất biến:** món item vẫn mark `completed` bình thường (bếp xong món). Chỉ đơn paid/cancelled không đảo status → không checkout lần 2. Deduct ingredients vẫn thực hiện.

## Phần 2 — I1: Persist refund cọc dư (payment row âm)

**Vấn đề:** CheckoutService apply held deposit full amount kể cả khi `depositTotal > total` → phần thừa không ghi → expectedCash đếm lúc nhận nhưng không trừ refund.

**Sửa `app/Services/Checkout/CheckoutService.php`** — thêm refund row **ngay sau loop payments/deposits** (sau `$d->update([...])` của `:170-184`, cùng transaction, khi `$depositTotal` và `$total` đã có sẵn và `$invoice` đã tồn tại):

```php
            // Hoàn tiền cọc thừa: cọc > total → ghi payment row âm để ledger trừ đúng
            if ($depositTotal > $total) {
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => 'cash',
                    'amount' => -(round($depositTotal - $total, 2)),
                    'note' => 'Hoàn tiền cọc thừa',
                    'received_by' => $userId,
                ]);
            }
```

**Căn cứ expectedCash:** `ShiftService::expectedCash` (`:18-37`) cộng `payments.amount` — row refund âm (method cash, note 'Hoàn tiền cọc thừa' — KHÔNG match `not like 'Tiền cọc%'` vì bắt đầu 'Hoàn tiền') → tự trừ đúng. Null-safe note filter vẫn để row này qua (note non-null, không match pattern exempt).

**Audit log:** thêm meta `'deposit_refund' => max(0.0, $depositTotal - $total)` vào checkout log nếu > 0 (CheckoutService:227-232 — thêm field vào meta hiện có).

**Lưu ý:** chỉ khi `$depositTotal > $total` (cọc thực thừa). Payment row âm không ảnh hưởng invoice total (giữ nguyên).

## Phần 3 — I2: TableController::update giải quyết cọc held khi hủy đặt bàn

**Sửa `app/Http/Controllers/Manager/TableController.php`** khối `else` (`:185-188`):

```php
                if ($reservedOrder) {
                    // Giải phóng cọc đang giữ: hoàn tiền (refunded) trước khi hủy đặt bàn
                    foreach ($reservedOrder->deposits()->where('status', 'held')->get() as $deposit) {
                        $deposit->update([
                            'status' => 'refunded',
                            'resolved_at' => now(),
                            'resolved_by_user_id' => $request->user()?->id,
                        ]);
                    }
                    $reservedOrder->update(['status' => 'cancelled']);
                }
```

**Căn cứ:** ShiftService trừ cọc refunded theo `resolved_at` → expectedCash giảm đúng. `deposits.resolved_by_user_id` cần trong fillable (đã có — cancelReservation dùng).

**Bất biến:** không cọc held → hành vi hiện tại.

## Phần 4 — I3: TableController::index bỏ GET mutate

**Sửa `app/Http/Controllers/Manager/TableController.php`** — XÓA khối auto-seed + delete (`:16-25`):

```php
        // Auto-seed takeaway virtual table if not present
        if (! Table::where('table_number', 'Mang đi')->exists()) {
            Table::create([...]);
        }
        Table::where('table_number', 'like', 'Mang đi %')->delete();
```

**Lý do:** (1) GET không nên mutate. (2) `where('table_number', 'like', 'Mang đi %')->delete()` xóa bất kỳ bàn nào có tiền tố "Mang đi " — có thể xóa bàn do người đặt mang tên tương tự. (3) POS đã có virtual "Mang đi" (id=0, table_id IS NULL) — không cần bàn thật.

**Xử lý bàn "Mang đi" thật đã tồn tại trong DB:** giữ nguyên (không xóa dữ liệu); chỉ bỏ logic tự seed từ lần sau.

**Bất biến:** `index()` chỉ còn đọc + filter + render (read-only).

## Phần 5 — I4: ProductController::update validate ảnh

**Sửa `app/Http/Controllers/Manager/ProductController.php:106`:**
```php
        'image' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
```
(Trước: `nullable` — thiếu mimes/max so với `store` `:78`.)

## Phần 6 — I5 + Auth: session regenerate + OTP throttle

**Sửa `app/Http/Controllers/Auth/GoogleAuthController.php`** — sau `Auth::login($user, true)` (`:58`):
```php
        Auth::login($user, true);
        $request->session()->regenerate();
        return redirect('/');
```
(Cần `RedirectResponse` — giữ. `session()->regenerate` trước redirect.)

**Sửa `app/Http/Controllers/Auth/OtpController.php`** — tại chỗ `if ($type === 'signup')` sau `Auth::login($user)` (`:75`):
```php
            if ($user) {
                $user->update(['email_verified_at' => now()]);
                Auth::login($user);
                $request->session()->regenerate();
            }
```

**Sửa `routes/web.php:73,76`** — thêm throttle:
```php
Route::post('/profile/verify-email-otp', [ProfileController::class, 'verifyEmailOtp'])->middleware(['throttle:10,1']);
Route::post('/profile/verify-password-otp', [ProfileController::class, 'verifyPasswordOtp'])->middleware(['throttle:10,1']);
```

**Bất biến:** không đổi flow login/OTP; chỉ thêm session regenerate (chống fixation) + throttle (chống brute-force OTP profile).

## Phần 7 — Kiểm thử

- **C:** test KitchenController — bếp xong đơn đã paid (bypass) → KHÔNG đảo về completed, không double checkout; bếp xong đơn cancelled → không resurrect.
- **I1:** test CheckoutService với deposit held > total → payment refund row amount âm khớp; expectedCash giảm đúng.
- **I2:** test TableController::update reserved → occupied với cọc held → cọc refunded, đơn cancelled.
- **I3:** test TableController::index → không tạo bàn, không xóa bàn ("Mang đi %" không bị delete); GET read-only.
- **I4:** test ProductController::update với file .txt như image → 422.
- **I5:** test Google/OTP login — session regenerate (mock? hoặc assert session id thay đổi); test profile OTP route throttle (request lần n>10 → 429).

## Ngoài phạm vi

- Không đụng cấu trúc nội bộ KitchenController (deduct/restore) — chỉ guard status.
- Không thay đổi logic apply deposit (giữ deposited applied full, refund riêng).
- Không đổi `change_amount` `e_wallet` mismatch checkout vs bulk (follow-up).
- Không đụng resolvePromotion dead, duplicate helper, status constants (structural cleanup riêng).
