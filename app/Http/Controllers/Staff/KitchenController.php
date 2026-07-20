<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Table;
use Illuminate\Http\Request;
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
        $order->update([
            'status' => 'completed',
            'has_additional_items' => false,
        ]);

        return back()->with('success', 'Đã xác nhận hoàn thành đơn order!');
    }
}
