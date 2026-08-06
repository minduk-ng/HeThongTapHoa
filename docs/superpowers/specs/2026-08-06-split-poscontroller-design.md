# Design — Tách POSController thành 4 controller + dọn dead serving

**Date:** 2026-08-06
**Branch:** feat/payment-core-restructure (head 01a8fba, merged về main + pushed)

## Mục tiêu

Tổ chức lại `app/Http/Controllers/Staff/POSController.php` (1473 dòng, 21 methods, 5 lĩnh vực) thành các controller nhỏ theo trách nhiệm, và dọn dead code serving còn sót từ trước khi tách `ServingDisplay`.

Không thay đổi hành vi. Mọi URL endpoint giữ nguyên — frontend không cần sửa.

## Sự thật đã xác minh

- `POSController` 21 methods phủ: POS layout, reservation, order/kitchen, payment, table operations.
- `POSController::servingQueue` (JSON `/pos/serving-queue`) — **không ai gọi**; `ServingDisplay.tsx` dùng prop Inertia từ `ServingController::index`.
- `POSServingTab.tsx` — component chết, không được import ở đâu; di tích từ khi tab serving còn nằm trong màn POS trước khi tách `ServingDisplay.tsx`.
- `POSController::markServed` (yếu: thiếu idempotency/audit/broadcast) vs `ServingController::markServed` (đầy đủ).
- `orderLines`, `discountFor` — dead code (không call site trong controller).
- `resolvePromotion` — không call site trong controller (validatePromotion gọi engine trực tiếp), nhưng `POSPromotionRejectReasonTest` reflect qua `POSController::class`.
- `safeDispatch` — 17 call site khắp cả 4 nhóm; `generateOrderCode` — dùng ở `reserve` và `sendToKitchen`.
- `ServingQueueTest.php` (5 test) gọi `/pos/serving-queue` + `/pos/mark-served`.

## Phần 1 — Tách 4 controller

| Controller | Methods | Routes giữ |
|---|---|---|
| `Staff\POSController` (giữ, gọn) | `index`, `sendToKitchen`, `cancelOrder` | `/pos`, `/pos/send-to-kitchen`, `/pos/cancel-order` |
| `Staff\ReservationController` (mới) | `reserve`, `checkInReservation`, `cancelReservation`, `deposit` | `/pos/reserve`, `/pos/reservation/check-in`, `/pos/reservation/cancel`, `/pos/deposit` |
| `Staff\TableOperationController` (mới) | `transferTable`, `mergeTables`, `unmergeTable` | `/pos/transfer-table`, `/pos/merge-tables`, `/pos/unmerge-table` |
| `Staff\PaymentController` (mới) | `validatePromotion`, `checkout`, `bulkCheckout` | `/pos/validate-promotion`, `/pos/checkout`, `/pos/bulk-checkout` |

URL giữ nguyên → middleware permission (`pos.create`, `pos.view`, `pos.cancel_item`) và frontend không đổi.

## Phần 2 — Helpers dùng chung (trait)

- `app/Http/Controllers/Staff/Concerns/DispatchesSafely.php` — `safeDispatch`, public, dùng bởi cả 4 controller.
- `app/Http/Controllers/Staff/Concerns/GeneratesOrderCode.php` — `generateOrderCode`, public, dùng bởi ReservationController + POSController.

Private helper không dùng chung:
- `orderLines`, `discountFor` — **xóa hẳn** (dead code).
- `resolvePromotion` — **chuyển sang PaymentController** (nơi validatePromotion sống) và cập nhật `POSPromotionRejectReasonTest` trỏ `PaymentController::class`.

## Phần 3 — Dọn dead serving

| Mục | Hành động |
|---|---|
| `POSController::servingQueue` | Xóa method + route `/pos/serving-queue` |
| `POSController::markServed` | Xóa method + route `/pos/mark-served` |
| `resources/js/pages/staff/pos/components/POSServingTab.tsx` | Xóa file |
| `ServingController` | Giữ nguyên — nguồn duy nhất cho serving |

## Phần 4 — Files

**Tạo mới:**
- `app/Http/Controllers/Staff/ReservationController.php`
- `app/Http/Controllers/Staff/TableOperationController.php`
- `app/Http/Controllers/Staff/PaymentController.php`
- `app/Http/Controllers/Staff/Concerns/DispatchesSafely.php`
- `app/Http/Controllers/Staff/Concerns/GeneratesOrderCode.php`

**Sửa:**
- `app/Http/Controllers/Staff/POSController.php` — giữ 3 methods + dùng 2 trait
- `routes/web.php` — trỏ class mới cho route đã chuyển
- `tests/Feature/POSPromotionRejectReasonTest.php` — `POSController::class` → `PaymentController::class`
- `tests/Feature/ServingQueueTest.php` — endpoint `/pos/*` → `/staff/serving/mark-served`

**Xóa:**
- `resources/js/pages/staff/pos/components/POSServingTab.tsx`

## Phần 5 — Kiểm thử

- `ServingQueueTest` (5 test) — chuyển sang ServingController:
  - 3 test `markServed` (đánh dấu completed, không lặp, validation): đổi endpoint sang `/staff/serving/mark-served` — `ServingController::markServed` hỗ trợ đủ (idempotency key nullable, trả `served_count`).
  - 2 test lọc hàng chờ (chỉ món completed/today, nhãn "Mang về"): `ServingController::index` trả queue qua **prop Inertia** (không phải JSON), nên đổi sang `$this->get('/staff/serving')->assertInertia(fn ($page) => $page->component('staff/serving/ServingDisplay')->has('servingQueue'))` và assert nội dung prop.
- `POSPromotionRejectReasonTest`: đổi class reflect sang `PaymentController::class`.
- Regression: `php artisan test` — kỳ vọng 230/230 giữ nguyên.
- Pint dọn import sau tách.
- Frontend: `npm run types:check` + `npm run build` — xóa POSServingTab (không được import) không vỡ build.

## Ngoài phạm vi

- Không đụng `ShiftController`, `KitchenController`, `ServingController`, `DashboardController`, reports controllers.
- Không tách thêm service khỏi controller (CheckoutService đã có; các method còn lại giữ logic hiện tại).
- Không đổi permission/route URL.
