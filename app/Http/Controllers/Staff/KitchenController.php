<?php

namespace App\Http\Controllers\Staff;

use App\Events\ItemsReadyToServe;
use App\Events\OrderCompleted;
use App\Events\OrderSentToKitchen;
use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\InventoryTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Employee;
use App\Models\ProductRecipe;
use App\Models\Table;
use App\Services\InventoryIngredientService;
use App\Services\OrderActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class KitchenController extends Controller
{
    public function __construct(
        private InventoryIngredientService $inventoryIngredientService
    ) {
    }

    public function index(Request $request)
    {
        // Load active orders excluding cancelled items
        $activeOrders = Order::with(['table', 'items' => function ($query) {
            $query->where('status', '!=', 'cancelled')->with('menuItem.category');
        }])
            ->whereIn('status', ['pending', 'confirmed', 'processing'])
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

    public function completeOrder(Request $request, Order $order)
    {
        try {
            $completedItems = collect();

            DB::transaction(function () use ($order, $request, &$completedItems) {
                $order->update([
                    'status' => 'completed',
                    'has_additional_items' => false,
                ]);

                $employeeId = Employee::idForUser($request->user()?->id);

                foreach ($order->items as $item) {
                    if ($item->status === 'cancelled' || $item->status === 'completed') {
                        continue;
                    }

                    $item->update([
                        'status' => 'completed',
                    ]);

                    $completedItems->push($item);

                    $this->deductIngredients($item, $employeeId, $order->order_code);
                }

                // Audit log: completed
                OrderActivityLogger::log($order, 'completed', $request->user()?->id, [
                    'items' => $completedItems->map(fn ($i) => ['name' => $i->menuItem?->name ?? 'Món', 'qty' => $i->quantity])->toArray(),
                ]);
            });

            $this->safeDispatch(fn () => OrderCompleted::dispatch($order));

            if ($completedItems->isNotEmpty()) {
                $this->safeDispatch(fn () => ItemsReadyToServe::dispatch($order, $completedItems));
            }

            return back()->with('success', 'Đã xác nhận hoàn thành đơn order và tự động trừ nguyên liệu kho thành công!');
        } catch (\Throwable $e) {
            Log::error('Kitchen completeOrder DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Hoàn thành đơn thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
        }
    }

    public function completeItems(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'item_ids' => 'required|array|min:1',
            'item_ids.*' => 'exists:order_items,id',
        ]);

        try {
            $order = Order::findOrFail($validated['order_id']);
            $employeeId = Employee::idForUser($request->user()?->id);

            $completedItems = collect();

            DB::transaction(function () use ($validated, $order, $employeeId, $request, &$completedItems) {
                $completedItems = OrderItem::whereIn('id', $validated['item_ids'])
                    ->where('order_id', $order->id)
                    ->whereIn('status', ['pending', 'processing'])
                    ->get();

                foreach ($completedItems as $item) {
                    $item->update(['status' => 'completed']);
                    $this->deductIngredients($item, $employeeId, $order->order_code);
                }

                $remainingActive = $order->items()
                    ->whereNotIn('status', ['cancelled', 'completed'])
                    ->count();

                if ($remainingActive === 0) {
                    $order->update([
                        'status' => 'completed',
                        'has_additional_items' => false,
                    ]);
                }

                // Audit log: completed (partial)
                OrderActivityLogger::log($order, 'completed', $request->user()?->id, [
                    'items' => $completedItems->map(fn ($i) => ['name' => $i->menuItem?->name ?? 'Món', 'qty' => $i->quantity])->toArray(),
                    'partial' => $remainingActive > 0,
                ]);
            });

            $this->safeDispatch(fn () => OrderCompleted::dispatch($order));

            if ($completedItems->isNotEmpty()) {
                $this->safeDispatch(fn () => ItemsReadyToServe::dispatch($order, $completedItems));
            }

            return back()->with('success', 'Đã xác nhận hoàn thành các món đã chọn và tự động trừ nguyên liệu kho thành công!');
        } catch (\Throwable $e) {
            Log::error('Kitchen completeItems DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Hoàn thành món thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
        }
    }

    private function deductIngredients(OrderItem $item, ?int $employeeId, string $orderCode): void
    {
        $recipes = ProductRecipe::where('menu_item_id', $item->menu_item_id)->get();
        foreach ($recipes as $recipe) {
            $ingredient = Ingredient::find($recipe->ingredient_id);
            if ($ingredient) {
                $deductQuantity = (float) $recipe->amount * (int) $item->quantity;
                $ingredient->decrement('stock_quantity', $deductQuantity);

                InventoryTransaction::create([
                    'ingredient_id' => $ingredient->id,
                    'employee_id' => $employeeId,
                    'type' => 'export',
                    'quantity' => $deductQuantity,
                    'reason' => "Xuất kho tự động cho đơn {$orderCode}",
                    'transacted_at' => now(),
                ]);
            }
        }
    }

    public function cancelItem(Request $request)
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
                if ($order) {
                    $targetOrder = $order;
                    $targetTable = $order->table ?? Table::find($order->table_id);
                }

                $reasonStr = $validated['cancellation_reason'].(! empty($validated['note']) ? ': '.$validated['note'] : '');

                $wasCompleted = $item->status === 'completed';

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

                // Chi restore neu item thuc su dang completed truoc khi huy
                if ($wasCompleted) {
                    $this->inventoryIngredientService->restoreIngredients(
                        $item,
                        $request->user()?->id,
                        $order?->order_code ?? ''
                    );
                }

                if ($order) {
                    $remainingActiveCount = $order->items()->where('status', '!=', 'cancelled')->count();
                    if ($remainingActiveCount === 0) {
                        $order->update(['status' => 'cancelled']);
                        if ($targetTable) {
                            $hasOtherActiveOrders = Order::where('table_id', $targetTable->id)
                                ->where('id', '!=', $order->id)
                                ->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])
                                ->whereHas('items', fn ($q) => $q->where('status', '!=', 'cancelled'))
                                ->exists();

                            if (! $hasOtherActiveOrders) {
                                $targetTable->update(['status' => 'available', 'merged_into_table_id' => null]);
                            }
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

    private function safeDispatch(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            Log::warning('Reverb Broadcast skipped due to socket connection issue: '.$e->getMessage());
        }
    }
}
