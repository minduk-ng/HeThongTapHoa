<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class ServingController extends Controller
{
    public function index(): Response
    {
        $servingQueue = $this->buildServingQueue();

        return Inertia::render('staff/serving/ServingDisplay', [
            'servingQueue' => $servingQueue,
        ]);
    }

    public function markServed(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_ids' => 'required|array|min:1',
            'item_ids.*' => 'required|integer|exists:order_items,id',
        ]);

        try {
            $count = OrderItem::whereIn('id', $validated['item_ids'])
                ->where('status', 'completed')
                ->whereNull('served_at')
                ->update(['served_at' => now()]);

            return response()->json([
                'success' => true,
                'served_count' => $count,
                'message' => 'Đã đánh dấu phục vụ thành công!',
            ]);
        } catch (\Throwable $e) {
            Log::error('Serving markServed error: '.$e->getMessage());

            return response()->json(['error' => 'Đánh dấu phục vụ thất bại.'], 500);
        }
    }

    private function buildServingQueue(): array
    {
        return OrderItem::with(['order.table', 'menuItem'])
            ->where('status', 'completed')
            ->whereNull('served_at')
            ->whereHas('order', fn ($q) => $q->whereDate('created_at', today()))
            ->orderBy('updated_at', 'asc')
            ->get()
            ->groupBy('order_id')
            ->map(function ($orderItems, $orderId) {
                $first = $orderItems->first();
                $order = $first->order;

                return [
                    'id' => $orderId.'_'.$order->updated_at?->timestamp,
                    'order_id' => $orderId,
                    'order_code' => $order->order_code,
                    'table_number' => $order->table?->table_number ?? 'Mang về',
                    'table_area' => $order->table?->area ?? '',
                    'items' => $orderItems->map(fn ($i) => [
                        'id' => $i->id,
                        'name' => $i->menuItem?->name ?? 'Món ăn',
                        'quantity' => $i->quantity,
                        'note' => $i->note,
                    ])->values()->toArray(),
                    'completed_at' => $orderItems->max('updated_at')?->toIso8601String(),
                ];
            })
            ->values()
            ->toArray();
    }
}
