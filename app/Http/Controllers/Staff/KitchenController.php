<?php

namespace App\Http\Controllers\Staff;

use App\Events\OrderCompleted;
use App\Events\OrderSentToKitchen;
use App\Events\TableStatusUpdated;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\InventoryTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductRecipe;
use App\Models\Table;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class KitchenController extends Controller
{
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
            $isOver10Mins = $order->created_at ? $order->created_at->diffInMinutes(now()) >= 10 : false;

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
            DB::transaction(function () use ($order, $request) {
                $order->update([
                    'status' => 'completed',
                    'has_additional_items' => false,
                ]);

                $employeeId = DB::table('employees')->where('id', $request->user()?->id)->exists() ? $request->user()->id : null;

                foreach ($order->items as $item) {
                    if ($item->status === 'cancelled' || $item->status === 'completed') {
                        continue;
                    }

                    $item->update([
                        'status' => 'completed',
                    ]);

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
                                'reason' => "Xuất kho tự động cho đơn {$order->order_code}",
                                'transacted_at' => now(),
                            ]);
                        }
                    }
                }
            });

            $this->safeDispatch(fn () => OrderCompleted::dispatch($order));

            return back()->with('success', 'Đã xác nhận hoàn thành đơn order và tự động trừ nguyên liệu kho thành công!');
        } catch (\Throwable $e) {
            Log::error('Kitchen completeOrder DB error: '.$e->getMessage());

            return back()->withErrors(['error' => 'Hoàn thành đơn thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
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
                $item = OrderItem::lockForUpdate()->findOrFail($validated['order_item_id']);

                if ($item->status === 'cancelled') {
                    return;
                }

                $order = $item->order;
                if ($order) {
                    $targetOrder = $order;
                    $targetTable = $order->table ?? Table::find($order->table_id);
                }

                $reasonStr = $validated['cancellation_reason'].($validated['note'] ? ': '.$validated['note'] : '');

                $item->update([
                    'status' => 'cancelled',
                    'cancellation_reason' => $reasonStr,
                    'cancelled_by_user_id' => $request->user()?->id,
                    'cancelled_at' => now(),
                ]);

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
