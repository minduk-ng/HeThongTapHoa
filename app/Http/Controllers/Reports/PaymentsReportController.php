<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Deposit;
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
            ->with(['payments' => fn ($q) => $q->select('invoice_id', 'method', 'amount')])
            ->whereBetween('issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->orderByDesc('issued_at')
            ->get()
            ->values()
            ->map(fn (Invoice $i) => [
                'id' => $i->id,
                'invoice_code' => $i->invoice_code,
                'issued_at' => $i->issued_at->toIso8601String(),
                'payment_method' => $i->payment_method,
                'table_name' => $i->table_name,
                'total_amount' => (float) $i->total_amount,
                'amount_received' => (float) $i->amount_received,
                'change_amount' => (float) $i->change_amount,
                'gross_amount' => (float) $i->subtotal_amount,
                'discount_amount' => (float) $i->discount_amount,
                'payments' => $i->payments->groupBy('method')->map(fn ($p) => (float) $p->sum('amount'))->toArray(),
            ]);

        $revenue = (float) $rows->sum('total_amount');

        $grossRevenue = (float) $rows->sum('gross_amount');
        $totalDiscount = (float) $rows->sum('discount_amount');
        $discountedCount = (int) $rows->where('discount_amount', '>', 0)->count();

        $cashTotal = (float) $rows->sum(fn ($r) => (float) ($r['payments']['cash'] ?? 0));
        $bankTotal = (float) $rows->sum(fn ($r) => (float) ($r['payments']['bank_transfer'] ?? 0));

        // Cọc đang giữ tạo trong kỳ (chưa có invoice — tiền thật đã thu)
        $heldDeposits = Deposit::query()
            ->where('status', 'held')
            ->whereBetween('created_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->get();

        $heldCash = (float) $heldDeposits->where('method', 'cash')->sum('amount');
        $heldBank = (float) $heldDeposits->where('method', 'bank_transfer')->sum('amount');
        $heldTotal = (float) $heldDeposits->sum('amount');

        // Cọc hoàn/trả trong kỳ (tiền đã ra khỏi máy)
        $refundedDeposits = Deposit::query()
            ->whereIn('status', ['refunded', 'forfeited'])
            ->whereBetween('resolved_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->get();

        $refundedCash = (float) $refundedDeposits->where('method', 'cash')->sum('amount');
        $refundedBank = (float) $refundedDeposits->where('method', 'bank_transfer')->sum('amount');
        $refundedTotal = (float) $refundedDeposits->sum('amount');

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
                'cash_total' => $cashTotal,
                'bank_total' => $bankTotal,
                'invoice_count' => $rows->count(),
                'gross_revenue' => $grossRevenue,
                'total_discount' => $totalDiscount,
                'discounted_invoice_count' => $discountedCount,
                'held_deposit_total' => $heldTotal,
                'held_deposit_cash' => $heldCash,
                'held_deposit_bank' => $heldBank,
                'held_deposit_count' => $heldDeposits->count(),
                'refunded_deposit_total' => $refundedTotal,
                'refunded_deposit_cash' => $refundedCash,
                'refunded_deposit_bank' => $refundedBank,
                'refunded_deposit_count' => $refundedDeposits->count(),
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
