<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use App\Models\Deposit;
use App\Models\Invoice;
use Carbon\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class PaymentsReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $startDate = $request->startDate();
        $endDate = $request->endDate();
        $range = $request->dateRange();

        $invoiceQuery = Invoice::query()->whereBetween('issued_at', $range);
        $revenue = (float) (clone $invoiceQuery)->sum('total_amount');
        $grossRevenue = (float) (clone $invoiceQuery)->sum('subtotal_amount');
        $totalDiscount = (float) (clone $invoiceQuery)->sum('discount_amount');
        $discountedCount = (clone $invoiceQuery)->where('discount_amount', '>', 0)->count();
        $invoiceCount = (clone $invoiceQuery)->count();

        $rows = (clone $invoiceQuery)
            ->with(['payments' => fn ($q) => $q->select('invoice_id', 'method', 'amount')])
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

        $cashTotal = (float) $rows->sum(fn ($r) => (float) ($r['payments']['cash'] ?? 0));
        $bankTotal = (float) $rows->sum(fn ($r) => (float) ($r['payments']['bank_transfer'] ?? 0));

        // Cọc đang giữ tạo trong kỳ (chưa có invoice — tiền thật đã thu)
        $heldQuery = Deposit::query()
            ->where('status', 'held')
            ->whereBetween('created_at', $range);

        $heldTotal = (float) (clone $heldQuery)->sum('amount');
        $heldCash = (float) (clone $heldQuery)->where('method', 'cash')->sum('amount');
        $heldBank = (float) (clone $heldQuery)->where('method', 'bank_transfer')->sum('amount');
        $heldCount = (clone $heldQuery)->count();

        // Cọc hoàn/trả trong kỳ (tiền đã ra khỏi máy)
        $refundedQuery = Deposit::query()
            ->whereIn('status', ['refunded', 'forfeited'])
            ->whereBetween('resolved_at', $range);

        $refundedTotal = (float) (clone $refundedQuery)->sum('amount');
        $refundedCash = (float) (clone $refundedQuery)->where('method', 'cash')->sum('amount');
        $refundedBank = (float) (clone $refundedQuery)->where('method', 'bank_transfer')->sum('amount');
        $refundedCount = (clone $refundedQuery)->count();

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
                'invoice_count' => $invoiceCount,
                'gross_revenue' => $grossRevenue,
                'total_discount' => $totalDiscount,
                'discounted_invoice_count' => $discountedCount,
                'held_deposit_total' => $heldTotal,
                'held_deposit_cash' => $heldCash,
                'held_deposit_bank' => $heldBank,
                'held_deposit_count' => $heldCount,
                'refunded_deposit_total' => $refundedTotal,
                'refunded_deposit_cash' => $refundedCash,
                'refunded_deposit_bank' => $refundedBank,
                'refunded_deposit_count' => $refundedCount,
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
