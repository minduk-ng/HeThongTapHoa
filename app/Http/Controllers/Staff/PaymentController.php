<?php

namespace App\Http\Controllers\Staff;

use App\Events\IngredientStockUpdated;
use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Table;
use App\Services\Checkout\CheckoutService;
use App\Services\IdempotencyGuard;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    use DispatchesSafely;

    public function validatePromotion(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required_without:codes|nullable|string|max:50',
            'codes' => 'nullable|array|min:1',
            'codes.*' => 'string|max:50',
            'subtotal' => 'required|numeric|min:0',
            'items' => 'nullable|array',
            'items.*.menu_item_id' => 'required_with:items|integer|exists:menu_items,id',
            'items.*.quantity' => 'required_with:items|integer|min:1',
            'items.*.unit_price' => 'required_with:items|numeric|min:0',
        ]);

        $lines = collect($validated['items'] ?? [])->map(function ($it) {
            $mi = MenuItem::find($it['menu_item_id']);

            return [
                'order_item_id' => null,
                'menu_item_id' => (int) $it['menu_item_id'],
                'subtotal' => (float) $it['quantity'] * (float) $it['unit_price'],
                'category_id' => $mi?->category_id,
            ];
        });

        if ($lines->isEmpty()) {
            // Fallback: không có items — coi toàn bộ subtotal là 1 dòng order scope.
            $lines = collect([[
                'order_item_id' => null,
                'menu_item_id' => null,
                'subtotal' => (float) $validated['subtotal'],
                'category_id' => null,
            ]]);
        }

        $codes = $validated['codes'] ?? [$validated['code'] ?? null];

        $resolved = PromotionEngine::resolveAll($codes, $lines, (float) $validated['subtotal']);

        if ($resolved['status'] === 'rejected') {
            $reason = $resolved['reason'] ?? 'not_found';
            $map = [
                'not_found' => 'Mã khuyến mãi không tồn tại.',
                'inactive' => 'Mã khuyến mãi đang tạm ngưng.',
                'not_started' => 'Mã khuyến mãi chưa tới hạn áp dụng.',
                'expired' => 'Mã khuyến mãi đã hết hạn.',
                'out_of_uses' => 'Mã khuyến mãi đã hết lượt sử dụng.',
                'below_min' => 'Đơn hàng chưa đạt giá trị tối thiểu.',
                'no_eligible_line' => 'Không có món trong đơn thuộc đối tượng áp dụng.',
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
            'code' => $r['promotion']->code,
            'discount_amount' => $r['amount'],
        ])->values()->all();

        return response()->json([
            'ok' => true,
            'discount_amount' => $resolved['total_discount'],
            'total' => (float) $validated['subtotal'] - $resolved['total_discount'],
            'promotion' => $promotions[0] ?? null,
            'promotions' => $promotions,
        ]);
    }

    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'payment_method' => 'required|in:cash,bank_transfer',
            'amount_received' => 'required|numeric|min:0',
            'change_amount' => 'required|numeric|min:0',
            'promotion_code' => 'nullable|string|max:50',
            'idempotency_key' => 'nullable|string|max:100',
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

                if (in_array($order->status, ['paid', 'cancelled'])) {
                    throw new \Exception('Đơn hàng này đã được thanh toán hoặc đã hủy.');
                }

                if ($order->status === 'reserved') {
                    throw new \Exception('Đơn đặt bàn chưa check-in, không thể thanh toán', 422);
                }

                // Check if this order is still pending/processing in kitchen
                $hasUncompletedItems = $order->items->contains(function ($item) {
                    return in_array($item->status, ['pending', 'processing']);
                });

                $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
                if ($hasUncompletedItems && ! $canBypass) {
                    throw new \Exception('Bạn không có quyền duyệt khẩn cấp thanh toán khi món chưa được Bếp hoàn tất.');
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
                );

                $totalAmount = (float) $invoice->total_amount;
                $depositTotal = (float) $invoice->deposit_amount;
                $depositRefund = max(0.0, $depositTotal - $totalAmount);

                $hasOtherActive = $allGroupTableIds->isNotEmpty()
                    ? Order::whereIn('table_id', $allGroupTableIds)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
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
                        $this->safeDispatch(fn () => TableStatusUpdated::dispatch($grpTable, 'checkout', [
                            'order_code' => $order->order_code,
                            'total_amount' => $totalAmount,
                        ]));
                    }
                }

                return ['table' => $targetTable, 'deposit_total' => $depositTotal, 'deposit_refund' => $depositRefund];
            });

            $targetTable = $result['table'];
            $depositTotal = $result['deposit_total'];
            $depositRefund = $result['deposit_refund'];

            $this->safeDispatch(function () use ($targetTable, $order, $totalAmount) {
                if ($targetTable) {
                    TableStatusUpdated::dispatch($targetTable, 'checkout', [
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
            'change_amount' => 'required|numeric|min:0',
            'promotion_code' => 'nullable|string|max:50',
            'idempotency_key' => 'nullable|string|max:100',
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

                // Kitchen lock check
                $canBypass = $request->user()->hasPermission('pos.bypass_kitchen_lock');
                if (! $canBypass) {
                    foreach ($orders as $ord) {
                        $hasUncompleted = $ord->items->contains(fn ($item) => in_array($item->status, ['pending', 'processing']));
                        if ($hasUncompleted) {
                            throw new \Exception("Đơn {$ord->order_code} còn món chưa được Bếp hoàn tất.");
                        }
                    }
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
                );

                $totalAmount = (float) $invoice->total_amount;
                $depositTotal = (float) $invoice->deposit_amount;
                $depositRefund = max(0.0, $depositTotal - $totalAmount);

                // Release tables if no active orders remain
                $allGroupTableIds = $allGroupTables->pluck('id');
                if ($allGroupTableIds->isNotEmpty()) {
                    $hasOtherActive = Order::whereIn('table_id', $allGroupTableIds)
                        ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
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
            Log::error('POS bulk checkout error: '.$e->getMessage());

            if ($request->wantsJson()) {
                return response()->json(['error' => 'Thanh toán thất bại: '.$e->getMessage()], 422);
            }

            return back()->withErrors(['error' => 'Thanh toán thất bại: '.$e->getMessage()]);
        }
    }

    private function resolvePromotion(?string $code, $lines, float $orderSubtotal, bool $lockForUpdate = false): ?array
    {
        if (! $code) {
            return null;
        }
        $r = PromotionEngine::resolveAll([$code], $lines, $orderSubtotal, $lockForUpdate);
        if ($r['status'] === 'rejected') {
            return ['status' => 'rejected', 'reason' => $r['reason']];
        }

        return [
            'status' => 'ok',
            'promotion' => $r['promotions'][0]['promotion'],
            'discount_amount' => $r['promotions'][0]['amount'],
        ];
    }
}
