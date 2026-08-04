<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\MenuCategory;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ProductDetailsReportController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $rows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('invoices', 'invoices.id', '=', 'orders.invoice_id')
            ->join('menu_items', 'menu_items.id', '=', 'order_items.menu_item_id')
            ->leftJoin('menu_categories', 'menu_categories.id', '=', 'menu_items.category_id')
            ->whereBetween('invoices.issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->where('order_items.status', '!=', 'cancelled')
            ->groupBy('menu_items.id', 'menu_items.name', 'menu_categories.name')
            ->selectRaw('menu_items.id as menu_item_id, menu_items.name as item_name, menu_categories.name as category_name, SUM(order_items.quantity) as quantity, SUM(order_items.subtotal - order_items.discount_amount) as revenue, SUM(order_items.discount_amount) as discount_amount')
            ->orderByDesc('revenue')
            ->get()
            ->values()
            ->map(fn ($r) => [
                'menu_item_id' => $r->menu_item_id,
                'item_name' => $r->item_name,
                'category_name' => $r->category_name,
                'quantity' => (int) $r->quantity,
                'revenue' => (float) $r->revenue,
                'discount_amount' => (float) $r->discount_amount,
            ]);

        return Inertia::render('reports/ProductDetailsReport', [
            'rows' => $rows,
            'metrics' => [
                'revenue' => (float) $rows->sum('revenue'),
                'quantity_total' => (int) $rows->sum('quantity'),
                'item_count' => $rows->count(),
                'top_item' => $rows->first()['item_name'] ?? null,
            ],
            'categories' => MenuCategory::orderBy('sort_order')->get(['id', 'name'])->values(),
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
