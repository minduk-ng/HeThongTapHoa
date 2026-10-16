<?php

namespace App\Console\Commands;

use App\Models\KitchenSendBatch;
use App\Models\KitchenStation;
use App\Models\KitchenWorkGroup;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class BackfillKitchenDispatch extends Command
{
    protected $signature = 'kitchen:backfill-dispatch';

    protected $description = 'Backfill legacy kitchen dispatch batches and work groups for unlinked pending/processing items';

    public function handle(): int
    {
        $station = KitchenStation::where('code', 'general')->first();
        if (! $station) {
            $this->error('General kitchen station not found. Please run migrations.');

            return self::FAILURE;
        }

        /** @var object{target_minutes?: int, long_wait_minutes?: int}|null $settings */
        $settings = DB::table('kitchen_dispatch_settings')->orderBy('id', 'desc')->first();
        $targetMinutes = (int) ($settings->target_minutes ?? 15);
        $longWaitMinutes = (int) ($settings->long_wait_minutes ?? 20);

        $totalProcessed = 0;

        while (true) {
            /** @var int $chunkCount */
            $chunkCount = DB::transaction(function () use ($station, $targetMinutes, $longWaitMinutes) {
                /** @var Collection<int, OrderItem> $items */
                $items = OrderItem::query()
                    ->whereNull('kitchen_work_group_id')
                    ->whereIn('status', ['pending', 'processing'])
                    ->whereHas('order', function ($query) {
                        $query->whereNotIn('status', ['draft', 'reserved', 'cancelled']);
                    })
                    ->with('order')
                    ->orderBy('id')
                    ->limit(500)
                    ->get();

                if ($items->isEmpty()) {
                    return 0;
                }

                foreach ($items as $item) {
                    $rawSentAt = $item->created_at ?? $item->order->created_at ?? now();
                    $sentAt = Carbon::parse($rawSentAt);
                    $deadlineAt = $sentAt->copy()->addMinutes($targetMinutes);

                    $batch = KitchenSendBatch::create([
                        'order_id' => $item->order_id,
                        'sent_at' => $sentAt,
                        'target_minutes' => $targetMinutes,
                        'long_wait_minutes' => $longWaitMinutes,
                        'origin' => 'legacy_item',
                    ]);

                    $group = KitchenWorkGroup::create([
                        'batch_id' => $batch->id,
                        'station_id' => $station->id,
                        'station_name' => $station->name,
                        'deadline_at' => $deadlineAt,
                        'version' => 1,
                    ]);

                    $item->update([
                        'kitchen_work_group_id' => $group->id,
                    ]);
                }

                return $items->count();
            });

            $totalProcessed += $chunkCount;

            if ($chunkCount < 500) {
                break;
            }
        }

        $this->info("Backfill complete: {$totalProcessed} items processed (approximate_sent_time = true, origin = legacy_item, station = {$station->code}).");

        return self::SUCCESS;
    }
}
