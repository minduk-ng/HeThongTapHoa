# Design — Sửa 6 lỗi audit controllers + thống kê cọc held

**Date:** 2026-08-06
**Branch:** main (head 079bbd7)

## Mục tiêu

Sửa 6 lỗi từ audit toàn diện controllers (2 Critical + 4 Important) + bổ sung thống kê cọc held trong báo cáo thanh toán. Không đổi shape frontend ngoài việc THÊM metric `held_deposit_total` vào PaymentsReport.

## Các lỗi đã xác minh

| # | Mức | Vấn đề | Vị trí |
|---|---|---|---|
| C1 | Critical | expectedCash sai với split/mixed + bỏ sót cọc tiền mặt | `ShiftController.php:118-126` |
| C2 | Critical | Đơn paid/cancelled mở lại qua sendToKitchen → double invoice | `POSController.php:199,247-267` |
| I3 | Important | Permission `\|` OR hỏng → staff không hủy được đơn/món | `CheckPermission.php:17`, `routes/web.php:172,182` |
| I4 | Important | DashboardService KDS status cũ (cooking/ready/served không tồn tại) | `DashboardService.php:92-95` |
| I5 | Important | SalesInvoiceReport gross/discount từ orders child thay vì invoice snapshot | `SalesInvoiceReportController.php:30-31` |
| I6 | Important | orders.subtotal/vat_amount không refresh khi checkout → số lệch | `CheckoutService.php:219-225` |
| P5 | New | Cọc held (chưa checkout) không xuất hiện trong báo cáo thanh toán | `PaymentsReportController.php`, `PaymentsReport.tsx` |

## Phần 1 — C1: ShiftController::expectedCash đúng sau Payment Core

**Tạo mới:** `App\Services\Manager\ShiftService` với `expectedCash(Shift $shift, CarbonInterface $until): float`.

```php
public function expectedCash(Shift $shift, CarbonInterface $until): float
{
    // Tiền mặt từ checkout: payments method=cash, loại trừ row cọc applied
    // (cọc đã đếm lúc nhận, không đếm lại khi applied)
    $checkoutCash = Payment::query()
        ->join('invoices', 'invoices.id', '=', 'payments.invoice_id')
        ->where('payments.method', 'cash')
        ->where('payments.note', 'not like', 'Tiền cọc%')
        ->whereBetween('invoices.issued_at', [$shift->opened_at, $until])
        ->sum('payments.amount');

    // Cọc tiền mặt nhận trong ca (kể cả chưa applied)
    $depositCash = Deposit::query()
        ->where('method', 'cash')
        ->whereBetween('created_at', [$shift->opened_at, $until])
        ->sum('amount');

    return round((float) $shift->opening_cash + (float) $checkoutCash + (float) $depositCash, 2);
}
```

**Sửa `ShiftController`:** private method `expectedCash` (hiện `:118-126`) thay bằng delegate:
```php
private function expectedCash(Shift $shift, CarbonInterface $until): float
{
    return (new \App\Services\Manager\ShiftService)->expectedCash($shift, $until);
}
```
Hoặc tốt hơn: inject service vào constructor và gọi trực tiếp. `current()` (`:72`) và `close()` (`:90`) giữ nguyên lời gọi.

**Lưu ý:** payment row cọc applied có `note = 'Tiền cọc đơn X'` (CheckoutService:163) — `not like 'Tiền cọc%'` loại đúng. Payment row checkout thật từ `$paymentRows` thường note null — nếu client gửi note khác không chứa "Tiền cọc" vẫn đếm.

## Phần 2 — C2: sendToKitchen guard đơn paid/cancelled

**Sửa `app/Http/Controllers/Staff/POSController.php`:**

1. **Reduction branch** (hiện `:199`):
```php
if (! $orderItem || in_array($orderItem->order?->status, ['paid', 'cancelled', 'completed'], true)) {
    continue;
}
```

2. **Item-creation branch** (sau `findOrFail` ở `:248`):
```php
$createdOrder = Order::lockForUpdate()->findOrFail($validated['order_id']);
if (in_array($createdOrder->status, ['paid', 'cancelled'], true)) {
    throw new \Exception('Đơn đã thanh toán hoặc đã hủy, không thể gửi bếp.', 422);
}
$wasDraft = $createdOrder->status === 'draft';
```

**Bất biến:** `paid`/`cancelled` bị chặn ở cả 2 nhánh. `completed` (bếp xong món) vẫn cho gọi thêm (nghiệp vụ bình thường). `draft` reset vẫn ok. `pending/processing` thêm món vẫn ok.

## Phần 3 — I3: CheckPermission hỗ trợ `|` OR

**Sửa `app/Http/Middleware/CheckPermission.php`:**
```php
public function handle(Request $request, Closure $next, string $permission): Response
{
    if (! $request->user()) {
        abort(403, 'Unauthorized');
    }

    foreach (explode('|', $permission) as $perm) {
        if ($request->user()->hasPermission($perm)) {
            return $next($request);
        }
    }

    abort(403, 'You do not have permission to access this resource.');
}
```

