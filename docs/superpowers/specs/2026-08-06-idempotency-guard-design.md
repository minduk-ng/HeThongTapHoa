# Design — Chống double-click / double-submit toàn hệ thống

**Date:** 2026-08-06
**Branch:** main (head 439a0cd)

## Mục tiêu

Ngăn double-click / double-submit gây trùng lặp dữ liệu tiền trên mọi endpoint mutate của hệ thống POS. Root cause cụ thể: đặt cọc 100k double-click tạo 2 cọc = 200k, không thể giảm.

## Root cause đã xác minh

1. **Backend:** mọi endpoint mutate đều có guard `idempotency_key` nhưng **optional** (`if ($request->filled('idempotency_key'))`). Frontend gửi key cho: checkout, bulk-checkout, send-to-kitchen, kitchen/serving (commandQueue). Frontend **KHÔNG gửi** cho: deposit, reserve, check-in, cancel-reservation, transfer, merge, unmerge → backend không có phòng vệ nào cho các luồng này.
2. **Frontend:** nút dùng `disabled={submitting}` dựa trên state React (async) → double-click nhanh vượt qua trước khi re-render kịp đặt `submitting=true`. `TransferMergeModal` đã dùng `setSubmitting(true)` đồng bộ (đúng pattern) nhưng không gửi `idempotency_key`.

## Phần 1 — Backend: `App\Services\IdempotencyGuard`

Service duy nhất chống trùng lặp, tự hoạt động khi client không gửi key:

```php
<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class IdempotencyGuard
{
    /**
     * Chặn trùng lặp request trong cửa sổ ngắn.
     * Ưu tiên idempotency_key client gửi (TTL 30s); nếu thiếu, tự sinh fingerprint
     * từ dấu hiệu request (TTL 5s) để nuốt double-click, không chặn gửi lại cách nhau.
     */
    public static function isDuplicate(Request $request, string $action, array $fingerprint = []): bool
    {
        $clientKey = $request->input('idempotency_key');
        $key = $clientKey
            ? "idempotency:{$action}:{$clientKey}"
            : "idempotency:{$action}:" . md5(json_encode($fingerprint));

        return ! Cache::add($key, true, $clientKey ? 30 : 5);
    }
}
```

**Quy tắc tích hợp vào endpoint:** thay các khối `Cache::add("idempotency:...")` hiện có, gọi `IdempotencyGuard::isDuplicate($request, 'deposit', ['order_id' => ..., 'amount' => ..., 'method' => ...])` ở đầu handler, ngay sau validate. Nếu `true` → trả phản hồi success ngầm (giống hành vi hiện tại của `Cache::add` duplicate-suppression).

**Fingerprint theo từng endpoint (dấu hiệu định danh request):**
- deposit: `order_id`, `amount`, `method`
- reserve: `table_id`, `reservation_name`, `reservation_time`
- check-in: `order_id`
- cancel-reservation: `order_id`, `deposit_resolution`
- checkout: `order_id`, `amount_received`
- bulk-checkout: `order_ids` (sorted), `amount_received`
- send-to-kitchen: `order_id` (nếu có) hoặc `table_id` + tổng `items` qty
- transfer-table / merge-tables: `source_table_id`, `target_table_id`
- unmerge-table: `source_table_id`, `keep_table_id`
- cancel-order: `table_id`

**Endpoint nào tích hợp:** PaymentController (checkout, bulk-checkout), ReservationController (deposit, reserve, check-in, cancel-reservation), POSController (send-to-kitchen, cancel-order), TableOperationController (transfer, merge, unmerge). KitchenController + ServingController **giữ nguyên** — commandQueue đã gửi `idempotency_key = command id` (guard hoạt động).

**Cụ thể deposit (bug hiện tại):** `ReservationController::deposit` hiện có guard `Cache::add("idempotency:deposit:{$key}")` bên trong `if ($request->filled('idempotency_key'))` — thay bằng `IdempotencyGuard::isDuplicate($request, 'deposit', [...])` để auto-guard khi thiếu key.

## Phần 2 — Frontend: `resources/js/hooks/useSubmitGuard.ts`

Hook dùng chung — guard đồng bộ (ref-based, không phụ thuộc re-render):

```ts
import { useCallback, useRef, useState } from 'react';

export function useSubmitGuard() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const lockRef = useRef(false);

    const guard = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
        if (lockRef.current) return undefined;
        lockRef.current = true;
        setIsSubmitting(true);
        try {
            return await fn();
        } finally {
            lockRef.current = false;
            setIsSubmitting(false);
        }
    }, []);

    return { isSubmitting, guard };
}
```

