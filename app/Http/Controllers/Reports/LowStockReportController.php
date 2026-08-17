<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use Inertia\Inertia;
use Inertia\Response;

class LowStockReportController extends Controller
{
    public function index(): Response
    {
        $query = Ingredient::query()
            ->whereColumn('stock_quantity', '<=', 'min_stock_alert');
        if (request('search')) {
            $q = trim(request('search'));
            $query->where(fn ($b) => $b->where('name', 'like', "%{$q}%")->orWhere('code', 'like', "%{$q}%"));
        }

        $ingredients = $query->orderBy('name')->get();
        $rows = $ingredients->map(fn ($i) => [
            'id' => $i->id,
            'code' => $i->code,
            'name' => $i->name,
            'unit' => $i->unit,
            'stock_quantity' => round((float) $i->stock_quantity, 2),
            'min_stock_alert' => round((float) $i->min_stock_alert, 2),
            'cost_price' => round((float) $i->cost_price, 2),
            'value' => round((float) $i->stock_quantity * (float) $i->cost_price, 2),
            'status' => $i->stock_quantity <= 0 ? 'out' : ($i->stock_quantity <= $i->min_stock_alert * 0.2 ? 'critical' : 'low'),
            'suggest_qty' => max(0, round($i->min_stock_alert * 2 - $i->stock_quantity, 2)),
        ]);

        return Inertia::render('reports/LowStockReport', [
            'rows' => $rows,
            'filters' => request()->only(['search']),
        ]);
    }
}
