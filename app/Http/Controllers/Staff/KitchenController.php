<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\InventoryTransaction;
use App\Models\Order;
use App\Models\ProductRecipe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class KitchenController extends Controller
{
    public function index(Request $request)
    {
        // Load active orders (pending / confirmed / processing)
        $activeOrders = Order::with(['table', 'items.menuItem'])
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

            return back()->with('success', 'Đã xác nhận hoàn thành đơn order và tự động trừ nguyên liệu kho thành công!');
        } catch (\Throwable $e) {
            Log::error('Kitchen completeOrder DB error: ' . $e->getMessage());
            return back()->withErrors(['error' => 'Hoàn thành đơn thất bại: Không thể kết nối hoặc lưu cơ sở dữ liệu. Vui lòng thử lại.']);
        }
    }
}
