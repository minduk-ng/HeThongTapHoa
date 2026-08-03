<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;

class PaymentsReportController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $rows = Invoice::query()
            ->with(['orders' => fn ($q) => $q->select('invoice_id', 'subtotal', 'discount_amount')])
            ->whereBetween('issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->orderByDesc('issued_at')
            ->get()
            ->values()
            ->map(fn ($i) => [
                'id' => $i->id,
                'invoice_code' => $i->invoice_code,
                'issued_at' => $i->issued_at?->toIso8601String(),
                'payment_method' => $i->payment_method,
                'table_name' => $i->table_name,
                'total_amount' => (float) $i->total_amount,
                'amount_received' => (float) $i->amount_received,
                'change_amount' => (float) $i->change_amount,
                'gross_amount' => (float) $i->orders->sum('subtotal'),
                'discount_amount' => (float) $i->orders->sum('discount_amount'),
            ]);

        $revenue = (float) $rows->sum('total_amount');

        $grossRevenue = (float) $rows->sum('gross_amount');
        $totalDiscount = (float) $rows->sum('discount_amount');
        $discountedCount = (int) $rows->where('discount_amount', '>', 0)->count();

        // Kỳ liền trước cùng độ dài.
        $start = Carbon::parse($startDate);
        $end = Carbon::parse($endDate);
        $dayCount = $start->diffInDays($end); // 0 => 1 ngày
        $prevEnd = $start->copy()->subDay();
        $prevStart = $prevEnd->copy()->subDays($dayCount);

        $prevRevenue = (float) Invoice::whereBetween('issued_at', [
            $prevStart->toDateString().' 00:00:00',
            $prevEnd->toDateString().' 23:59:59',
        ])->sum('total_amount');

        return Inertia::render('reports/PaymentsReport', [
            'rows' => $rows,
            'metrics' => [
                'revenue' => $revenue,
                'cash_total' => (float) $rows->where('payment_method', 'cash')->sum('total_amount'),
                'bank_total' => (float) $rows->where('payment_method', 'bank_transfer')->sum('total_amount'),
                'invoice_count' => $rows->count(),
                'gross_revenue' => $grossRevenue,
                'total_discount' => $totalDiscount,
                'discounted_invoice_count' => $discountedCount,
            ],
            'comparison' => [
                'prev_revenue' => $prevRevenue,
                'change_pct' => $prevRevenue > 0
                    ? round(($revenue - $prevRevenue) / $prevRevenue * 100, 1)
                    : null,
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
