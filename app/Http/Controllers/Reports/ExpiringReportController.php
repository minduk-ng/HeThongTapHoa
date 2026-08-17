<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\StockVoucherItem;
use Inertia\Inertia;
use Inertia\Response;

class ExpiringReportController extends Controller
{
    public function index(): Response
    {
        $rows = StockVoucherItem::with('ingredient')
            ->where('quantity_remaining', '>', 0)
            ->whereNotNull('expiry_date')
            ->orderBy('expiry_date', 'asc')
            ->get()
            ->map(fn ($it) => [
                'ingredient_name' => $it->ingredient?->name,
                'unit' => $it->ingredient?->unit,
                'expiry_date' => $it->expiry_date?->format('d/m/Y'),
                'days_left' => now()->diffInDays($it->expiry_date, false),
                'quantity_remaining' => round((float) $it->quantity_remaining, 2),
                'status' => $it->expiry_date->lt(now()) ? 'expired' : ($it->expiry_date->lte(now()->addDays(7)) ? 'soon' : 'ok'),
            ]);

        return Inertia::render('reports/ExpiringReport', [
            'rows' => $rows,
        ]);
    }
}
