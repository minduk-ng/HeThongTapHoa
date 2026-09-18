<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use App\Models\Invoice;
use Inertia\Inertia;
use Inertia\Response;

class SalesInvoiceReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $startDate = $request->startDate();
        $endDate = $request->endDate();
        $range = $request->dateRange();

        $baseQuery = Invoice::whereBetween('issued_at', $range);
        $count = (clone $baseQuery)->count();
        $revenue = (float) (clone $baseQuery)->sum('total_amount');
        $bankTransferCount = (clone $baseQuery)->where('payment_method', 'bank_transfer')->count();

        $invoices = (clone $baseQuery)->withCount('orders')->with('customer')
            ->orderByDesc('issued_at')
            ->get()
            ->values()
            ->map(fn (Invoice $invoice) => [
                'id' => $invoice->id,
                'invoice_code' => $invoice->invoice_code,
                'table_name' => $invoice->table_name,
                'customer_name' => $invoice->customer?->full_name,
                'payment_method' => $invoice->payment_method,
                'orders_count' => $invoice->orders_count,
                'total_amount' => (float) $invoice->total_amount,
                'gross_amount' => (float) $invoice->subtotal_amount,
                'discount_amount' => (float) $invoice->discount_amount,
                'amount_received' => (float) $invoice->amount_received,
                'change_amount' => (float) $invoice->change_amount,
                'issued_at' => $invoice->issued_at->toIso8601String(),
            ]);

        return Inertia::render('reports/SalesInvoiceReport', [
            'invoices' => $invoices,
            'metrics' => [
                'revenue' => $revenue,
                'invoice_count' => $count,
                'avg_invoice' => $count > 0 ? (int) round($revenue / $count) : 0,
                'bank_transfer_count' => $bankTransferCount,
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
