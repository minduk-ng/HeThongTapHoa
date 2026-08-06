# Chống double-click / double-submit toàn hệ thống — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ngăn double-click / double-submit gây trùng lặp dữ liệu tiền trên mọi endpoint mutate của hệ thống POS (bug: đặt cọc 100k double-click thành 200k).

**Architecture:** 2 lớp phòng vệ. Backend: `App\Services\IdempotencyGuard` — chặn trùng request bằng key client gửi (TTL 30s) hoặc tự sinh fingerprint từ dấu hiệu request khi thiếu key (TTL 5s). Frontend: `resources/js/hooks/useSubmitGuard.ts` — guard đồng bộ ref-based chặn re-entry ngay lập tức, không phụ thuộc re-render. Kèm theo: thêm `idempotency_key` vào các luồng frontend thiếu, và PaymentDrawer tự đóng sau thành công (cả 3 mode).

**Tech Stack:** Laravel 11, PHP, Pest, React/Inertia, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-06-idempotency-guard-design.md`

## Global Constraints

- PowerShell Windows: KHÔNG dùng `&&`; chạy `php artisan test ...` / `npm run ...` như lệnh đơn.
- `IdempotencyGuard::isDuplicate(Request $request, string $action, array $fingerprint = []): bool` — key client (nếu có) TTL 30s; fingerprint server-side TTL 5s.
- KHÔNG đổi URL/middleware/response shape — client cũ vẫn hoạt động (auto-guard hoạt động khi thiếu key).
- `useSubmitGuard` là nguồn duy nhất guard frontend; thay pattern `setSubmitting` thủ công ở TransferMergeModal.
- KHÔNG đụng KitchenController/ServingController/commandQueue (đã có guard qua command id).
- Mọi task: chạy test/check phù hợp trước khi commit; full suite không phá.
- Test chạy: `php artisan test tests\Feature\<file>.php`

---

## File Structure

**Tạo mới:**
- `app/Services/IdempotencyGuard.php`
- `resources/js/hooks/useSubmitGuard.ts`
- `tests/Feature/IdempotencyGuardTest.php`

**Sửa:**
- `app/Http/Controllers/Staff/ReservationController.php` — deposit/reserve/check-in/cancel-reservation dùng IdempotencyGuard
- `app/Http/Controllers/Staff/PaymentController.php` — checkout/bulk-checkout dùng IdempotencyGuard
- `app/Http/Controllers/Staff/POSController.php` — send-to-kitchen dùng IdempotencyGuard
- `app/Http/Controllers/Staff/TableOperationController.php` — transfer/merge/unmerge thêm IdempotencyGuard
- `resources/js/pages/staff/pos/hooks/usePOSReservation.ts` — thêm idempotency_key vào 4 hàm
- `resources/js/pages/staff/pos/hooks/usePOSCheckout.ts` — bỏ đóng drawer sớm, đóng sau success
- `resources/js/pages/staff/pos/components/PaymentDrawer.tsx` — dùng useSubmitGuard ở 3 nút footer
- `resources/js/pages/staff/pos/components/POSCartPanel.tsx` — dùng useSubmitGuard
- `resources/js/pages/staff/pos/components/TransferMergeModal.tsx` — dùng useSubmitGuard + idempotency_key
- `resources/js/pages/staff/pos/components/ReservationFormDrawer.tsx` — dùng useSubmitGuard

---

## Task 1: Backend — IdempotencyGuard service

**Files:**
- Create: `app/Services/IdempotencyGuard.php`

**Interfaces:**
- Produces: `IdempotencyGuard::isDuplicate(Request $request, string $action, array $fingerprint = []): bool` — `true` = request trùng (đã xử lý gần đây), nên trả success ngầm; `false` = request mới, tiếp tục xử lý. Các Task 2-4 gọi hàm này.

- [ ] **Step 1: Tạo service**

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
            : "idempotency:{$action}:".md5(json_encode($fingerprint));

        return ! Cache::add($key, true, $clientKey ? 30 : 5);
    }
}
```

- [ ] **Step 2: Xác minh syntax**

Run: `php -l app/Services/IdempotencyGuard.php`
Expected: "No syntax errors detected".

- [ ] **Step 3: Commit**

```bash
git add app/Services/IdempotencyGuard.php
git commit -m "feat: IdempotencyGuard service chong double-submit (key client 30s / fingerprint 5s)"
```

---