**Hành vi:** permission chứa `|` → bất kỳ cái nào match là pass (OR). Permission không `|` → giữ nguyên kiểm tra đơn. Không phá các middleware/permission khác (`pos.view`, `reports.view`, `serving.update`, ...).

## Phần 4 — I4 + I5 + I6

**I4 — `DashboardService.php`:**
- `:93` `['pending', 'cooking']` → `['pending', 'processing']`
- `:95` `['ready', 'served']` → `['completed']`

**I5 — `SalesInvoiceReportController.php`:**
- **GIỮ** `withCount('orders')` — frontend `SalesInvoiceReport.tsx` dùng `orders_count` (column + renderCell).
- Bỏ `->with(['orders' => fn ($q) => $q->select('invoice_id','subtotal','discount_amount')])` khỏi query (chỉ dùng cho gross/discount — thay bằng invoice snapshot).
- `gross_amount` = `(float) $invoice->subtotal_amount`
- `discount_amount` = `(float) $invoice->discount_amount`
- Không thay đổi gì ở frontend (shape giữ nguyên: orders_count, gross_amount, discount_amount).

**I6 — `CheckoutService.php` loop update (`:206-225`):**
Tính `$orderVat` và ghi thêm 2 field:
```php
$orderVat = (float) $order->items()->where('status', '!=', 'cancelled')->with('menuItem')->get()
    ->sum(fn ($item) => OrderTotals::vatInPrice((float) $item->subtotal, (float) ($item->menuItem?->vat_rate ?? 0)));
```
Ghi thêm vào `$order->update([...])`: `'subtotal' => $orderSubtotal, 'vat_amount' => $orderVat,`.

**Bất biến sau fix:** đơn paid có `subtotal − discount = total`, `vat_amount` khớp công thức VAT-trong-giá. Không ảnh hưởng tiền (invoice vẫn là nguồn đúng).

## Phần 5 — PaymentsReport: metric cọc held

**Vấn đề:** `cash_total`/`bank_total` đọc từ `payments` rows của invoices → chỉ gồm tiền đã thanh toán (kể cả cọc applied). Cọc HELD (chưa checkout, chưa có invoice) là tiền thật đã thu nhưng không xuất hiện.

**Sửa `PaymentsReportController.php`** — thêm metric:
```php
use App\Models\Deposit;
// ...
$heldDeposits = Deposit::query()
    ->where('status', 'held')
    ->whereBetween('created_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
    ->get();

$heldCash = (float) $heldDeposits->where('method', 'cash')->sum('amount');
$heldBank = (float) $heldDeposits->where('method', 'bank_transfer')->sum('amount');
$heldTotal = (float) $heldDeposits->sum('amount');
```
Thêm vào `metrics`:
```php
'held_deposit_total' => $heldTotal,
'held_deposit_cash' => $heldCash,
'held_deposit_bank' => $heldBank,
'held_deposit_count' => $heldDeposits->count(),
```

**Sửa `PaymentsReport.tsx`:**
- `Metrics` interface thêm `held_deposit_total: number`.
- Thêm 1 metric card "Cọc đang giữ" (icon Banknote, `formatVND(metrics.held_deposit_total)`).
- **KHÔNG** trộn `held_deposit_total` vào `cash_total`/`bank_total` — cọc chưa phải doanh thu, tách riêng để báo cáo trung thực. Donut giữ nguyên (chỉ doanh thu đã thanh toán).

## Phần 6 — Kiểm thử

- **C1**: thêm test vào `tests/Feature/ShiftControllerTest.php`:
  - Split payment (cash + bank) trong ca → expectedCash = phần cash đúng (không đếm phần bank).
  - Cọc cash tạo trong ca → expectedCash gồm cọc.
  - Cọc applied (payment row 'Tiền cọc') → KHÔNG đếm 2 lần.
- **C2**: thêm test sendToKitchen vào order `paid` → response 422, order status không đổi, không tạo order mới. Và reduction trên order `paid` → bỏ qua.
- **I3**: thêm test user staff có `pos.cancel_item` (không có `kitchen.cancel_item`) → POST cancel-item pass (hiện 403). Và user không có cả 2 → vẫn 403.
- **I4**: thêm test DashboardService KDS đếm item `processing` + `completed` (status thật).
- **I5**: thêm test SalesInvoiceReport `gross_amount` từ invoice.subtotal_amount (seed invoice + invoice_line, assert).
- **I6**: thêm test checkout đơn đã reduce-items → `orders.subtotal − discount == total` sau paid.
- **P5**: thêm test PaymentsReport `held_deposit_total` = tổng cọc held tạo trong kỳ; cọc không trong kỳ không tính.
- **Regression**: full suite giữ nguyên + test mới.

## Ngoài phạm vi

- Không sửa các vấn đề cấu trúc khác từ audit (KitchenController duplicate safeDispatch, TableController generateOrderCode, resolvePromotion dead, TableGroupResolver, ProductController image-delete, magic status constants) — việc riêng.
- Không sửa Auth security (Google login session regeneration, OTP attempt counter) — việc riêng.
- Không đổi `cash_total`/`bank_total` hiện có của PaymentsReport (vẫn là tiền đã thanh toán); chỉ THÊM metric cọc held tách riêng.
