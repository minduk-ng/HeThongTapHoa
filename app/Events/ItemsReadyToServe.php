<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ItemsReadyToServe implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Order $order,
        public $completedItems,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('pos-channel'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'ItemsReadyToServe';
    }

    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->order->id,
            'order_code' => $this->order->order_code,
            'table_number' => $this->order->table?->table_number ?? 'Mang về',
            'table_area' => $this->order->table?->area ?? '',
            'completed_items' => $this->completedItems->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->menuItem?->name ?? 'Món ăn',
                'quantity' => $item->quantity,
                'note' => $item->note,
            ])->values()->toArray(),
            'completed_at' => now()->toIso8601String(),
        ];
    }
}
