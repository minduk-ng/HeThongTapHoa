<?php

namespace App\Http\Controllers\Staff;

use App\Events\IngredientStockUpdated;
use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Promotion;
use App\Models\Table;
use App\Services\Checkout\CheckoutService;
use App\Services\IdempotencyGuard;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class PaymentController extends Controller
{
    use DispatchesSafely;

    public function validatePromotion(Request $request)
    {
        $validated = $request->validate([
            'code' => 'nullable|string|max:50',
            'codes' => 'nullable|array|min:1',
            'codes.*' => 'string|max:50',
            'subtotal' => 'nullable|numeric|min:0',
            'items' => 'nullable|array',
            'items.*.menu_item_id' => ['required_with:items', 'integer', Rule::exists('menu_items', 'id')->whereNull('deleted_at')],
            'items.*.quantity' => 'required_with:items|integer|min:1',
            'selected_promotion_id' => ['nullable', 'integer', function ($attribute, $value, $fail) {
                $this->validateSelectedPromotion((int) $value, $fail);
            }],
        ]);

        $lines = collect($validated['items'] ?? [])->map(function ($it) {
            $mi = MenuItem::find($it['menu_item_id']);

            return [
                'order_item_id' => null,
                'menu_item_id' => (int) $it['menu_item_id'],
                'quantity' => (int) ($it['quantity'] ?? 0),
                'subtotal' => (float) $it['quantity'] * (float) ($mi?->price ?? 0),
                'category_id' => $mi?->category_id,
            ];
        });

        if ($lines->isEmpty()) {
            // Fallback: không có items — coi toàn bộ subtotal là 1 dòng order scope.
            $lines = collect([[
                'order_item_id' => null,
                'menu_item_id' => null,
                'quantity' => 0,
                'subtotal' => (float) ($validated['subtotal'] ?? 0),
                'category_id' => null,
            ]]);
        }

        $codes = collect($validated['codes'] ?? [$validated['code'] ?? null])
            ->filter(fn ($c) => $c !== null && trim((string) $c) !== '')
            ->values()
            ->all();

        $linesSubtotal = $lines->sum('subtotal');
        $resolved = PromotionEngine::resolveAll($codes, $lines, (float) $linesSubtotal, false, $validated['selected_promotion_id'] ?? null);

        if ($resolved['status'] === 'rejected') {
            $reason = $resolved['reason'] ?? 'not_found';
            $map = [
                'not_found' => 'Mã khuyến mãi không tồn tại.',
                'inactive' => 'Mã khuyến mãi đang tạm ngưng.',
                'not_started' => 'Mã khuyến mãi chưa tới hạn áp dụng.',
                'expired' => 'Mã khuyến mãi đã hết hạn.',
                'out_of_uses' => 'Mã khuyến mãi đã hết lượt sử dụng.',
                'condition_not_met' => 'Đơn hàng chưa đáp ứng điều kiện khuyến mãi.',
                'out_of_slot' => 'Mã chỉ áp dụng trong khung giờ đã đăng ký.',
                'already_used' => 'Mã khuyến mãi đã được sử dụng.',
                'disabled' => 'Mã khuyến mãi đã bị vô hiệu hoá.',
                'free_product_not_in_cart' => 'Đơn cần có món tặng mới áp dụng được mã này.',
            ];

            return response()->json([
                'ok' => false,
                'error' => $map[$reason] ?? 'Mã khuyến mãi không hợp lệ.',
                'code' => $resolved['code'] ?? ($validated['code'] ?? null),
            ], 422);
        }

        $promotions = collect($resolved['promotions'])->map(fn ($r) => [
            'id' => $r['promotion']->id,
            'name' => $r['promotion']->name,
            'code' => $r['code'] ?? $r['promotion']->code,
            'discount_amount' => $r['amount'],
        ])->values()->all();

        return response()->json([
            'ok' => true,
            'discount_amount' => $resolved['total_discount'],
            'total' => (float) $linesSubtotal - $resolved['total_discount'],
            'promotion' => $promotions[0] ?? null,
            'promotions' => $promotions,
        ]);
    }

    public function availablePromotions(Request $request)
    {
        $validated = $request->validate([
            'subtotal' => 'nullable|numeric|min:0',
            'items' => 'nullable|array',
            'items.*.menu_item_id' => ['required_with:items', 'integer', Rule::exists('menu_items', 'id')->whereNull('deleted_at')],
            'items.*.quantity' => 'required_with:items|integer|min:1',
        ]);

        $lines = collect($validated['items'] ?? [])->map(function ($it) {
            $mi = MenuItem::find($it['menu_item_id']);

            return [
                'order_item_id' => null,
                'menu_item_id' => (int) $it['menu_item_id'],
                'quantity' => (int) ($it['quantity'] ?? 0),
                'subtotal' => (float) $it['quantity'] * (float) ($mi?->price ?? 0),
                'category_id' => $mi?->category_id,
            ];
        });

        if ($lines->isEmpty()) {
            $lines = collect([[
                'order_item_id' => null,
                'menu_item_id' => null,
                'quantity' => 0,
                'subtotal' => (float) ($validated['subtotal'] ?? 0),
                'category_id' => null,
            ]]);
        }

        $linesSubtotal = $lines->sum('subtotal');
        $candidates = PromotionEngine::candidates($lines, (float) $linesSubtotal);

        return response()->json(['ok' => true, 'promotions' => $candidates]);
    }

    public function checkout(Request $request): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'payment_method' => 'required|in:cash,bank_transfer,e_wallet',
            'amount_received' => 'required|numeric|min:0',
            'change_amount' => 'nullable|numeric|min:0',
            'promotion_code' => 'nullable|string|max:50',
            'idempotency_key' => 'nullable|string|max:100',
            'selected_promotion_id' => ['nullable', 'integer', function ($attribute, $value, $fail) {
                $this->validateSelectedPromotion((int) $value, $fail);
            }],
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'checkout', [
            'order_id' => $validated['order_id'],
            'amount_received' => $validated['amount_received'],
        ])) {
            Log::info("Duplicate checkout request suppressed: {$request->input('idempotency_key')}");

            return back()->with('success', 'Thanh toán đã được ghi nhận thành công!');
        }

        try {
            $order = null;
            $totalAmount = 0;
            $result = DB::transaction(function () use ($validated, $request, &$order, &$totalAmount) {
                $order = Order::with(['items.menuItem'])->lockForUpdate()->findOrFail($validated['order_id']);
                if (! $order instanceof Order) {
                    throw new \Exception('Không tìm thấy đơn hàng.');
                }

                if (in_array($order->status, ['paid', 'cancelled'])) {
                    throw new \Exception('Đơn hàng này đã được thanh toán hoặc đã hủy.');
                }

                if ($order->status === 'reserved') {
                    throw new \Exception('Đơn đặt bàn chưa check-in, không thể thanh toán', 422);
                }

                $targetTable = $order->table_id ? Table::findOrFail($order->table_id) : null;

                // Determine primary group table ID and all tables in this merged group
                if ($targetTable) {
                    $primaryId = $targetTable->merged_into_table_id ?? $targetTable->id;
                    $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
                } else {
                    $primaryId = null;
                    $allGroupTables = collect();
                }
                $allGroupTableIds = $allGroupTables->pluck('id');

                // Compute total amount and table name string for invoice record
                $primaryTableObj = $allGroupTables->firstWhere('id', $primaryId);
                $subTableNumbers = $allGroupTables->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
                $tableNameStr = $targetTable
                    ? ($subTableNumbers ? "{$primaryTableObj->table_number} (Gộp {$subTableNumbers})" : $primaryTableObj->table_number)
                    : 'Mang đi';

                $paymentRows = [[
                    'method' => $validated['payment_method'],
                    'amount' => (float) $validated['amount_received'],
                ]];
                $codes = ! empty($validated['promotion_code']) ? [$validated['promotion_code']] : [];

                // CheckoutService ghi invoice_lines/payments/invoice_promotions, cập nhật order,
                // cọc applied + audit log trong 1 transaction. Truyền tableNameStr để giữ nguyên
                // chuỗi tên bàn legacy (vd "Mang đi" thường).
                $invoice = CheckoutService::runBulk(
                    collect([$order]),
                    $paymentRows,
                    $codes,
                    $request->user()?->id,
                    $tableNameStr,
                    $validated['selected_promotion_id'] ?? null,
                );

                $totalAmount = (float) $invoice->total_amount;
                $depositTotal = (float) $invoice->deposit_amount;
                $depositRefund = max(0.0, $depositTotal - $totalAmount);

                $hasOtherActive = $allGroupTableIds->isNotEmpty()
                    ? Order::whereIn('table_id', $allGroupTableIds)
                        ->whereIn('status', Order::ACTIVE_STATUSES)
                        ->exists()
                    : false;

                if (! $hasOtherActive && $targetTable) {
                    $reservedOrder = Order::whereIn('table_id', $allGroupTableIds)
                        ->where('status', 'reserved')
                        ->orderBy('reservation_time', 'asc')
                        ->first();

                    foreach ($allGroupTables as $grpTable) {
                        if ($reservedOrder) {
                            $grpTable->update([
                                'status' => 'reserved',
                                'merged_into_table_id' => null,
                                'reservation_name' => $reservedOrder->reservation_name,
                                'reservation_phone' => $reservedOrder->reservation_phone,
                                'reservation_time' => $reservedOrder->reservation_time,
                                'reservation_note' => $reservedOrder->reservation_note,
                            ]);
                        } else {
                            $grpTable->update([
                                'status' => 'available',
                                'merged_into_table_id' => null,
                            ]);
                        }
                    }
                }

                return ['table' => $targetTable, 'deposit_total' => $depositTotal, 'deposit_refund' => $depositRefund, 'all_group_tables' => $allGroupTables->values()->all()];
            });

            $this->safeDispatch(fn () => Cache::tags(['pos_tables'])->flush());

            $targetTable = $result['table'];
            $depositTotal = $result['deposit_total'];
            $depositRefund = $result['deposit_refund'];

            $this->safeDispatch(function () use ($result, $order, $totalAmount) {
                foreach ($result['all_group_tables'] as $grpTable) {
                    TableStatusUpdated::dispatch($grpTable, 'checkout', [
                        'order_code' => $order->order_code,
                        'total_amount' => $totalAmount,
                    ]);
                }
            });
            $this->safeDispatch(fn () => IngredientStockUpdated::dispatch(['source' => 'checkout']));

            if ($request->wantsJson()) {
                return response()->json([
                    'success' => true,
                    'message' => 'Thanh toán hoàn tất thành công!',
                    'deposit_total' => $depositTotal,
                    'deposit_refund' => $depositRefund,
                ]);
            }

            return back()->with('success', 'Thanh toán hoàn tất thành công!');
        } catch (\Throwable $e) {
            IdempotencyGuard::release($request, 'checkout', [
                'order_id' => $validated['order_id'],
                'amount_received' => $validated['amount_received'],
            ]);
            Log::error('POS checkout DB error: '.$e->getMessage());

            if ($request->wantsJson()) {
                return response()->json([
                    'error' => 'Thanh toán thất bại: '.$e->getMessage(),
                ], 422);
            }

            return back()->withErrors(['error' => 'Thanh toán thất bại: '.$e->getMessage()]);
        }
    }

    public function bulkCheckout(Request $request)
    {
        $validated = $request->validate([
            'order_ids' => 'required|array|min:1',
            'order_ids.*' => 'exists:orders,id',
            'table_id' => 'nullable|exists:tables,id',
            'payment_method' => 'required|in:cash,bank_transfer,e_wallet',
            'amount_received' => 'required|numeric|min:0',
            'change_amount' => 'nullable|numeric|min:0',
            'promotion_code' => 'nullable|string|max:50',
            'idempotency_key' => 'nullable|string|max:100',
            'selected_promotion_id' => ['nullable', 'integer', function ($attribute, $value, $fail) {
                $this->validateSelectedPromotion((int) $value, $fail);
            }],
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'bulk_checkout', [
            'order_ids' => collect($validated['order_ids'])->sort()->values()->all(),
            'amount_received' => $validated['amount_received'],
        ])) {
            return $request->wantsJson()
                ? response()->json(['success' => true, 'message' => 'Thanh toán đã được ghi nhận!'])
                : back()->with('success', 'Thanh toán đã được ghi nhận!');
        }

        try {
            $invoice = null;
            $totalAmount = 0;
            $orders = collect();

            $result = DB::transaction(function () use ($validated, $request, &$invoice, &$totalAmount, &$orders) {
                $orders = Order::with(['items.menuItem'])->whereIn('id', $validated['order_ids'])->lockForUpdate()->get();

                if ($orders->count() !== count($validated['order_ids'])) {
                    throw new \Exception('Một số đơn hàng không tồn tại.');
                }

                $invalidOrder = $orders->first(fn ($o) => in_array($o->status, ['paid', 'cancelled']));
                if ($invalidOrder) {
                    throw new \Exception("Đơn {$invalidOrder->order_code} đã được thanh toán hoặc đã hủy.");
                }

                $reservedOrder = $orders->first(fn ($o) => $o->status === 'reserved');
                if ($reservedOrder) {
                    throw new \Exception("Đơn {$reservedOrder->order_code} là đơn đặt bàn chưa check-in, không thể thanh toán", 422);
                }

                // Determine table name
                $tableId = $validated['table_id'] ?? $orders->first()?->table_id;
                $targetTable = $tableId ? Table::find($tableId) : null;

                if ($targetTable) {
                    $primaryId = $targetTable->merged_into_table_id ?? $targetTable->id;
                    $allGroupTables = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
                    $primaryTableObj = $allGroupTables->firstWhere('id', $primaryId);
                    $subTableNumbers = $allGroupTables->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
                    $tableNameStr = $subTableNumbers ? "{$primaryTableObj->table_number} (Gộp {$subTableNumbers})" : $primaryTableObj->table_number;
                } else {
                    $primaryId = null;
                    $allGroupTables = collect();
                    $tableNameStr = 'Mang đi';
                }

                // CheckoutService ghi invoice_lines/payments/invoice_promotions, cập nhật order,
                // cọc applied + audit log trong 1 transaction. Truyền tableNameStr để giữ nguyên
                // chuỗi tên bàn legacy (vd "Mang đi" thường).
                $paymentRows = [[
                    'method' => $validated['payment_method'],
                    'amount' => (float) $validated['amount_received'],
                ]];
                $codes = ! empty($validated['promotion_code']) ? [$validated['promotion_code']] : [];

                $invoice = CheckoutService::runBulk(
                    $orders,
                    $paymentRows,
                    $codes,
                    $request->user()?->id,
                    $tableNameStr,
                    $validated['selected_promotion_id'] ?? null,
                );

                $totalAmount = (float) $invoice->total_amount;
                $depositTotal = (float) $invoice->deposit_amount;
                $depositRefund = max(0.0, $depositTotal - $totalAmount);

                // Release tables if no active orders remain
                $allGroupTableIds = $allGroupTables->pluck('id');
                if ($allGroupTableIds->isNotEmpty()) {
                    $hasOtherActive = Order::whereIn('table_id', $allGroupTableIds)
                        ->whereIn('status', Order::ACTIVE_STATUSES)
                        ->exists();

                    if (! $hasOtherActive) {
                        $reservedOrder = Order::whereIn('table_id', $allGroupTableIds)
                            ->where('status', 'reserved')
                            ->orderBy('reservation_time', 'asc')
                            ->first();

                        foreach ($allGroupTables as $grpTable) {
                            if ($reservedOrder) {
                                $grpTable->update([
                                    'status' => 'reserved',
                                    'merged_into_table_id' => null,
                                    'reservation_name' => $reservedOrder->reservation_name,
                                    'reservation_phone' => $reservedOrder->reservation_phone,
                                    'reservation_time' => $reservedOrder->reservation_time,
                                    'reservation_note' => $reservedOrder->reservation_note,
                                ]);
                            } else {
                                $grpTable->update(['status' => 'available', 'merged_into_table_id' => null]);
                            }
                        }
                    }
                }

                return ['table' => $targetTable, 'deposit_total' => $depositTotal, 'deposit_refund' => $depositRefund];
            });

            $this->safeDispatch(fn () => Cache::tags(['pos_tables'])->flush());

            $targetTable = $result['table'];
            $depositTotal = $result['deposit_total'];
            $depositRefund = $result['deposit_refund'];

            $this->safeDispatch(function () use ($targetTable, $orders, $totalAmount) {
                if ($targetTable) {
                    TableStatusUpdated::dispatch($targetTable, 'checkout', [
                        'order_code' => $orders->pluck('order_code')->implode(', '),
                        'total_amount' => $totalAmount,
                    ]);
                }
            });
            $this->safeDispatch(fn () => IngredientStockUpdated::dispatch(['source' => 'bulk_checkout']));

            if ($request->wantsJson()) {
                return response()->json([
                    'success' => true,
                    'message' => 'Thanh toán gộp thành công!',
                    'deposit_total' => $depositTotal,
                    'deposit_refund' => $depositRefund,
                ]);
            }

            return back()->with('success', 'Thanh toán gộp thành công!');
        } catch (\Throwable $e) {
            IdempotencyGuard::release($request, 'bulk_checkout', [
                'order_ids' => collect($validated['order_ids'])->sort()->values()->all(),
                'amount_received' => $validated['amount_received'],
            ]);
            Log::error('POS bulk checkout error: '.$e->getMessage());

            if ($request->wantsJson()) {
                return response()->json(['error' => 'Thanh toán thất bại: '.$e->getMessage()], 422);
            }

            return back()->withErrors(['error' => 'Thanh toán thất bại: '.$e->getMessage()]);
        }
    }

    /**
     * Validate selected_promotion_id: 0 = không áp dụng (hợp lệ); ≥1 phải tồn tại,
     * đang bật (status=true) và còn trong khoảng hiệu lực — tránh chọn nhầm mã đã tắt/hết hạn.
     */
    private function validateSelectedPromotion(int $value, callable $fail): void
    {
        if ($value === 0) {
            return; // 0 = chủ động không áp dụng auto promotion
        }

        $now = now();
        $exists = Promotion::query()
            ->where('id', $value)
            ->whereNull('deleted_at')
            ->where('status', true)
            ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', $now))
            ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $now))
            ->exists();

        if (! $exists) {
            $fail('Chương trình khuyến mãi không tồn tại, đang tạm ngưng hoặc đã hết hạn.');
        }
    }
}
