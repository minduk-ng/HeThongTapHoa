<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use App\Models\InvoiceLine;
use App\Models\ProductRecipe;
use Inertia\Inertia;
use Inertia\Response;

class ConsumptionReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $defaultStart = now()->startOfMonth()->toDateString();
        $defaultEnd = now()->toDateString();

        $startDate = $request->startDate($defaultStart);
        $endDate = $request->endDate($defaultEnd);
        $range = $request->dateRange($defaultStart, $defaultEnd);

        $lines = InvoiceLine::whereBetween('created_at', $range)
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
            'id' => $ingId,
            'name' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->name,
            'unit' => $recipes->firstWhere('ingredient_id', $ingId)->ingredient->unit,
            'quantity' => round($qty, 2),
            'cost' => round($qty * (float) $recipes->firstWhere('ingredient_id', $ingId)->ingredient->cost_price, 2),
        ])->values();

        return Inertia::render('reports/ConsumptionReport', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