## Task 2: Backend — test IdempotencyGuard qua endpoint deposit

**Files:**
- Create: `tests/Feature/IdempotencyGuardTest.php`

**Interfaces:**
- Consumes: Task 1 (`IdempotencyGuard`), `ReservationController::deposit` (sẽ sửa trong Task 3).
- Produces: bằng chứng auto-guard hoạt động qua endpoint thật.

- [ ] **Step 1: Viết test fail**

```php
<?php

use App\Models\Deposit;
use Illuminate\Support\Facades\Cache;

// Tạo đơn để đặt cọc.
function idemDepositOrder(): \App\Models\Order
{
    $item = posMenuItem(['price' => 100000]);
    return posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']]);
}

test('deposit double-submit cung order/amount/method chi tao 1 coc', function () {
    $this->actingAs(posAdmin());
    $order = idemDepositOrder();

    // Request 1 (không idempotency_key — giả lập client cũ double-click)
    $r1 = $this->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 100000, 'method' => 'cash',
    ]);
    $r1->assertOk();

    // Request 2 cùng fingerprint trong 5s — phải bị chặn (success ngầm, không tạo cọc mới)
    $r2 = $this->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 100000, 'method' => 'cash',
    ]);
    $r2->assertOk();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(1);
});

test('deposit khac amount tao duoc 2 coc (khong bi chan)', function () {
    $this->actingAs(posAdmin());
    $order = idemDepositOrder();

    $this->postJson('/staff/pos/deposit', ['order_id' => $order->id, 'amount' => 100000, 'method' => 'cash'])->assertOk();
    $this->postJson('/staff/pos/deposit', ['order_id' => $order->id, 'amount' => 50000, 'method' => 'cash'])->assertOk();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(2);
});
```

- [ ] **Step 2: Chạy test fail**

Run: `php artisan test tests\Feature\IdempotencyGuardTest.php`
Expected: FAIL — test 1 tạo 2 cọc (deposit chưa có auto-guard), `Deposit::count()` = 2 thay vì 1.

- [ ] **Step 3: Sửa ReservationController::deposit dùng IdempotencyGuard**

Trong `app/Http/Controllers/Staff/ReservationController.php`, method `deposit` (hiện ~dòng 308-361):

Thay khối guard `Cache::add` hiện có:
```php
        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:deposit:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                return response()->json(['success' => true]);
            }
        }
```
bằng:
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'deposit', [
            'order_id' => $validated['order_id'],
            'amount' => $validated['amount'],
            'method' => $validated['method'],
        ])) {
            return response()->json(['success' => true]);
        }
```

**Lưu ý:** fingerprint chỉ dùng khi thiếu key; client gửi key vẫn dùng key (TTL 30s). Nếu `Cache` không còn được dùng nơi khác trong file, Pint sẽ gỡ import; giữ nguyên nếu vẫn dùng (cancelReservation/checkIn/reserve vẫn dùng Cache tới Task 3).

- [ ] **Step 4: Chạy test pass**

Run: `php artisan test tests\Feature\IdempotencyGuardTest.php tests\Feature\POSReservationDepositTest.php`
Expected: PASS (2 test mới + regression deposit cũ).

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/ReservationController.php tests/Feature/IdempotencyGuardTest.php
git commit -m "fix: deposit dung IdempotencyGuard chong double-click tao 2 coc"
```

---

## Task 3: Backend — IdempotencyGuard cho reserve/check-in/cancel-reservation

**Files:**
- Modify: `app/Http/Controllers/Staff/ReservationController.php`

**Interfaces:**
- Consumes: Task 1 (`IdempotencyGuard`).
- Produces: reserve/check-in/cancel-reservation chặn double-submit.

- [ ] **Step 1: Sửa 3 method**

Trong `app/Http/Controllers/Staff/ReservationController.php`, thay từng khối guard `Cache::add("idempotency:...")` hiện có (có `if ($request->filled('idempotency_key'))`) bằng `IdempotencyGuard::isDuplicate`:

**`reserve`** (hiện ~dòng 184-188), fingerprint:
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'reserve', [
            'table_id' => $validated['table_id'],
            'reservation_name' => $validated['reservation_name'],
            'reservation_time' => $validated['reservation_time'],
        ])) {
            return response()->json(['success' => true]);
        }
```

**`checkInReservation`** (hiện ~dòng 115-119), fingerprint:
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'check_in_reservation', [
            'order_id' => $validated['order_id'],
        ])) {
            return response()->json(['success' => true]);
        }
```

