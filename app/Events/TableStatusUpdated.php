<?php

namespace App\Events;

use App\Models\Table;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TableStatusUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array<string, mixed>|null $meta
     */
    public function __construct(
        public Table $table,
        public ?string $action = null,
        public ?array $meta = []
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('pos-channel'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'TableStatusUpdated';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'table_id' => $this->table->id,
            'table_number' => $this->table->table_number,
            'status' => $this->table->status,
            'action' => $this->action,
            'meta' => $this->meta,
        ];
    }
}
