<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\InvoiceLine;
use App\Models\ProductRecipe;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ProfitReportController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        // Giá vốn/phần theo menu_item: SUM(định lượng * cost_price).
        $recipeCost = ProductRecipe::query()
            ->join('ingredients', 'ingredients.id', '=', 'product_recipes.ingredient_id')
            ->selectRaw('product_recipes.menu_item_id as menu_item_id, SUM(product_recipes.amount * ingredients.cost_price) as cost')
            ->groupBy('product_recipes.menu_item_id')
            ->pluck('cost', 'menu_item_id');

        // Món bán trong kỳ kèm ngày phát hành (để dựng daily series).
        $items = InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->join('menu_items', 'menu_items.id', '=', 'invoice_lines.menu_item_id')
            ->whereBetween('invoices.issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->selectRaw('DATE(invoices.issued_at) as day, invoice_lines.menu_item_id as menu_item_id, invoice_lines.name_snapshot as item_name, SUM(invoice_lines.quantity) as quantity, SUM(invoice_lines.subtotal - invoice_lines.discount_amount) as revenue')
            ->groupBy('day', 'invoice_lines.menu_item_id', 'invoice_lines.name_snapshot')
            ->get()
            ->values();

        $soldIds = $items->pluck('menu_item_id')->unique();
        $missingRecipeCount = $soldIds->diff($recipeCost->keys())->count();

        // Gom theo món.
        $rows = $items
            ->groupBy('menu_item_id')
            ->map(function ($group) use ($recipeCost) {
                $qty = (int) $group->sum('quantity');
                $revenue = (float) $group->sum('revenue');
                $cost = $qty * (float) ($recipeCost[$group->first()->menu_item_id] ?? 0);
                $profit = $revenue - $cost;

                return [
                    'menu_item_id' => $group->first()->menu_item_id,
                    'item_name' => $group->first()->item_name,
                    'quantity' => $qty,
                    'revenue' => $revenue,
                    'cost' => $cost,
                    'profit' => $profit,
                    'margin' => $revenue > 0 ? round($profit / $revenue * 100, 1) : 0,
                ];
            })
            ->sortByDesc('profit')
            ->values();

        // Daily series theo ngày.
        $daily = $items
            ->groupBy('day')
            ->map(function ($group, $day) use ($recipeCost) {
                $revenue = (float) $group->sum('revenue');
                $cost = (float) $group->sum(
                    fn ($r) => (int) $r->quantity * (float) ($recipeCost[$r->menu_item_id] ?? 0),
                );

                return [
                    'label' => \Carbon\Carbon::parse($day)->format('d/m'),
                    'sort_key' => $day,
                    'revenue' => $revenue,
                    'profit' => $revenue - $cost,
                ];
            })
            ->sortBy('sort_key')
            ->values()
            ->map(fn ($d) => [
                'label' => $d['label'],
                'revenue' => $d['revenue'],
                'profit' => $d['profit'],
            ]);

        $revenue = (float) $rows->sum('revenue');
        $cost = (float) $rows->sum('cost');

        return Inertia::render('reports/ProfitReport', [
            'rows' => $rows,
            'metrics' => [
                'revenue' => $revenue,
                'cost' => $cost,
                'profit' => $revenue - $cost,
                'margin' => $revenue > 0 ? round(($revenue - $cost) / $revenue * 100, 1) : 0,
            ],
            'daily' => $daily,
            'missing_recipe_count' => $missingRecipeCount,
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