**`cancelReservation`** (hiện ~dòng 31-35), fingerprint:
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'cancel_reservation', [
            'order_id' => $validated['order_id'],
            'deposit_resolution' => $validated['deposit_resolution'] ?? null,
        ])) {
            return response()->json(['success' => true]);
        }
```

Thay đổi chính xác: mỗi khối `if ($request->filled('idempotency_key')) { $lockKey = ...; if (! Cache::add(...)) { return ...; } }` → khối `if (IdempotencyGuard::isDuplicate(...)) { return ...; }`. Trả phản hồi success ngầm GIỐNG hành vi cũ của từng method (reserve/checkIn/cancel trả `['success' => true]`).

- [ ] **Step 2: Pint + kiểm tra import**

Run: `vendor/bin/pint app/Http/Controllers/Staff/ReservationController.php`
Expected: gỡ `use Illuminate\Support\Facades\Cache;` nếu không còn dùng (deposit đã chuyển ở Task 2, 3 method này chuyển ở Task 3).

- [ ] **Step 3: Chạy regression**

Run: `php artisan test tests\Feature\POSReservationDepositTest.php tests\Feature\IdempotencyGuardTest.php`
Expected: PASS toàn bộ.

- [ ] **Step 4: Commit**

```bash
git add app/Http/Controllers/Staff/ReservationController.php
git commit -m "fix: reserve/checkIn/cancelReservation dung IdempotencyGuard"
```

---

## Task 4: Backend — IdempotencyGuard cho checkout/bulk-checkout

**Files:**
- Modify: `app/Http/Controllers/Staff/PaymentController.php`

**Interfaces:**
- Consumes: Task 1 (`IdempotencyGuard`).
- Produces: checkout/bulk-checkout chặn double-submit (giữ key client — frontend đã gửi).

- [ ] **Step 1: Sửa checkout**

Trong `app/Http/Controllers/Staff/PaymentController.php`, method `checkout` (hiện ~dòng 100-115 có khối guard `Cache::add("idempotency:checkout:...")`), thay bằng:
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'checkout', [
            'order_id' => $validated['order_id'],
            'amount_received' => $validated['amount_received'],
        ])) {
            Log::info("Duplicate checkout request suppressed: {$request->input('idempotency_key')}");

            return back()->with('success', 'Thanh toán đã được ghi nhận thành công!');
        }
```

- [ ] **Step 2: Sửa bulkCheckout**

Method `bulkCheckout` (hiện ~dòng 265-285 có khối guard `Cache::add("idempotency:bulk_checkout:...")`), thay bằng:
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'bulk_checkout', [
            'order_ids' => collect($validated['order_ids'])->sort()->values()->all(),
            'amount_received' => $validated['amount_received'],
        ])) {
            return $request->wantsJson()
                ? response()->json(['success' => true, 'message' => 'Thanh toán đã được ghi nhận!'])
                : back()->with('success', 'Thanh toán đã được ghi nhận!');
        }
```

- [ ] **Step 3: Pint**

Run: `vendor/bin/pint app/Http/Controllers/Staff/PaymentController.php`
Expected: gỡ `use Illuminate\Support\Facades\Cache;` nếu không còn dùng.

- [ ] **Step 4: Chạy regression**

Run: `php artisan test tests\Feature\POSCheckoutTest.php tests\Feature\POSBulkCheckoutTest.php tests\Feature\BulkCheckoutRollbackTest.php`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/PaymentController.php
git commit -m "fix: checkout/bulkCheckout dung IdempotencyGuard"
```

---

## Task 5: Backend — IdempotencyGuard cho send-to-kitchen + table operations

**Files:**
- Modify: `app/Http/Controllers/Staff/POSController.php`
- Modify: `app/Http/Controllers/Staff/TableOperationController.php`

**Interfaces:**
- Consumes: Task 1 (`IdempotencyGuard`).
- Produces: send-to-kitchen + transfer/merge/unmerge chặn double-submit.

- [ ] **Step 1: Sửa sendToKitchen**

Trong `app/Http/Controllers/Staff/POSController.php`, method `sendToKitchen` (hiện ~dòng 179-190 có khối guard `Cache::add("idempotency:send_to_kitchen:...")`), thay bằng:
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'send_to_kitchen', [
            'order_id' => $validated['order_id'] ?? null,
            'table_id' => $validated['table_id'] ?? null,
            'items_qty' => collect($validated['items'] ?? [])->sum('quantity'),
        ])) {
            Log::info("Duplicate sendToKitchen request suppressed: {$request->input('idempotency_key')}");

            return back()->with('success', 'Đơn hàng đã được gửi xuống Bếp!');
        }
