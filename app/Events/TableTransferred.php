<?php

namespace App\Events;

use App\Models\Table;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TableTransferred implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Table $sourceTable,
        public Table $targetTable,
        public string $actionType = 'transfer'
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel('pos-channel'),
            new Channel('kitchen-channel'),
            new PrivateChannel('pos-channel'),
            new PrivateChannel('kitchen-channel'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'TableTransferred';
    }

    public function broadcastWith(): array
    {
        return [
            'source_table_id' => $this->sourceTable->id,
            'source_table_number' => $this->sourceTable->table_number,
            'target_table_id' => $this->targetTable->id,
            'target_table_number' => $this->targetTable->table_number,
            'action_type' => $this->actionType,
            'updated_at' => now()->toIso8601String(),
        ];
    }
}
