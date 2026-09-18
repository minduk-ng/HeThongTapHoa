<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use App\Models\MenuCategory;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ProductDetailsReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $query = DB::table('invoice_lines')
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereBetween('invoices.issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->join('menu_items', 'menu_items.id', '=', 'invoice_lines.menu_item_id')
            ->leftJoin('menu_categories', 'menu_categories.id', '=', 'menu_items.category_id')
            ->groupBy('invoice_lines.menu_item_id', 'invoice_lines.name_snapshot', 'menu_categories.name')
            ->selectRaw('invoice_lines.menu_item_id, invoice_lines.name_snapshot as item_name, menu_categories.name as category_name, SUM(invoice_lines.quantity) as quantity, SUM(invoice_lines.subtotal - invoice_lines.discount_amount) as revenue, SUM(invoice_lines.discount_amount) as discount_amount');
        $totalCount = DB::query()->fromSub(clone $query, 'product_rows')->count();
        $rows = $query->orderByDesc('revenue')->limit(500)
            ->get()
            ->values()
            ->map(fn (\stdClass $r) => [
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
            'pagination' => ['total_count' => $totalCount, 'truncated' => $totalCount > 500],
        ]);
    }
}
