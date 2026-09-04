<?php

namespace App\Http\Controllers\Staff;

use App\Events\ItemsReadyToServe;
use App\Events\OrderCompleted;
use App\Events\OrderSentToKitchen;
use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Staff\Concerns\DispatchesSafely;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Table;
use App\Services\OrderActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class KitchenController extends Controller
{
    use DispatchesSafely;

    public function index(Request $request): Response
    {
        // Load active orders excluding cancelled items
        $activeOrders = Order::with(['table', 'items' => function ($query) {
            $query->where('status', '!=', 'cancelled')->with('menuItem.category');
        }])
            ->where(function ($q) {
                $q->whereIn('status', ['pending', 'confirmed', 'processing'])
                    ->orWhere(function ($q2) {
                        $q2->where('status', 'paid')
                            ->whereHas('items', fn ($i) => $i->whereIn('status', ['pending', 'processing']));
                    });
            })
            ->orderBy('created_at', 'asc')
            ->get();

        // Calculate KPI Statistics
        $totalOrdersCount = $activeOrders->count();

        // Sum of all items in active open orders needing preparation
        $waitingItemsCount = $activeOrders->reduce(function ($sum, $order) {
            return $sum + $order->items->sum('quantity');
        }, 0);

        // Orders completed today
        $completedTodayCount = Order::where('status', 'completed')
            ->whereDate('updated_at', now()->today())
            ->count();

        // Warning count: orders waiting > 10 minutes OR has additional items calls
        $warningOrdersCount = $activeOrders->filter(function ($order) {
            $oldestPendingItem = $order->items
                ->where('status', 'pending')
                ->sortBy('created_at')
                ->first();

            $referenceTime = $oldestPendingItem ? $oldestPendingItem->created_at : $order->created_at;
            $isOver10Mins = $referenceTime ? $referenceTime->diffInMinutes(now()) >= 10 : false;

            return $isOver10Mins || $order->has_additional_items;
        })->count();

        return Inertia::render('staff/kitchen/KitchenDisplay', [
            'orders' => $activeOrders,
            'stats' => [
                'total_orders' => $totalOrdersCount,
                'waiting_items' => $waitingItemsCount,
                'completed_items' => $completedTodayCount,
                'warning_orders' => $warningOrdersCount,
            ],
        ]);
    }

    public function completeOrder(Request $request, Order $order): RedirectResponse|JsonResponse
    {
        $request->validate(['idempotency_key' => 'nullable|string|max:100']);

        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:kitchen_complete:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                Log::info("Duplicate kitchen completeOrder suppressed: {$request->input('idempotency_key')}");

                return $request->wantsJson()
                    ? response()->json(['success' => true, 'message' => 'Đơn đã được hoàn thành!'])
                    : back()->with('success', 'Đơn đã được hoàn thành!');
            }
        }

        if (in_array($order->status, ['paid', 'cancelled'], true)) {
            return $request->wantsJson()
                ? response()->json(['error' => 'Đơn đã thanh toán hoặc đã hủy.'], 422)
                : back()->withErrors(['error' => 'Đơn đã thanh toán hoặc đã hủy.']);
        }

        try {
            $completedItems = collect();
            $skipped = false;

            DB::transaction(function () use ($order, $request, &$completedItems, &$skipped) {
                $order = Order::where('id', $order->id)->lockForUpdate()->first();
                if (! $order || in_array($order->status, ['paid', 'cancelled', 'completed'], true)) {
                    $skipped = true;

                    return;
                }

                $order->update([
                    'status' => 'completed',
                    'has_additional_items' => false,
                ]);

                foreach ($order->items as $it) {
                    if ($it->status === 'cancelled' || $it->status === 'completed') {
                        continue;
                    }

                    $updated = OrderItem::where('id', $it->id)
                        ->whereIn('status', ['pending', 'processing'])
                        ->update(['status' => 'completed']);

                    if ($updated === 1) {
                        $completedItems->push($it);
                    }
                }

                // Audit log: completed
                OrderActivityLogger::log($order, 'completed', $request->user()?->id, [
                    'items' => $completedItems->map(fn (OrderItem $i) => ['name' => $i->menuItem->name ?? 'Món', 'qty' => $i->quantity])->toArray(),
                ]);
            });

            if (! $skipped) {
                $this->safeDispatch(fn () => OrderCompleted::dispatch($order));

                if ($completedItems->isNotEmpty()) {
                    $this->safeDispatch(fn () => ItemsReadyToServe::dispatch($order, $completedItems));
                }
            }

            if ($request->wantsJson()) {
                return response()->json(['success' => true, 'message' => 'Đã xác nhận hoàn thành.']);
            }

            return back()->with('success', 'Đã xác nhận hoàn thành đơn order!');
        } catch (\Throwable $e) {
            Log::error('Kitchen completeOrder DB error: '.$e->getMessage());

            return $request->wantsJson()
                ? response()->json(['error' => 'Hoàn thành thất bại: '.$e->getMessage()], 422)
                : back()->withErrors(['error' => 'Hoàn thành đơn thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
        }
    }

    public function completeItems(Request $request): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'item_ids' => 'required|array|min:1',
            'item_ids.*' => 'exists:order_items,id',
        ]);

        $validated['idempotency_key'] = $request->input('idempotency_key');
        if ($request->filled('idempotency_key')) {
            $lockKey = "idempotency:kitchen_complete_items:{$request->input('idempotency_key')}";
            if (! Cache::add($lockKey, true, 30)) {
                Log::info("Duplicate kitchen completeItems suppressed: {$request->input('idempotency_key')}");

                return $request->wantsJson()
                    ? response()->json(['success' => true, 'message' => 'Các món đã được hoàn thành!'])
                    : back()->with('success', 'Các món đã được hoàn thành!');
            }
        }

        try {
            $order = Order::query()->where('id', $validated['order_id'])->firstOrFail();

            $completedItems = collect();
            $skipped = false;

            DB::transaction(function () use ($validated, $order, $request, &$completedItems, &$skipped) {
                $order = Order::where('id', $order->id)->lockForUpdate()->first();
                if (! $order || $order->status === 'cancelled') {
                    $skipped = true;

                    return;
                }

                $completedItems = OrderItem::whereIn('id', $validated['item_ids'])
                    ->where('order_id', $order->id)
                    ->whereIn('status', ['pending', 'processing'])
                    ->get();

                foreach ($completedItems as $del) {
                    OrderItem::where('id', $del->id)
                        ->whereIn('status', ['pending', 'processing'])
                        ->update(['status' => 'completed']);
                }

                $remainingActive = $order->items()
                    ->whereNotIn('status', ['cancelled', 'completed'])
                    ->count();

                if ($remainingActive === 0 && ! in_array($order->status, ['paid', 'cancelled'], true)) {
                    $order->update([
                        'status' => 'completed',
                        'has_additional_items' => false,
                    ]);
                }

                // Audit log: completed (partial)
                OrderActivityLogger::log($order, 'completed', $request->user()?->id, [
                    'items' => $completedItems->map(fn (OrderItem $i) => ['name' => $i->menuItem->name ?? 'Món', 'qty' => $i->quantity])->toArray(),
                    'partial' => $remainingActive > 0,
                ]);
            });

            if (! $skipped) {
                $this->safeDispatch(fn () => OrderCompleted::dispatch($order));

                if ($completedItems->isNotEmpty()) {
                    $this->safeDispatch(fn () => ItemsReadyToServe::dispatch($order, $completedItems));
                }
            }

            if ($request->wantsJson()) {
                return response()->json(['success' => true, 'message' => 'Đã xác nhận hoàn thành.']);
            }

            return back()->with('success', 'Đã xác nhận hoàn thành các món đã chọn!');
        } catch (\Throwable $e) {
            Log::error('Kitchen completeItems DB error: '.$e->getMessage());

            return $request->wantsJson()
                ? response()->json(['error' => 'Hoàn thành thất bại: '.$e->getMessage()], 422)
                : back()->withErrors(['error' => 'Hoàn thành món thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
        }
    }

    public function cancelItem(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'order_item_id' => 'required|exists:order_items,id',
            'cancellation_reason' => 'required|string|max:255',
            'note' => 'nullable|string|max:255',
        ]);

        try {
            $targetTable = null;
            $targetOrder = null;

            DB::transaction(function () use ($validated, $request, &$targetTable, &$targetOrder) {
                $item = OrderItem::where('id', $validated['order_item_id'])->first();

                if (! $item) {
                    throw new \InvalidArgumentException('Món không tồn tại.');
                }

                $order = $item->order;
                $targetOrder = $order;
                $targetTable = $order->table ?? Table::find($order->table_id);

                $reasonStr = $validated['cancellation_reason'].(! empty($validated['note']) ? ': '.$validated['note'] : '');

                // Atomic transition: chi thang neu chua cancelled
                $updated = OrderItem::where('id', $item->id)
                    ->where('status', '<>', 'cancelled')
                    ->update([
                        'status' => 'cancelled',
                        'cancellation_reason' => $reasonStr,
                        'cancelled_by_user_id' => $request->user()?->id,
                        'cancelled_at' => now(),
                    ]);

                if ($updated === 0) {
                    return; // da huy boi nguon khac — khong restore
                }

                $remainingActiveCount = $order->items()->where('status', '!=', 'cancelled')->count();
                if ($remainingActiveCount === 0 && ! in_array($order->fresh()->status, ['paid', 'cancelled'], true)) {
                    $order->update(['status' => 'cancelled']);
                    if ($targetTable) {
                        $hasOtherActiveOrders = Order::where('table_id', $targetTable->id)
                            ->where('id', '!=', $order->id)
                            ->whereIn('status', Order::ACTIVE_STATUSES)
                            ->whereHas('items', fn ($q) => $q->where('status', '!=', 'cancelled'))
                            ->exists();

                        if (! $hasOtherActiveOrders) {
                            $targetTable->update(['status' => 'available', 'merged_into_table_id' => null]);
                        }
                    }
                }
            });

            $this->safeDispatch(function () use ($targetTable, $targetOrder, $validated) {
                $cancelMsg = 'Hủy / giảm món (Lý do: '.$validated['cancellation_reason'].')';
                OrderSentToKitchen::dispatch(
                    $targetOrder ?? Order::first() ?? new Order,
                    'cancel_item',
                    $cancelMsg
                );
                if ($targetTable) {
                    TableStatusUpdated::dispatch($targetTable);
                }
            });

            return back()->with('success', 'Hủy món thành công!');
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            Log::error('Kitchen cancelItem DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Hủy món thất bại: '.$e->getMessage()]);
        }
    }
}