```

- [ ] **Step 2: Sửa 3 method table operations**

Trong `app/Http/Controllers/Staff/TableOperationController.php`, các method hiện **không có** guard idempotency. Thêm vào đầu mỗi method (ngay sau `$validated = $request->validate([...]);`):

**`transferTable`:**
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'transfer_table', [
            'source_table_id' => $validated['source_table_id'],
            'target_table_id' => $validated['target_table_id'],
        ])) {
            return back()->with('success', 'Chuyển bàn thành công!');
        }
```

**`mergeTables`:**
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'merge_tables', [
            'source_table_id' => $validated['source_table_id'],
            'target_table_id' => $validated['target_table_id'],
        ])) {
            return back()->with('success', 'Gộp bàn thành công!');
        }
```

**`unmergeTable`:**
```php
        if (\App\Services\IdempotencyGuard::isDuplicate($request, 'unmerge_table', [
            'source_table_id' => $validated['source_table_id'],
            'keep_table_id' => $validated['keep_table_id'],
        ])) {
            return back()->with('success', 'Tách / Hủy gộp bàn thành công!');
        }
```

- [ ] **Step 3: Pint**

Run: `vendor/bin/pint app/Http/Controllers/Staff/POSController.php app/Http/Controllers/Staff/TableOperationController.php`
Expected: gỡ `use Illuminate\Support\Facades\Cache;` khỏi POSController nếu không còn dùng; TableOperationController thêm import `IdempotencyGuard` (dùng FQCN `\App\Services\IdempotencyGuard` — không cần import riêng).

- [ ] **Step 4: Chạy regression**

Run: `php artisan test tests\Feature\POSOrderFlowTest.php tests\Feature\KitchenFlowTest.php tests\Feature\POSTableOperationsTest.php tests\Feature\TableCacheTest.php tests\Feature\POSCancelRaceTest.php`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Staff/POSController.php app/Http/Controllers/Staff/TableOperationController.php
git commit -m "fix: sendToKitchen + table operations dung IdempotencyGuard"
```

---

## Task 6: Frontend — useSubmitGuard hook

**Files:**
- Create: `resources/js/hooks/useSubmitGuard.ts`

**Interfaces:**
- Produces: `useSubmitGuard(): { isSubmitting: boolean, guard: <T>(fn: () => Promise<T>) => Promise<T | undefined> }`. `guard` chặn re-entry đồng bộ (ref), reset khi `fn` xong (cả success lẫn error). Các Task 7-9 dùng.

- [ ] **Step 1: Tạo hook**

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

- [ ] **Step 2: Xác minh types:check**

Run: `npm run types:check`
Expected: PASS (hook tự chứa, chưa dùng ở đâu).

- [ ] **Step 3: Commit**

```bash
git add resources/js/hooks/useSubmitGuard.ts
git commit -m "feat: useSubmitGuard hook chong double-click dong bo (ref-based)"
```

---

## Task 7: Frontend — PaymentDrawer dùng useSubmitGuard + usePOSReservation gửi key

**Files:**
- Modify: `resources/js/pages/staff/pos/components/PaymentDrawer.tsx`
- Modify: `resources/js/pages/staff/pos/hooks/usePOSReservation.ts`

**Interfaces:**
- Consumes: Task 6 (`useSubmitGuard`).
- Produces: 3 nút footer PaymentDrawer chặn double-click đồng bộ; deposit/reserve/check-in/cancel gửi `idempotency_key`.

- [ ] **Step 1: PaymentDrawer — thêm useSubmitGuard**

Trong `PaymentDrawer.tsx`, thêm import và hook:
```ts
import { useSubmitGuard } from '../../../../hooks/useSubmitGuard';
```
Trong component body:
```ts
    const { isSubmitting, guard } = useSubmitGuard();
```

**Lưu ý:** `isSubmitting` cục bộ của hook chỉ đúng với `onConfirmDeposit`/`onConfirmReservation` (2 hàm async này đi qua `guard`). `onConfirmPayment` gọi sync `handleConfirmPayment` — `submitting` prop vẫn đóng vai trò disable. Kết hợp: dùng `disabled={submitting || isSubmitting || <điều kiện>}` cho cả 3 nút.

