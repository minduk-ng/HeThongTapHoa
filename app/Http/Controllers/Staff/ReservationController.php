<?php

namespace App\Http\Controllers\Staff;

use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Http\Controllers\Staff\Concerns\GeneratesOrderCode;
use App\Models\Deposit;
use App\Models\Employee;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use App\Services\IdempotencyGuard;
use App\Services\OrderActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ReservationController extends Controller
{
    use DispatchesSafely, GeneratesOrderCode;

    public function cancelReservation(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'deposit_resolution' => 'nullable|in:refund,forfeit',
            'note' => 'nullable|string',
            'idempotency_key' => 'nullable|string',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'cancel_reservation', [
            'order_id' => $validated['order_id'],
            'deposit_resolution' => $validated['deposit_resolution'] ?? null,
        ])) {
            return response()->json(['success' => true]);
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $order = Order::with(['table', 'deposits' => fn ($q) => $q->where('status', 'held')])->findOrFail($validated['order_id']);

                if ($order->status !== 'reserved') {
                    throw new \Exception('Chỉ có thể hủy đơn đặt bàn', 422);
                }

                $heldDeposits = $order->deposits;
                $hasHeldDeposits = $heldDeposits->sum('amount') > 0;

                if ($hasHeldDeposits && empty($validated['deposit_resolution'])) {
                    throw new \Exception('Vui lòng chọn hướng xử lý cọc', 422);
                }

                $order->update(['status' => 'cancelled']);

                if ($hasHeldDeposits) {
                    foreach ($heldDeposits as $deposit) {
                        $deposit->update([
                            'status' => $validated['deposit_resolution'] === 'refund' ? 'refunded' : 'forfeited',
                            'resolved_by_user_id' => $request->user()?->id,
                            'resolved_at' => now(),
                            'note' => $validated['note'] ?? null,
                        ]);
                    }
                }

                $table = $order->table;
                if ($table && $table->status === 'reserved') {
                    $hasOtherActiveOrders = $table->orders()
                        ->where('id', '!=', $order->id)
                        ->whereIn('status', Order::OPERATIONAL_STATUSES)
                        ->exists();

                    if (! $hasOtherActiveOrders) {
                        $table->update([
                            'status' => 'available',
                            'reservation_name' => null,
                            'reservation_phone' => null,
                            'reservation_time' => null,
                            'reservation_note' => null,
                        ]);
                    }
                }

                OrderActivityLogger::log($order, 'reservation_cancelled', $request->user()?->id, array_filter([
                    'resolution' => $hasHeldDeposits ? $validated['deposit_resolution'] : null,
                    'note' => $validated['note'] ?? null,
                ]));

                return $table;
            });

            Cache::tags(['pos_tables'])->flush();

            if ($result) {
                $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result));
            }

            return response()->json(['success' => true]);

        } catch (\Exception $e) {
            Log::error('POS cancelReservation error: '.$e->getMessage());
            $status = $e->getCode() === 422 ? 422 : 500;

            return response()->json(['message' => $e->getMessage()], $status);
        }
    }

    public function checkInReservation(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'idempotency_key' => 'nullable|string',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'check_in_reservation', [
            'order_id' => $validated['order_id'],
        ])) {
            return response()->json(['success' => true]);
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $order = Order::with('table')->findOrFail($validated['order_id']);

                if ($order->status !== 'reserved') {
                    throw new \Exception('Đơn này không phải đơn đặt bàn chờ check-in', 422);
                }

                $order->update(['status' => 'draft']);

                $table = $order->table;
                if ($table) {
                    $table->update([
                        'status' => 'occupied',
                        'reservation_name' => null,
                        'reservation_phone' => null,
                        'reservation_time' => null,
                        'reservation_note' => null,
                    ]);
                }

                OrderActivityLogger::log($order, 'checked_in', $request->user()?->id);

                return $table;
            });

            Cache::tags(['pos_tables'])->flush();

            if ($result) {
                $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result));
            }

            return response()->json(['success' => true]);

        } catch (\Exception $e) {
            if ($e->getCode() === 422) {
                return response()->json(['error' => $e->getMessage()], 422);
            }
            Log::error('POS checkInReservation error: '.$e->getMessage());

            return response()->json(['error' => 'Check-in thất bại: '.$e->getMessage()], 500);
        }
    }

    public function reserve(Request $request)
    {
        $validated = $request->validate([
            'table_id' => 'required|integer|min:1|exists:tables,id',
            'reservation_name' => 'required|string|max:100',
            'reservation_phone' => 'required|string|max:20',
            'reservation_time' => 'required|date',
            'reservation_note' => 'nullable|string',
            'items' => 'nullable|array',
            'items.*.menu_item_id' => 'exists:menu_items,id',
            'items.*.quantity' => 'integer|min:1',
            'items.*.note' => 'nullable|string',
            'deposit' => 'nullable|array',
            'deposit.amount' => 'required_with:deposit|numeric|min:1',
            'deposit.method' => 'required_with:deposit|in:cash,bank_transfer',
            'idempotency_key' => 'nullable|string',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'reserve', [
            'table_id' => $validated['table_id'],
            'reservation_name' => $validated['reservation_name'],
            'reservation_time' => $validated['reservation_time'],
        ])) {
            return response()->json(['success' => true]);
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $table = Table::findOrFail($validated['table_id']);

                $subtotal = 0;
                $vatAmount = 0;
                $total = 0;
                $orderItems = [];

                if (! empty($validated['items'])) {
                    foreach ($validated['items'] as $itemData) {
                        $menuItem = MenuItem::find($itemData['menu_item_id']);
                        if (! $menuItem) {
                            continue;
                        }

                        $qty = $itemData['quantity'];
                        $price = $menuItem->price;
                        $itemSubtotal = $qty * $price;

                        // VAT calculation similar to sendToKitchen logic if applicable
                        // In POS flow, if sendToKitchen expects VAT, we calculate it here based on vat_rate
                        // Assuming vat_rate exists or is 0
                        $vatRate = $menuItem->vat_rate ?? 0;
                        $itemVat = $itemSubtotal * ($vatRate / 100);

                        $subtotal += $itemSubtotal;
                        $vatAmount += $itemVat;
                        $total += $itemSubtotal;

                        $orderItems[] = [
                            'menu_item_id' => $menuItem->id,
                            'quantity' => $qty,
                            'unit_price' => $price,
                            'subtotal' => $itemSubtotal,
                            'note' => $itemData['note'] ?? null,
                            'status' => 'pending',
                        ];
                    }
                }

                $employeeId = Employee::idForUser($request->user()?->id);
                $orderCode = $this->generateOrderCode($table);

                $order = Order::create([
                    'order_code' => $orderCode,
                    'table_id' => $table->id,
                    'employee_id' => $employeeId,
                    'subtotal' => $subtotal,
                    'vat_amount' => $vatAmount,
                    'total' => $total,
                    'status' => 'reserved',
                    'reservation_name' => $validated['reservation_name'],
                    'reservation_phone' => $validated['reservation_phone'],
                    'reservation_time' => $validated['reservation_time'],
                    'reservation_note' => $validated['reservation_note'] ?? null,
                ]);

                foreach ($orderItems as $item) {
                    $item['order_id'] = $order->id;
                    OrderItem::create($item);
                }

                $depositTotal = 0;
                if (! empty($validated['deposit'])) {
                    Deposit::create([
                        'order_id' => $order->id,
                        'amount' => $validated['deposit']['amount'],
                        'method' => $validated['deposit']['method'],
                        'status' => 'held',
                        'received_by_user_id' => $request->user()?->id,
                    ]);
                    $depositTotal = $validated['deposit']['amount'];

                    OrderActivityLogger::log($order, 'deposit_received', $request->user()?->id, [
                        'amount' => $validated['deposit']['amount'],
                        'method' => $validated['deposit']['method'],
                    ]);
                }

                OrderActivityLogger::log($order, 'reserved', $request->user()?->id, [
                    'name' => $validated['reservation_name'],
                    'time' => $validated['reservation_time'],
                ]);

                if ($table->status === 'available') {
                    $table->update([
                        'status' => 'reserved',
                        'reservation_name' => $validated['reservation_name'],
                        'reservation_phone' => $validated['reservation_phone'],
                        'reservation_time' => $validated['reservation_time'],
                        'reservation_note' => $validated['reservation_note'] ?? null,
                    ]);
                }

                return ['order' => $order, 'deposit_total' => $depositTotal, 'table' => $table];
            });

            Cache::tags(['pos_tables'])->flush();

            $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result['table']));

            return response()->json([
                'success' => true,
                'order' => array_merge($result['order']->toArray(), ['deposit_total' => $result['deposit_total']]),
            ]);

        } catch (\Throwable $e) {
            Log::error('POS reserve error: '.$e->getMessage());

            return response()->json(['error' => 'Đặt bàn thất bại: '.$e->getMessage()], 500);
        }
    }

    public function deposit(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'amount' => 'required|numeric|min:1',
            'method' => 'required|in:cash,bank_transfer',
            'idempotency_key' => 'nullable|string',
        ]);

        if (IdempotencyGuard::isDuplicate($request, 'deposit', [
            'order_id' => $validated['order_id'],
            'amount' => $validated['amount'],
            'method' => $validated['method'],
        ])) {
            return response()->json(['success' => true]);
        }

        try {
            $result = DB::transaction(function () use ($validated, $request) {
                $order = Order::with('table')->findOrFail($validated['order_id']);

                if (in_array($order->status, ['paid', 'cancelled'])) {
                    throw new \Exception('Không thể đặt cọc cho đơn đã thanh toán hoặc đã hủy', 422);
                }

                $order->deposits()->create([
                    'amount' => $validated['amount'],
                    'method' => $validated['method'],
                    'status' => 'held',
                    'received_by_user_id' => $request->user()?->id,
                ]);

                OrderActivityLogger::log($order, 'deposit_received', $request->user()?->id, [
                    'amount' => $validated['amount'],
                    'method' => $validated['method'],
                ]);

                return $order->table;
            });

            Cache::tags(['pos_tables'])->flush();

            if ($result) {
                $this->safeDispatch(fn () => TableStatusUpdated::dispatch($result));
            }

            return response()->json(['success' => true]);

        } catch (\Exception $e) {
            Log::error('POS deposit error: '.$e->getMessage());
            $status = $e->getCode() === 422 ? 422 : 500;

            return response()->json(['message' => $e->getMessage()], $status);
        }
    }
}
