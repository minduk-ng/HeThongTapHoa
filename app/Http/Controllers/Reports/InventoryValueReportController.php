<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use Inertia\Inertia;
use Inertia\Response;

class InventoryValueReportController extends Controller
{
    public function index(): Response
    {
        $query = Ingredient::query();
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
            'cost_price' => round((float) $i->cost_price, 2),
            'value' => round((float) $i->stock_quantity * (float) $i->cost_price, 2),
        ]);
        $totalValue = round($rows->sum('value'), 2);

        return Inertia::render('reports/InventoryValueReport', [
            'rows' => $rows,
            'totalValue' => $totalValue,
            'startDate' => now()->toDateString(),
            'endDate' => now()->toDateString(),
            'filters' => request()->only(['search']),
        ]);
    }
}
