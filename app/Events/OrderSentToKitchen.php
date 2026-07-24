<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderSentToKitchen implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Order $order,
        public string $actionType = 'send',
        public ?string $logMessage = null
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('kitchen-channel'),
            new Channel('pos-channel'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'OrderSentToKitchen';
    }

    public function broadcastWith(): array
    {
        return [
            'order_id' => $this->order->id,
            'order_code' => $this->order->order_code,
            'table_id' => $this->order->table_id,
            'table_number' => $this->order->table?->table_number ?? '',
            'has_additional_items' => (bool) $this->order->has_additional_items,
            'action_type' => $this->actionType,
            'log_message' => $this->logMessage,
            'created_at' => $this->order->created_at?->toIso8601String(),
        ];
    }
}
