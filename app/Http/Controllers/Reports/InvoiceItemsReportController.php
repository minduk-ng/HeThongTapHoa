<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Inertia\Inertia;

class InvoiceItemsReportController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $rows = Invoice::query()
            ->join('orders', 'orders.invoice_id', '=', 'invoices.id')
            ->join('order_items', 'order_items.order_id', '=', 'orders.id')
            ->join('menu_items', 'menu_items.id', '=', 'order_items.menu_item_id')
            ->whereBetween('invoices.issued_at', ["{$startDate} 00:00:00", "{$endDate} 23:59:59"])
            ->where('order_items.status', '!=', 'cancelled')
            ->orderByDesc('invoices.issued_at')
            ->get([
                'order_items.id as id',
                'invoices.id as invoice_id',
                'invoices.invoice_code',
                'invoices.issued_at',
                'invoices.table_name',
                'invoices.payment_method',
                'menu_items.name as item_name',
                'order_items.quantity',
                'order_items.unit_price',
                'order_items.subtotal',
                'orders.subtotal as order_subtotal',
                'orders.discount_amount as order_discount',
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
                'order_gross' => (float) ($r->order_subtotal + $r->order_discount),
                'order_discount' => (float) $r->order_discount,
                'payment_method' => $r->payment_method,
            ]);

        return Inertia::render('reports/InvoiceItemsReport', [
            'rows' => $rows,
            'metrics' => [
                'total_amount' => (float) $rows->sum('subtotal'),
                'line_count' => $rows->count(),
                'quantity_total' => (int) $rows->sum('quantity'),
                'invoice_count' => $rows->unique('invoice_id')->count(),
            ],
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }
}