**Cách dùng ở nút submit:**
```ts
const { isSubmitting, guard } = useSubmitGuard();
// nút: disabled={isSubmitting || <điều kiện khác>}
// handler: onClick={() => guard(() => onConfirmDeposit(amount, method))}
```

**Áp dụng cho:**
- `PaymentDrawer.tsx` — 3 nút footer: payment (In Print/No Print), deposit, reservation.
- `POSCartPanel.tsx` — nút gửi bếp / thanh toán.
- `TransferMergeModal.tsx` — thay `setSubmitting` thủ công bằng `useSubmitGuard` (giữ hành vi, có thêm `idempotency_key` ở Phần 3).
- `ReservationFormDrawer.tsx` — nút hoàn tất đặt bàn.

## Phần 3 — Frontend: thêm `idempotency_key` cho các luồng thiếu

- `usePOSReservation.ts` — `submitDeposit` (`:225`): thêm `idempotency_key` vào body (pattern `pos_deposit_{orderId}_{Date.now()}_{rand}`). Đồng thời `submitReservation` (`:107`), `checkInReservation` (`:147`), `cancelReservation` (`:184`) cũng thêm key.
- `TransferMergeModal.tsx` — 3 router.post (transfer/merge/unmerge) thêm `idempotency_key` vào data.
- `usePOSCheckout.ts` — **giữ nguyên** (đã gửi key `pos_pay_`, `pos_bulk_`, `pos_send_`).

## Phần 4 — Bất biến

- Không đổi URL/middleware/response shape — client cũ vẫn hoạt động (backend auto-guard hoạt động cả khi thiếu key).
- `IdempotencyGuard` là nguồn duy nhất chống trùng backend; bỏ các khối `Cache::add("idempotency:...")` trùng lặp trong controller.
- `useSubmitGuard` là nguồn duy nhất guard frontend; thay pattern `setSubmitting` thủ công ở TransferMergeModal.
- Không đụng commandQueue/kitchen/serving (đã có guard qua command id).

## Phần 4b — PaymentDrawer tự đóng sau thành công (cả 3 mode)

**Hiện trạng:**
- Payment **có in**: đóng sau thành công + mở receipt modal (`usePOSCheckout.ts:311-344`) ✓
- Payment **không in**: đóng **ngay trước fetch** (`usePOSCheckout.ts:288-290`) — đóng cả khi thất bại ✗
- Deposit: đóng trong onSuccess của POSManager (`POSManager.tsx:436-441`) — sau thành công ✓
- Reservation: đóng trong onSuccess (`POSManager.tsx:458-464`) — sau thành công ✓

**Yêu cầu:** PaymentDrawer tự đóng sau khi tương tác **thành công** ở cả 3 mode (thanh toán không in, đặt cọc, đặt bàn).

**Sửa `usePOSCheckout.ts` `handleConfirmPayment`:**
- **Bỏ** khối `if (!shouldPrint) { togglePaymentDrawer(false); }` trước fetch (dòng 288-290).
- Trong `then` thành công (`response.ok && data.success`), gọi `togglePaymentDrawer(false)` **bất kể shouldPrint** — đặt trước khi mở receipt modal (nhánh print vẫn mở modal sau khi đóng).
- Thất bại / lỗi → **không đóng** drawer; hiển thị alert như hiện tại (người dùng còn ở lại để sửa).

Deposit + Reservation giữ nguyên (đã đóng sau thành công qua onSuccess).

## Phần 5 — Kiểm thử

- **Backend:** test mới `tests/Feature/IdempotencyGuardTest.php`:
  - Gửi 2 request deposit cùng fingerprint (cùng order_id/amount/method) trong 5s → chỉ 1 cọc được tạo, request 2 trả success ngầm không tạo cọc mới.
  - Gửi 2 request deposit cách nhau (fingerprint khác, vd amount khác) → tạo được 2 cọc.
  - Endpoint có `idempotency_key` client gửi → key thắng (TTL 30s).
- **Regression:** toàn bộ suite POS hiện có (deposit, checkout, reservation, table ops) vẫn pass.
- **Frontend:** `npm run types:check` + `npm run build` pass.
- **Frontend (Phần 4b):** payment không in — drawer không đóng khi thất bại, đóng sau thành công; verify thủ công qua luồng POS (không có test React tự động cho drawer hiện tại).

## Ngoài phạm vi

- Không đụng KitchenController/ServingController (đã có guard qua command id).
- Không đổi luồng checkout hiện có (đã gửi key) — chỉ thêm auto-guard backend.
- Không đổi luồng deposit/reservation đóng drawer (đã đóng sau thành công).
