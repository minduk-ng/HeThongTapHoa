<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class IngredientStockUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array<string, mixed> $meta
     */
    public function __construct(public array $meta = []) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('inventory-channel'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'IngredientStockUpdated';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return array_merge([
            'updated_at' => now()->toIso8601String(),
        ], $this->meta);
    }
}
