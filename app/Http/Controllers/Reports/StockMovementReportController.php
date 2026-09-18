<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use App\Models\StockVoucherItem;
use Inertia\Inertia;
use Inertia\Response;

class StockMovementReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $defaultStart = now()->startOfMonth()->toDateString();
        $defaultEnd = now()->toDateString();

        $startDate = $request->startDate($defaultStart);
        $endDate = $request->endDate($defaultEnd);
        $range = $request->dateRange($defaultStart, $defaultEnd);

        $items = StockVoucherItem::with(['voucher', 'ingredient'])
            ->whereHas('voucher', fn ($q) => $q->whereBetween('transacted_at', $range))
            ->get()
            ->groupBy('ingredient_id');

        $rows = $items->map(function ($group, $ingId) {
            $in = (float) $group->where('voucher.type', 'import')->sum('quantity');
            $outAbs = abs((float) $group->where('voucher.type', 'export')->sum('quantity'));
            $adj = (float) $group->where('voucher.type', 'adjustment')->sum('quantity');
            $ing = $group->first()->ingredient;
            $end = (float) $ing->stock_quantity;
            $begin = round($end - $in + $outAbs - $adj, 2);

            return [
                'ingredient_id' => $ingId,
                'name' => $ing->name,
                'unit' => $ing->unit,
                'begin_qty' => $begin,
                'import_qty' => round($in, 2),
                'export_qty' => round($outAbs, 2),
                'adjust_qty' => round($adj, 2),
                'end_qty' => $end,
            ];
        })->values();

        return Inertia::render('reports/StockMovementReport', [
            'rows' => $rows,
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
