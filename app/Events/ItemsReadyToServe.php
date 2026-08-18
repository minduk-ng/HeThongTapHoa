<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ItemsReadyToServe implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param \Illuminate\Support\Collection<int, \App\Models\OrderItem> $completedItems
     */
    public function __construct(
        public Order $order,
        public \Illuminate\Support\Collection $completedItems,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('pos-channel'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'ItemsReadyToServe';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->order->id,
            'order_code' => $this->order->order_code,
            'table_number' => $this->order->table->table_number ?? 'Mang về',
            'table_area' => $this->order->table->area ?? '',
            'completed_items' => $this->completedItems->map(fn ($item) => [
                'id' => $item->id,
                'name' => $item->menuItem->name ?? 'Món ăn',
                'quantity' => $item->quantity,
                'note' => $item->note,
            ])->values()->toArray(),
            'completed_at' => now()->toIso8601String(),
        ];
    }
}
