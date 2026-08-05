<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\InvoiceLine;
use Illuminate\Http\Request;
use Inertia\Inertia;

class InvoiceItemsReportController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $rows = InvoiceLine::query()
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereBetween('invoices.issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->orderByDesc('invoices.issued_at')
            ->orderBy('invoice_lines.id')
            ->get([
                'invoice_lines.id as id', 'invoices.id as invoice_id', 'invoices.invoice_code',
                'invoices.issued_at', 'invoices.table_name', 'invoices.payment_method',
                'invoice_lines.name_snapshot as item_name', 'invoice_lines.quantity',
                'invoice_lines.unit_price', 'invoice_lines.subtotal', 'invoice_lines.discount_amount',
            ])
            ->values()
            ->map(fn ($r) => [
                'id' => $r->id,
                'invoice_id' => $r->invoice_id,
                'invoice_code' => $r->invoice_code,
                'issued_at' => $r->issued_at ? (string) $r->issued_at : null,
                'table_name' => $r->table_name,
                'item_name' => $r->item_name,
                'quantity' => (int) $r->quantity,
                'unit_price' => (float) $r->unit_price,
                'subtotal' => (float) $r->subtotal,
                'discount_amount' => (float) $r->discount_amount,
                'net' => (float) $r->subtotal - (float) $r->discount_amount,
                // order_gross/order_discount = value dòng đầu nhóm (invoice ≈ 1 order, giữ shape cũ).
                'order_gross' => (float) $r->subtotal,
                'order_discount' => (float) $r->discount_amount,
                'payment_method' => $r->payment_method,
            ]);

        return Inertia::render('reports/InvoiceItemsReport', [
            'rows' => $rows,
            'metrics' => [
                'total_amount' => (float) $rows->sum('net'),
                'total_discount' => (float) $rows->sum('discount_amount'),
                'line_count' => $rows->count(),
                'quantity_total' => (int) $rows->sum('quantity'),
                'invoice_count' => $rows->unique('invoice_id')->count(),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