- [ ] **Step 2: Sửa handleConfirm để bọc guard**

Sửa `handleConfirm` (hiện ~dòng 124-137) thành async, bọc các callback đi qua `guard`:
```ts
    const handleConfirm = async (shouldPrint: boolean) => {
        if (mode === 'payment') {
            const finalReceived = paymentMethod === 'bank_transfer' ? payable : amountReceived;
            const finalChange = paymentMethod === 'bank_transfer' ? depositRefund : changeAmount;
            onConfirmPayment(paymentMethod, finalReceived, finalChange, shouldPrint);
        } else if (mode === 'deposit') {
            if (onConfirmDeposit) {
                await guard(() => onConfirmDeposit(amountReceived, paymentMethod));
            }
        } else if (mode === 'reservation') {
            if (onConfirmReservation) {
                const depositData = amountReceived > 0 ? { amount: amountReceived, method: paymentMethod } : null;
                await guard(() => onConfirmReservation(depositData));
            }
        }
    };
```

**Lưu ý:** `onConfirmDeposit` và `onConfirmReservation` trong POSManager hiện trả `void` (gọi `submitDeposit`/`submitReservation` không return promise). `guard` chấp nhận `() => Promise<T>`. Sửa signature trong `PaymentDrawerProps`:
```ts
    onConfirmDeposit?: (amount: number, method: 'cash' | 'bank_transfer') => Promise<void> | void;
    onConfirmReservation?: (deposit: { amount: number; method: 'cash' | 'bank_transfer' } | null) => Promise<void> | void;
```
Và trong `handleConfirm`, dùng `await guard(async () => { await onConfirmDeposit?.(amountReceived, paymentMethod); });` (bọc trong async thay vì truyền thẳng, để `void` vẫn hợp lệ).

- [ ] **Step 3: Sửa 3 nút footer**

**Nút payment (2 nút, hiện ~dòng 465-481):** đổi `disabled={submitting || ...}` thành `disabled={submitting || isSubmitting || ...}`. Giữ `onClick={() => handleConfirm(true)}` / `onClick={() => handleConfirm(false)}`.

**Nút deposit (hiện ~dòng 485-495):**
```tsx
                            disabled={submitting || isSubmitting || amountReceived <= 0}
                            onClick={() => handleConfirm(false)}
```

**Nút reservation (hiện ~dòng 497-507):**
```tsx
                            disabled={submitting || isSubmitting}
                            onClick={() => handleConfirm(false)}
```

- [ ] **Step 4: usePOSReservation — thêm idempotency_key vào 4 hàm**

Trong `usePOSReservation.ts`, thêm key cho từng fetch body (pattern giống usePOSCheckout):

**`submitDeposit`** (body hiện ~dòng 232-236):
```ts
                body: JSON.stringify({
                    order_id: orderId,
                    amount,
                    method: paymentMethod,
                    idempotency_key: `pos_deposit_${orderId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                })
```

**`submitReservation`** (body hiện ~dòng 114-119): thêm `idempotency_key: \`pos_reserve_${data.table_id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}\``.

**`checkInReservation`** (body hiện ~dòng 154): thêm `idempotency_key: \`pos_checkin_${orderId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}\``.

**`cancelReservation`** (body hiện ~dòng 184-...): thêm `idempotency_key: \`pos_cancelres_${orderId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}\``.

- [ ] **Step 5: types:check + build**

Run: `npm run types:check`
Expected: PASS (props đã sửa signature).

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/staff/pos/components/PaymentDrawer.tsx resources/js/pages/staff/pos/hooks/usePOSReservation.ts
git commit -m "fix: PaymentDrawer dung useSubmitGuard, usePOSReservation gui idempotency_key"
```

---

## Task 8: Frontend — PaymentDrawer tự đóng sau thành công

**Files:**
- Modify: `resources/js/pages/staff/pos/hooks/usePOSCheckout.ts`

**Interfaces:**
- Consumes: spec Phần 4b.
- Produces: payment không in đóng drawer SAU thành công (không đóng sớm khi thất bại).

- [ ] **Step 1: Bỏ đóng drawer sớm**

Trong `usePOSCheckout.ts` `handleConfirmPayment`, xóa khối (hiện ~dòng 288-290):
```ts
        if (!shouldPrint) {
            togglePaymentDrawer(false);
        }
