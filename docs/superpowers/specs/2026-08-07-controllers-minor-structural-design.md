# Design — Hoàn thiện Minor + cấu trúc controllers

**Date:** 2026-08-07
**Branch:** feat/fix-critical-kitchen-deposit-auth (chưa merge, 6 commits Critical/Important/Auth đã xong)

## Mục tiêu

Hoàn thiện các Minor + vấn đề cấu trúc còn lại trong controllers: bỏ double dispatch TableStatusUpdated, đồng bộ validation payment_method, bỏ magic status 'served', xóa resolvePromotion dead, dùng trait thay 2 duplicate (safeDispatch/generateOrderCode), extract image-delete, gộp status strings thành constants. Không đổi hành vi UI báo cáo.

## Đã xác minh (trạng thái hiện tại)

- **Đã xong** (trên branch này, commit `812257a`): TableController::index GET mutate — đã bỏ.
- `PaymentController:101` checkout `in:cash,bank_transfer` vs `:267` bulkCheckout `in:cash,bank_transfer,e_wallet` — lệch.
- `change_amount` validated `required` (`:103,:269`) nhưng service tự tính, không dùng.
- `ReservationController:74` magic status `'served'` (không tồn tại trong codebase — chỉ có draft/pending/confirmed/processing/completed/cancelled/reserved).
- `PaymentController:212` dispatch TableStatusUpdated trong transaction (pre-commit) + `:230` sau commit — duplicate cho targetTable; group tables phụ chỉ dispatch pre-commit.
- `PaymentController:420-435` `resolvePromotion` private — 0 caller (test reflect qua ReflectionMethod).
- `KitchenController:341-348` private `safeDispatch` — duplicate trait `Concerns\DispatchesSafely`.
- `Manager\TableController:47-65` private `generateOrderCode` — duplicate trait `Concerns\GeneratesOrderCode`.
- `Manager\ProductController` image-delete logic lặp `:112-126` (update) + `:158-163` (destroy).
- Status array `['draft','pending','confirmed','processing','completed']` xuất hiện 14 chỗ khắp controllers.

## Phần 1 — Fix logic nhỏ

**1a. PaymentController checkout — bỏ dispatch pre-commit, giữ sau-commit cho cả group.**

Xóa block `:212-215` (`$this->safeDispatch(fn () => TableStatusUpdated::dispatch($grpTable, 'checkout', [...]))` trong loop group table, pre-commit). Đổi closure sau-commit `:228-235` để dispatch cho CẢ group (không chỉ targetTable):

```php
            $this->safeDispatch(function () use ($allGroupTables, $order, $totalAmount) {
                foreach ($allGroupTables as $grpTable) {
                    TableStatusUpdated::dispatch($grpTable, 'checkout', [
                        'order_code' => $order->order_code,
                        'total_amount' => $totalAmount,
                    ]);
                }
            });
```

Lưu ý: `$allGroupTables` là Collection đã có trong scope (transaction closure `use ($validated, $request, &$order, &$totalAmount)` — `$allGroupTables` là biến local trong closure tx, KHÔNG ra ngoài). Kiểm tra: `$allGroupTables` được khai báo trong transaction closure (`:820`), sau-commit closure ngoài transaction không truy cập được → cần capture qua `$result['all_group_tables']` hoặc tính lại từ `$targetTable`. Quyết định: transaction trả thêm `'all_group_tables' => $allGroupTables->values()->all()` trong `return ['table' => ..., 'all_group_tables' => ...]`, rồi sau-commit loop dùng nó.

**1b. Đồng bộ payment_method validation:**
`checkout` `:101` → `'required|in:cash,bank_transfer,e_wallet'` (khớp bulkCheckout). Frontend `usePOSCheckout.ts` gửi `payment_method` — đảm bảo `PaymentDrawer` mode payment có hỗ trợ e_wallet (nếu chưa, đây chỉ là validation backend; UI vẫn dùng cash/bank_transfer — không phá).

**1c. `change_amount` validate → `nullable`:**
Cả 2 chỗ `:103,:269` → `'change_amount' => 'nullable|numeric|min:0'`. Lý do: service tự tính change_amount, client gửi là tham khảo; `required` hiện không gây hại nhưng không nên bắt buộc field không dùng. Giữ `nullable` để client cũ (luôn gửi) không vỡ, client mới có thể bỏ.

**1d. Bỏ magic status `'served'`:**
`ReservationController:74` → bỏ `'served'` khỏi mảng:
```php
->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'])
```
(Khớp các nơi khác có 'reserved'. 'served' không phải order status.)

**1e. cancelReservation rewrite reservation_* khi còn đơn reserved khác (edge hiếm):**
Ghi nhận follow-up, KHÔNG làm bây giờ (thêm phức tạp, hiếm gặp). Chỉ sửa 1d (bỏ magic status). Ghi chú trong spec: khi hủy đơn reserved mà bàn còn đơn reserved khác, reservation_* trên bàn có thể stale — đề xuất fix sau nếu nghiệp vụ cần.

