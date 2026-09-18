<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class CancelledReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $startDate = $request->startDate();
        $endDate = $request->endDate();
        $range = $request->dateRange();

        // Direct SQL aggregates for summary metrics
        $ordersQuery = Order::where('status', 'cancelled')->whereBetween('updated_at', $range);
        $cancelledOrdersCount = (clone $ordersQuery)->count();
        $cancelledOrdersValue = (float) (clone $ordersQuery)->sum('total');

        $itemsQuery = DB::table('order_items')
            ->where('status', 'cancelled')
            ->whereBetween('cancelled_at', $range);
        $cancelledItemsCount = (clone $itemsQuery)->count();
        $cancelledItemsValue = (float) (clone $itemsQuery)->sum('subtotal');

        // Đơn huỷ nguyên: mốc huỷ ~ updated_at (Order chưa có cột cancelled_at riêng).
        $cancelledOrders = (clone $ordersQuery)->with(['table', 'items'])
            ->orderByDesc('updated_at')
            ->limit(500)
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

        $cancelledItems = DB::table('order_items')
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
            ->limit(500)
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
                'cancelled_orders_count' => $cancelledOrdersCount,
                'cancelled_orders_value' => $cancelledOrdersValue,
                'cancelled_items_count' => $cancelledItemsCount,
                'cancelled_items_value' => $cancelledItemsValue,
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
            'pagination' => [
                'orders_total_count' => $cancelledOrdersCount,
                'items_total_count' => $cancelledItemsCount,
                'truncated' => $cancelledOrdersCount > 500 || $cancelledItemsCount > 500,
            ],
        ]);
    }
}