```

- [ ] **Step 2: Đóng drawer trong nhánh success bất kể shouldPrint**

Trong `.then` thành công (hiện ~dòng 310-345), thêm `togglePaymentDrawer(false)` ngay đầu nhánh `if (response.ok && data.success)`:
```ts
                if (response.ok && data.success) {
                    togglePaymentDrawer(false);
                    if (shouldPrint) {
                        setReceiptModal({
                            isOpen: true,
                            // ...giữ nguyên payload hiện tại
                        });
                    }
                    onSuccessClearCart();
                    // ...giữ nguyên phần còn lại
                } else {
                    // giữ nguyên — KHÔNG đóng drawer khi thất bại
```

**Lưu ý:** nhánh `else` (thất bại) và `.catch` giữ nguyên — không đóng drawer, chỉ alert như hiện tại.

- [ ] **Step 3: Xác minh types:check**

Run: `npm run types:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/hooks/usePOSCheckout.ts
git commit -m "fix: PaymentDrawer payment khong in tu dong dong sau thanh cong"
```

---

## Task 9: Frontend — TransferMergeModal idempotency_key; xác định POSCartPanel / ReservationFormDrawer

**Files:**
- Modify: `resources/js/pages/staff/pos/components/TransferMergeModal.tsx`

**Interfaces:**
- Consumes: backend IdempotencyGuard (Task 5).
- Produces: TransferMergeModal gửi `idempotency_key`; POSCartPanel/ReservationFormDrawer KHÔNG cần sửa (đã xác định).

**Kết quả khảo sát trước (đã xác minh):**
- **`POSCartPanel.tsx`**: các nút submit dùng `disabled={submitting}` — `submitting` là prop từ POSManager = `checkoutSubmitting || reservationLoading` (đã bao phủ deposit/checkout/reservation). **KHÔNG cần sửa.**
- **`ReservationFormDrawer.tsx`**: nút submit `disabled={!isFormValid}`; `onSubmit` chỉ set draft + mở drawer (không phải network call). **KHÔNG cần sửa.**
- **`TransferMergeModal.tsx`**: `setSubmitting(true)` đã đồng bộ (chặn re-entry ngay trong event loop) nhưng KHÔNG gửi `idempotency_key` → backend auto-guard (Task 5) cần key/fingerprint để chặn ở lớp server. **Sửa: thêm `idempotency_key`.**

- [ ] **Step 1: TransferMergeModal — thêm idempotency_key vào 3 router.post**

Trong `TransferMergeModal.tsx`:

**`handleExecuteTransfer`** (data hiện ~dòng 79-81):
```ts
        router.post(
            '/staff/pos/transfer-table',
            {
                source_table_id: selectedTable.id,
                target_table_id: targetTransferTableId,
                idempotency_key: `pos_transfer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            },
```

**`handleExecuteMerge`** (data hiện ~dòng 107-110):
```ts
        router.post(
            '/staff/pos/merge-tables',
            {
                source_table_id: selectedTable.id,
                target_table_id: targetMergeTableId,
                idempotency_key: `pos_merge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            },
```

**`handleExecuteUnmerge`** (data hiện ~dòng 135-...): thêm `idempotency_key: \`pos_unmerge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}\``.

**Ghi chú trong báo cáo:** `useSubmitGuard` không áp cho TransferMergeModal vì `setSubmitting(true)` đã đồng bộ chặn re-entry; `idempotency_key` + backend auto-guard đủ. Không dùng `useSubmitGuard` ở đây.

- [ ] **Step 2: POSCartPanel / ReservationFormDrawer — xác nhận không cần sửa**

Ghi vào báo cáo: POSCartPanel dùng `submitting` prop (đã bao phủ); ReservationFormDrawer onSubmit không phải network call — cả 2 không cần `useSubmitGuard` hay thay đổi.

- [ ] **Step 3: types:check + build**

Run: `npm run types:check; if ($?) { npm run build }`
Expected: PASS cả 2.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/components/TransferMergeModal.tsx
git commit -m "fix: TransferMergeModal gui idempotency_key"
```

---

## Final verification

- [ ] `php artisan test` — toàn bộ pass (230 + IdempotencyGuardTest mới ~2)
- [ ] `npm run types:check` — pass
- [ ] `npm run build` — pass
- [ ] `vendor/bin/pint --dirty` — sạch (không thay đổi thêm)
- [ ] `git status` — tree sạch, không file lạ
