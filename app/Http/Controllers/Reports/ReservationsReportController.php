<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ReservationsReportController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $rows = Order::with('table')
            ->withSum(
                ['deposits as deposit_total' => fn ($q) => $q->where('status', 'held')],
                'amount',
            )
            ->whereNotNull('reservation_name')
            ->whereBetween('reservation_time', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->orderBy('reservation_time')
            ->get()
            ->values()
            ->map(fn ($o) => [
                'id' => $o->id,
                'reservation_name' => $o->reservation_name,
                'reservation_phone' => $o->reservation_phone,
                'reservation_time' => $o->reservation_time?->toIso8601String(),
                'table_name' => $o->table?->table_number,
                'result' => match ($o->status) {
                    'paid' => 'arrived',
                    'cancelled' => 'cancelled',
                    default => 'pending',
                },
                'deposit_total' => (float) ($o->deposit_total ?? 0),
                'reservation_note' => $o->reservation_note,
            ]);

        return Inertia::render('reports/ReservationsReport', [
            'rows' => $rows,
            'metrics' => [
                'total' => $rows->count(),
                'arrived' => $rows->where('result', 'arrived')->count(),
                'cancelled' => $rows->where('result', 'cancelled')->count(),
                'deposit_total' => (float) $rows->sum('deposit_total'),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
