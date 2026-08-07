<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ItemsServed implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array<int, int> $itemIds
     * @param array<int, int> $orderIds
     */
    public function __construct(
        public array $itemIds,
        public array $orderIds,
        public string $tableNumber,
        public int $servedCount,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('pos-channel'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'ItemsServed';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'item_ids' => $this->itemIds,
            'order_ids' => $this->orderIds,
            'table_number' => $this->tableNumber,
            'served_count' => $this->servedCount,
        ];
    }
}
