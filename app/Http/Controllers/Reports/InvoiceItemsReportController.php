<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Http\Requests\Reports\DateRangeReportRequest;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class InvoiceItemsReportController extends Controller
{
    public function index(DateRangeReportRequest $request): Response
    {
        $startDate = $request->startDate();
        $endDate = $request->endDate();
        $range = $request->dateRange();

        $query = DB::table('invoice_lines')
            ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
            ->whereBetween('invoices.issued_at', $range);
        $totalCount = (clone $query)->count();
        // Summary tính trên toàn dải (SQL), không theo 500 dòng hiển thị.
        $gross = (float) (clone $query)->sum('invoice_lines.subtotal');
        $totalDiscount = (float) (clone $query)->sum('invoice_lines.discount_amount');
        $quantityTotal = (int) (clone $query)->sum('invoice_lines.quantity');
        $invoiceCount = (int) (clone $query)->distinct()->count('invoice_lines.invoice_id');
        $rows = $query
            ->orderByDesc('invoices.issued_at')
            ->orderBy('invoice_lines.id')
            ->select([
                'invoice_lines.id as id', 'invoices.id as invoice_id', 'invoices.invoice_code',
                'invoices.issued_at', 'invoices.table_name', 'invoices.payment_method',
                'invoice_lines.name_snapshot as item_name', 'invoice_lines.quantity',
                'invoice_lines.unit_price', 'invoice_lines.subtotal', 'invoice_lines.discount_amount',
            ])
            ->limit(500)
            ->get()
            ->values()
            ->map(fn (\stdClass $r) => [
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
                'total_amount' => $gross - $totalDiscount,
                'total_discount' => $totalDiscount,
                'line_count' => $totalCount,
                'quantity_total' => $quantityTotal,
                'invoice_count' => $invoiceCount,
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
            'pagination' => ['total_count' => $totalCount, 'truncated' => $totalCount > 500],
        ]);
    }
}
