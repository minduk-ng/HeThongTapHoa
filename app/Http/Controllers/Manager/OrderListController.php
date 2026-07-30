<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;
use Inertia\Inertia;

class OrderListController extends Controller
{
    public function index(Request $request)
    {
        $startDate = $request->input('start_date', today()->toDateString());
        $endDate = $request->input('end_date', today()->toDateString());

        $orders = Order::with(['table', 'items.menuItem', 'invoice'])
            ->whereBetween('created_at', [
                "{$startDate} 00:00:00",
                "{$endDate} 23:59:59",
            ])
            ->orderByDesc('created_at')
            ->get()
            ->map(function ($order) {
                return [
                    'id' => $order->id,
                    'order_code' => $order->order_code,
                    'table_number' => $order->table?->table_number,
                    'status' => $order->status,
                    'total' => (float) $order->total,
                    'item_count' => $order->items->where('status', '!=', 'cancelled')->count(),
                    'payment_method' => $order->invoice?->payment_method,
                    'invoice_code' => $order->invoice?->invoice_code,
                    'created_at' => $order->created_at?->toIso8601String(),
                ];
            });

        $summary = [
            'total_orders' => $orders->count(),
            'open_orders' => $orders->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->count(),
            'paid_orders' => $orders->where('status', 'paid')->count(),
            'cancelled_orders' => $orders->where('status', 'cancelled')->count(),
        ];

        return Inertia::render('manager/orders/OrderList', [
            'orders' => $orders,
            'summary' => $summary,
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);
    }

    public function show(Order $order)
    {
        $order->load([
            'table',
            'items.menuItem',
            'invoice',
            'activities.user',
            'deposits.receivedBy',
        ]);

        return Inertia::render('manager/orders/OrderDetail', [
            'order' => [
                'id' => $order->id,
                'order_code' => $order->order_code,
                'table_number' => $order->table?->table_number,
                'status' => $order->status,
                'subtotal' => (float) $order->subtotal,
                'vat_amount' => (float) $order->vat_amount,
                'total' => (float) $order->total,
                'deposit_total' => (float) $order->deposits()->sum('amount'),
                'deposits' => $order->deposits->map(fn ($d) => [
                    'id' => $d->id,
                    'amount' => (float) $d->amount,
                    'method' => $d->method,
                    'status' => $d->status,
                    'note' => $d->note,
                    'received_by_name' => $d->receivedBy?->name ?? 'Hệ thống',
                    'created_at' => $d->created_at?->toIso8601String(),
                ]),
                'created_at' => $order->created_at?->toIso8601String(),
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'name' => $item->menuItem?->name ?? 'Món',
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'subtotal' => (float) $item->subtotal,
                    'note' => $item->note,
                    'status' => $item->status,
                    'served_at' => $item->served_at?->toIso8601String(),
                    'cancellation_reason' => $item->cancellation_reason,
                ]),
                'invoice' => $order->invoice ? [
                    'invoice_code' => $order->invoice->invoice_code,
                    'payment_method' => $order->invoice->payment_method,
                    'total_amount' => (float) $order->invoice->total_amount,
                    'amount_received' => (float) $order->invoice->amount_received,
                    'change_amount' => (float) $order->invoice->change_amount,
                    'issued_at' => $order->invoice->issued_at?->toIso8601String(),
                ] : null,
                'invoice_sibling_count' => $order->invoice_id
                    ? Order::where('invoice_id', $order->invoice_id)->where('id', '!=', $order->id)->count()
                    : 0,
                'activities' => $order->activities->map(fn ($a) => [
                    'id' => $a->id,
                    'action' => $a->action,
                    'user_name' => $a->user?->name ?? 'Hệ thống',
                    'meta' => $a->meta,
                    'created_at' => $a->created_at?->toIso8601String(),
                ]),
            ],
        ]);
    }
}
