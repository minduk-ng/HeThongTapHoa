<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use App\Models\Order;
use Inertia\Inertia;
use Inertia\Response;

class ReservationsReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $startDate = $request->startDate();
        $endDate = $request->endDate();
        $range = $request->dateRange();

        $baseQuery = Order::whereNotNull('reservation_name')
            ->whereBetween('reservation_time', $range);

        $total = (clone $baseQuery)->count();
        $arrived = (clone $baseQuery)->where('status', 'paid')->count();
        $cancelled = (clone $baseQuery)->where('status', 'cancelled')->count();

        $rows = (clone $baseQuery)->with('table')
            ->withSum(
                ['deposits as deposit_total' => fn ($q) => $q->where('status', 'held')],
                'amount',
            )
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
                'total' => $total,
                'arrived' => $arrived,
                'cancelled' => $cancelled,
                'deposit_total' => (float) $rows->sum('deposit_total'),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
