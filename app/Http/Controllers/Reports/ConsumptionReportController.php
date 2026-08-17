<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\InvoiceLine;
use App\Models\ProductRecipe;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class ConsumptionReportController extends Controller
{
    public function index(): Response
    {
        $from = request('from') ? Carbon::parse(request('from'))->startOfDay() : now()->startOfMonth();
        $to = request('to') ? Carbon::parse(request('to'))->endOfDay() : now();

        $lines = InvoiceLine::whereBetween('created_at', [$from, $to])
            ->where('quantity', '>', 0)
            ->get(['menu_item_id', 'quantity']);

        $recipes = ProductRecipe::with('ingredient')->whereIn('menu_item_id', $lines->pluck('menu_item_id')->unique())->get();

        $consume = collect();
        foreach ($lines as $line) {
            foreach ($recipes->where('menu_item_id', $line->menu_item_id) as $r) {
                $consume->put($r->ingredient_id, $consume->get($r->ingredient_id, 0) + (float) $r->amount * (int) $line->quantity);
            }
        }

        $rows = $consume->map(fn ($qty, $ingId) => [
            'name' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->name,
            'unit' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->unit,
            'quantity' => round($qty, 2),
            'cost' => round($qty * (float) $recipes->firstWhere('ingredient_id', $ingId)->ingredient->cost_price, 2),
        ])->values();

        return Inertia::render('reports/ConsumptionReport', [
            'rows' => $rows,
            'filters' => request()->only(['from', 'to']),
        ]);
    }
}
