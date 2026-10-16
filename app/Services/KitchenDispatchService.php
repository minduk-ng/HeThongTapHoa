<?php

namespace App\Services;

use App\Events\OrderSentToKitchen;
use App\Models\KitchenSendBatch;
use App\Models\KitchenStation;
use App\Models\KitchenWorkGroup;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class KitchenDispatchService
{
    /**
     * Projects active work groups from authoritative rows.
     *
     * @return list<array{
     *     id: int,
     *     batchId: int,
     *     orderId: int,
     *     stationId: int,
     *     stationName: string,
     *     sentAt: string,
     *     deadlineAt: string,
     *     targetMinutes: int,
     *     longWaitMinutes: int,
     *     version: int,
     *     origin: string,
     *     items: list<array{
     *         id: int,
     *         name: string,
     *         quantity: int,
     *         status: string,
     *         note: string|null
     *     }>
     * }>
     */
    public function projectPending(?int $stationId = null): array
    {
        $groupsQuery = KitchenWorkGroup::query()
            ->with([
                'batch',
                'items' => function ($query) {
                    $query->whereIn('status', ['pending', 'processing'])
                        ->where('quantity', '>', 0)
                        ->whereHas('order', function ($q) {
                            $q->where('status', '!=', 'cancelled');
                        })
                        ->with('menuItem');
                },
            ])
            ->whereHas('items', function ($query) {
                $query->whereIn('status', ['pending', 'processing'])
                    ->where('quantity', '>', 0)
                    ->whereHas('order', function ($q) {
                        $q->where('status', '!=', 'cancelled');
                    });
            });

        if ($stationId !== null) {
            $groupsQuery->where('station_id', $stationId);
        }

        /** @var \Illuminate\Database\Eloquent\Collection<int, KitchenWorkGroup> $groups */
        $groups = $groupsQuery->orderBy('id', 'asc')->get();

        $result = [];
        foreach ($groups as $group) {
            $result[] = $this->formatGroupPayload($group);
        }

        return $result;
    }

    /**
     * Updates group deadline with locking, versioning, audit logging, and validation.
     *
     * @return array{
     *     id: int,
     *     batchId: int,
     *     orderId: int,
     *     stationId: int,
     *     stationName: string,
     *     sentAt: string,
     *     deadlineAt: string,
     *     targetMinutes: int,
     *     longWaitMinutes: int,
     *     version: int,
     *     origin: string,
     *     items: list<array{
     *         id: int,
     *         name: string,
     *         quantity: int,
     *         status: string,
     *         note: string|null
     *     }>
     * }
     */
    public function updateDeadline(int $groupId, string $deadlineAt, string $reason, int $expectedVersion, int $userId): array
    {
        // 1. Validate timezone-qualified timestamp
        if (! preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i', $deadlineAt)) {
            abort(422, 'Invalid timezone-qualified deadline_at timestamp.');
        }

        try {
            $parsedDeadline = Carbon::parse($deadlineAt);
        } catch (\Throwable) {
            abort(422, 'Invalid deadline_at timestamp.');
        }

        // 2. Validate reason trimmed 1-255 characters
        $trimmedReason = trim($reason);
        if ($trimmedReason === '' || mb_strlen($trimmedReason) > 255) {
            abort(422, 'Reason must be between 1 and 255 characters.');
        }

        // 3. Validate expected_version
        if ($expectedVersion < 1) {
            abort(422, 'expected_version must be a positive integer.');
        }

        return DB::transaction(function () use ($groupId, $parsedDeadline, $trimmedReason, $expectedVersion, $userId) {
            /** @var KitchenWorkGroup|null $group */
            $group = KitchenWorkGroup::query()
                ->with(['batch.order', 'items.menuItem'])
                ->where('id', $groupId)
                ->lockForUpdate()
                ->first();

            if (! $group) {
                abort(404, 'Kitchen work group not found.');
            }

            if ($group->version !== $expectedVersion) {
                abort(409, 'Conflict: stale version.');
            }

            $order = $group->batch->order;
            if ($order->status === 'cancelled') {
                abort(409, 'Conflict: order is cancelled.');
            }

            $hasPendingItems = $group->items()
                ->whereIn('status', ['pending', 'processing'])
                ->where('quantity', '>', 0)
                ->exists();

            if (! $hasPendingItems) {
                abort(409, 'Conflict: work group has no pending items.');
            }

            $oldDeadline = $group->deadline_at;
            $newDeadline = $parsedDeadline->copy()->setTimezone((string) config('app.timezone', 'UTC'));

            // No-op check: if unchanged deadline, return state without audit or version bump
            if ($oldDeadline->equalTo($parsedDeadline)) {
                return $this->formatGroupPayload($group);
            }

            $oldDeadlineUtcIso = $oldDeadline->utc()->toIso8601String();
            $newDeadlineUtcIso = $parsedDeadline->utc()->toIso8601String();
            $nowUtcIso = now()->utc()->toIso8601String();

            $group->deadline_at = $newDeadline;
            $group->version = $group->version + 1;
            $group->save();

            OrderActivityLogger::log($order, 'kitchen_deadline_changed', $userId, [
                'order_id' => $group->batch->order_id,
                'group_id' => $group->id,
                'batch_id' => $group->batch_id,
                'station_id' => $group->station_id,
                'actor_id' => $userId,
                'reason' => $trimmedReason,
                'old_deadline_at' => $oldDeadlineUtcIso,
                'new_deadline_at' => $newDeadlineUtcIso,
                'changed_at' => $nowUtcIso,
            ]);

            rescue(fn () => OrderSentToKitchen::dispatch($order, 'deadline_updated'));

            /** @var KitchenWorkGroup $freshGroup */
            $freshGroup = $group->fresh(['batch.order', 'items.menuItem']);

            return $this->formatGroupPayload($freshGroup);
        });
    }

    /**
     * Creates a send batch, partitions new items by station, and creates work groups.
     *
     * @param  array<int, OrderItem>|Collection<int, OrderItem>  $orderItems
     */
    public function createBatchForOrderItems(Order $order, array|Collection $orderItems): ?KitchenSendBatch
    {
        $itemsList = is_array($orderItems) ? $orderItems : $orderItems->all();
        if (empty($itemsList)) {
            return null;
        }

        /** @var object{target_minutes?: int, long_wait_minutes?: int}|null $settings */
        $settings = DB::table('kitchen_dispatch_settings')->orderBy('id', 'desc')->first();
        $targetMinutes = (int) ($settings->target_minutes ?? 15);
        $longWaitMinutes = (int) ($settings->long_wait_minutes ?? 20);

        $sentAt = now();

        $batch = KitchenSendBatch::create([
            'order_id' => $order->id,
            'sent_at' => $sentAt,
            'target_minutes' => $targetMinutes,
            'long_wait_minutes' => $longWaitMinutes,
            'origin' => 'send',
        ]);

        $generalStation = KitchenStation::where('code', 'general')->first();
        $generalStationId = $generalStation ? (int) $generalStation->id : 1;

        $menuItemIds = collect($itemsList)->pluck('menu_item_id')->unique()->all();
        $menuItems = MenuItem::with('category')->whereIn('id', $menuItemIds)->get()->keyBy('id');

        /** @var array<int, KitchenStation|null> $stationsById */
        $stationsById = [];
        /** @var array<int, list<OrderItem>> $itemsByStation */
        $itemsByStation = [];

        foreach ($itemsList as $item) {
            /** @var MenuItem|null $menuItem */
            $menuItem = $menuItems->get($item->menu_item_id);
            $stationId = ($menuItem && $menuItem->category) ? ($menuItem->category->kitchen_station_id ?? $generalStationId) : $generalStationId;

            if (! array_key_exists($stationId, $stationsById)) {
                $station = KitchenStation::find($stationId) ?? $generalStation;
                $stationsById[$stationId] = $station;
            }

            $resolvedStation = $stationsById[$stationId] ?? $generalStation;
            $actualStationId = $resolvedStation ? (int) $resolvedStation->id : $generalStationId;

            $itemsByStation[$actualStationId][] = $item;
        }

        $deadlineAt = $sentAt->copy()->addMinutes($targetMinutes);

        foreach ($itemsByStation as $stId => $items) {
            $station = $stationsById[$stId] ?? $generalStation;
            $stationName = $station ? (string) $station->name : 'General';

            $group = KitchenWorkGroup::create([
                'batch_id' => $batch->id,
                'station_id' => $stId,
                'station_name' => $stationName,
                'deadline_at' => $deadlineAt,
                'version' => 1,
            ]);

            foreach ($items as $item) {
                $item->update(['kitchen_work_group_id' => $group->id]);
            }
        }

        return $batch;
    }

    /**
     * Formats a KitchenWorkGroup into the QueueGroup shape.
     *
     * @return array{
     *     id: int,
     *     batchId: int,
     *     orderId: int,
     *     stationId: int,
     *     stationName: string,
     *     sentAt: string,
     *     deadlineAt: string,
     *     targetMinutes: int,
     *     longWaitMinutes: int,
     *     version: int,
     *     origin: string,
     *     items: list<array{
     *         id: int,
     *         name: string,
     *         quantity: int,
     *         status: string,
     *         note: string|null
     *     }>
     * }
     */
    protected function formatGroupPayload(KitchenWorkGroup $group): array
    {
        $items = [];
        /** @var Collection<int, OrderItem> $groupItems */
        $groupItems = $group->items;

        $pendingItems = $groupItems->filter(function ($item) {
            return in_array($item->status, ['pending', 'processing'], true) && $item->quantity > 0;
        });

        foreach ($pendingItems as $item) {
            $items[] = [
                'id' => (int) $item->id,
                'name' => (string) ($item->menuItem->name ?? 'Món'),
                'quantity' => (int) $item->quantity,
                'status' => (string) $item->status,
                'note' => $item->note,
            ];
        }

        return [
            'id' => (int) $group->id,
            'batchId' => (int) $group->batch_id,
            'orderId' => (int) $group->batch->order_id,
            'stationId' => (int) $group->station_id,
            'stationName' => (string) $group->station_name,
            'sentAt' => $group->batch->sent_at->toIso8601String(),
            'deadlineAt' => $group->deadline_at->toIso8601String(),
            'targetMinutes' => (int) $group->batch->target_minutes,
            'longWaitMinutes' => (int) $group->batch->long_wait_minutes,
            'version' => (int) $group->version,
            'origin' => (string) $group->batch->origin,
            'items' => $items,
        ];
    }
}
