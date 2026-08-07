<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CancelledReportController extends Controller
{
    public function index(Request $request): \Inertia\Response
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());
        $range = ["{$startDate} 00:00:00", "{$endDate} 23:59:59"];

        // Đơn huỷ nguyên: mốc huỷ ~ updated_at (Order chưa có cột cancelled_at riêng).
        $cancelledOrders = Order::with(['table', 'items'])
            ->where('status', 'cancelled')
            ->whereBetween('updated_at', $range)
            ->orderByDesc('updated_at')
            ->get()
            ->values()
            ->map(fn (Order $o) => [
                'id' => $o->id,
                'order_code' => $o->order_code,
                'table_name' => $o->table?->table_number,
                'item_count' => $o->items->count(),
                'total' => (float) $o->total,
                'cancelled_at' => $o->updated_at?->toIso8601String(),
                'note' => $o->note,
            ]);

        $cancelledItems = \Illuminate\Support\Facades\DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('menu_items', 'menu_items.id', '=', 'order_items.menu_item_id')
            ->leftJoin('users', 'users.id', '=', 'order_items.cancelled_by_user_id')
            ->where('order_items.status', 'cancelled')
            ->whereBetween('order_items.cancelled_at', $range)
            ->orderByDesc('order_items.cancelled_at')
            ->select([
                'order_items.id',
                'orders.order_code',
                'menu_items.name as item_name',
                'order_items.quantity',
                'order_items.subtotal',
                'order_items.cancellation_reason',
                'users.name as cancelled_by_name',
                'order_items.cancelled_at',
            ])
            ->get()
            ->values()
            ->map(fn (\stdClass $r) => [
                'id' => $r->id,
                'order_code' => $r->order_code,
                'item_name' => $r->item_name,
                'quantity' => (int) $r->quantity,
                'subtotal' => (float) $r->subtotal,
                'cancellation_reason' => $r->cancellation_reason,
                'cancelled_by_name' => $r->cancelled_by_name,
                'cancelled_at' => $r->cancelled_at ? (string) $r->cancelled_at : null,
            ]);

        return Inertia::render('reports/CancelledReport', [
            'cancelledOrders' => $cancelledOrders,
            'cancelledItems' => $cancelledItems,
            'metrics' => [
                'cancelled_orders_count' => $cancelledOrders->count(),
                'cancelled_orders_value' => (float) $cancelledOrders->sum('total'),
                'cancelled_items_count' => $cancelledItems->count(),
                'cancelled_items_value' => (float) $cancelledItems->sum('subtotal'),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