## Phần 2 — Cấu trúc

**2a. Xóa `resolvePromotion` dead (PaymentController:420-435):**
- Xóa method.
- `tests/Feature/POSPromotionRejectReasonTest.php` (4 test) reflect `PaymentController::resolvePromotion` → đổi sang gọi trực tiếp `PromotionEngine::resolveAll($codes, $lines, $subtotal)` (signature đã có; reject reasons khớp: inactive/not_started/expired/out_of_uses/below_min/not_found/no_eligible_line). Giữ giá trị coverage reject-reason qua engine (PromotionEngineTest đã cover tương tự).
- Đổi `posRejectReasonLines()` giữ nguyên (shape lines engine: order_item_id/menu_item_id/subtotal/category_id).

**2b. KitchenController dùng trait `DispatchesSafely`:**
- Thêm `use App\Http\Controllers\Staff\Concerns\DispatchesSafely;` + `use DispatchesSafely;` trong class.
- Xóa private `safeDispatch` (`:341-348`).
- Các `$this->safeDispatch(...)` vẫn hoạt động qua trait.

**2c. TableController dùng trait `GeneratesOrderCode`:**
- Thêm `use App\Http\Controllers\Staff\Concerns\GeneratesOrderCode;` + `use GeneratesOrderCode;`.
- Xóa private `generateOrderCode` (`:47-65`).
- `$this->generateOrderCode($table)` vẫn hoạt động.

**2d. ProductController extract image-delete:**
Tạo private method chứa logic xóa ảnh (public + sirv path) — logic giống hệt ở `:116-126` (update) và `:155-164` (destroy), gồm cả strip `sirv.base_folder`:
```php
private function deleteProductImage(?string $image): void
{
    if (! $image) return;
    if (str_starts_with($image, '/storage/')) {
        \Illuminate\Support\Facades\Storage::disk('public')->delete(str_replace('/storage/', '', $image));
    } elseif (str_contains($image, 'sirv.com')) {
        $oldPath = parse_url($image, PHP_URL_PATH);
        $baseFolder = (string) config('filesystems.disks.sirv.base_folder', '/TapHoa');
        $relativeSirvPath = ltrim(str_replace($baseFolder, '', (string) $oldPath), '/');
        \Illuminate\Support\Facades\Storage::disk('sirv')->delete($relativeSirvPath);
    }
}
```
Dùng trong `update` (thay `:116-126`) và `destroy` (thay `:155-164`). **Bắt buộc giữ `$baseFolder` strip** — đây là chi tiết quan trọng của logic sirv path.

**2e. Status constants trên `Order` model:**
```php
public const ACTIVE_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed'];
public const OPERATIONAL_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'];
```
Thay:
- 11 chỗ `['draft','pending','confirmed','processing','completed']` → `Order::ACTIVE_STATUSES`
- 3 chỗ `['draft','pending','confirmed','processing','completed','reserved']` → `Order::OPERATIONAL_STATUSES` (POSController:52,68,90)
- `ReservationController:74` → `Order::OPERATIONAL_STATUSES` (sau khi bỏ 'served')
- `OrderListController:40` → `Order::ACTIVE_STATUSES`
- `PaymentController:186,357`, `KitchenController:308`, `POSController:272,364`, `TableOperationController:68,90,148,200,205` → `Order::ACTIVE_STATUSES`

**Bất biến:** không đổi hành vi — thay literal bằng constant; dùng trait thay duplicate; xóa dead. Full suite + types/build giữ nguyên.

## Phần 3 — Kiểm thử

- **1a:** test checkout merged-group → TableStatusUpdated dispatch sau-commit cho cả group (mock event hoặc assert không dispatch pre-commit). Khó mock event dễ — dùng `Event::fake()` + assert `TableStatusUpdated` dispatched N lần (số group table), KHÔNG trước transaction. Nếu phức tạp, test regression POSCheckoutTest + merged-table test đã cover hành vi (bàn release đúng).
- **1b/1c:** test checkout nhận `payment_method=e_wallet` → 200 (hiện 422); `change_amount` thiếu → vẫn 200 (nullable).
- **1d:** test cancelReservation — không vỡ (đơn active không còn match 'served' nhưng đó là status không tồn tại → không ảnh hưởng behavior); regression POSReservationDepositTest.
- **2a:** POSPromotionRejectReasonTest đổi sang engine → 4 test pass qua `PromotionEngine::resolveAll`.
- **2b-2e:** regression toàn bộ suite (không test mới riêng cho refactor thuần — behavior không đổi).
- **Final:** `php artisan test` full + `npm run types:check` + `npm run build` + `vendor/bin/pint --dirty`.

## Ngoài phạm vi

- Không sửa 1e (rewrite reservation_* edge) — follow-up.
- Không sửa `ServingController:65` ('served' là audit action, không phải order status).
- Không đổi logic báo cáo / frontend shape.
