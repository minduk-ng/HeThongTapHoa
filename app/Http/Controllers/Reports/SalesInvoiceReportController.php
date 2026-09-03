<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SalesInvoiceReportController extends Controller
{
    public function index(Request $request): \Inertia\Response
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $invoices = Invoice::withCount('orders')->with('customer')
            ->whereBetween('issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
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

        $count = $invoices->count();
        $revenue = (float) $invoices->sum('total_amount');

        return Inertia::render('reports/SalesInvoiceReport', [
            'invoices' => $invoices,
            'metrics' => [
                'revenue' => $revenue,
                'invoice_count' => $count,
                'avg_invoice' => $count > 0 ? (int) round($revenue / $count) : 0,
                'bank_transfer_count' => $invoices->where('payment_method', 'bank_transfer')->count(),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
