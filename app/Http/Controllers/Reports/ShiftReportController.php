<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Shift;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ShiftReportController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $shifts = Shift::query()
            ->with(['openedBy:id,name', 'closedBy:id,name'])
            ->whereBetween('opened_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->orderByDesc('opened_at')
            ->get()
            ->map(function (Shift $shift) {
                $closing = $shift->closing_cash !== null ? (float) $shift->closing_cash : null;
                $actual = $shift->actual_cash !== null ? (float) $shift->actual_cash : null;

                return [
                    'id' => $shift->id,
                    'status' => $shift->status,
                    'opened_at' => $shift->opened_at?->toIso8601String(),
                    'closed_at' => $shift->closed_at?->toIso8601String(),
                    'opener_name' => $shift->openedBy?->name,
                    'closer_name' => $shift->closedBy?->name,
                    'opening_cash' => (float) $shift->opening_cash,
                    'closing_cash' => $closing,
                    'actual_cash' => $actual,
                    'difference' => ($closing !== null && $actual !== null) ? round($actual - $closing, 2) : null,
                    'note' => $shift->note,
                ];
            });

        $closed = $shifts->where('status', 'closed');

        return Inertia::render('reports/ShiftReport', [
            'rows' => $shifts,
            'metrics' => [
                'total_shift_count' => $shifts->count(),
                'open_count' => $shifts->where('status', 'open')->count(),
                'closed_count' => $closed->count(),
                'total_opening_cash' => (float) $shifts->sum('opening_cash'),
                'total_difference' => (float) $closed->sum('difference'),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
