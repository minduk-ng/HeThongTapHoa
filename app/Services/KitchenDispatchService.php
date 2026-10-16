<?php

namespace App\Services;

use App\Events\OrderSentToKitchen;
use App\Models\KitchenSendBatch;
use App\Models\KitchenStation;
use App\Models\KitchenWorkGroup;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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

            // ponytail: broadcast only after commit so clients never refetch mid-transaction or on rollback
            $orderId = (int) $order->id;
            DB::afterCommit(function () use ($orderId) {
                $freshOrder = Order::find($orderId);
                if ($freshOrder) {
                    rescue(fn () => OrderSentToKitchen::dispatch($freshOrder, 'deadline_updated'));
                }
            });

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
     * Current dispatch settings snapshot (defaults 15/20 when no row).
     *
     * @return array{target_minutes: int, long_wait_minutes: int, version: int}
     */
    public function getSettings(): array
    {
        /** @var object{target_minutes?: int, long_wait_minutes?: int, version?: int}|null $row */
        $row = DB::table('kitchen_dispatch_settings')->orderBy('id', 'desc')->first();

        return [
            'target_minutes' => (int) ($row->target_minutes ?? 15),
            'long_wait_minutes' => (int) ($row->long_wait_minutes ?? 20),
            'version' => (int) ($row->version ?? 1),
        ];
    }

    /**
     * Updates dispatch settings for future batches only (existing snapshots untouched).
     *
     * @return array{target_minutes: int, long_wait_minutes: int, version: int}
     */
    public function updateSettings(int $targetMinutes, int $longWaitMinutes, int $expectedVersion, int $userId): array
    {
        if ($targetMinutes < 1 || $longWaitMinutes < 1) {
            abort(422, 'target_minutes and long_wait_minutes must be positive integers.');
        }

        if ($expectedVersion < 1) {
            abort(422, 'expected_version must be a positive integer.');
        }

        $updated = DB::transaction(function () use ($targetMinutes, $longWaitMinutes, $expectedVersion, $userId) {
            /** @var object{id: int, target_minutes: int, long_wait_minutes: int, version: int}|null $row */
            $row = DB::table('kitchen_dispatch_settings')->orderBy('id', 'desc')->lockForUpdate()->first();

            if (! $row) {
                abort(404, 'Kitchen dispatch settings not found.');
            }

            if ((int) $row->version !== $expectedVersion) {
                abort(409, 'Conflict: stale settings version.');
            }

            // No-op: same values return unchanged state without version bump or audit
            if ((int) $row->target_minutes === $targetMinutes && (int) $row->long_wait_minutes === $longWaitMinutes) {
                return [
                    'target_minutes' => (int) $row->target_minutes,
                    'long_wait_minutes' => (int) $row->long_wait_minutes,
                    'version' => (int) $row->version,
                ];
            }

            $old = [
                'target_minutes' => (int) $row->target_minutes,
                'long_wait_minutes' => (int) $row->long_wait_minutes,
                'version' => (int) $row->version,
            ];

            DB::table('kitchen_dispatch_settings')->where('id', $row->id)->update([
                'target_minutes' => $targetMinutes,
                'long_wait_minutes' => $longWaitMinutes,
                'version' => $old['version'] + 1,
                'updated_by' => $userId,
                'updated_at' => now(),
            ]);

            $new = [
                'target_minutes' => $targetMinutes,
                'long_wait_minutes' => $longWaitMinutes,
                'version' => $old['version'] + 1,
            ];

            DB::afterCommit(function () use ($old, $new, $userId) {
                Log::info('kitchen_settings_changed', [
                    'actor_id' => $userId,
                    'old' => $old,
                    'new' => $new,
                    'changed_at' => now()->utc()->toIso8601String(),
                ]);
            });

            return $new;
        });

        return $updated;
    }

    /**
     * @return list<array{id: int, code: string, name: string, is_active: bool}>
     */
    public function listStations(): array
    {
        $result = [];
        foreach (KitchenStation::query()->orderBy('id', 'asc')->get() as $s) {
            $result[] = [
                'id' => (int) $s->id,
                'code' => (string) $s->code,
                'name' => (string) $s->name,
                'is_active' => (bool) $s->is_active,
            ];
        }

        return $result;
    }

    /**
     * @return list<array{id: int, name: string, kitchen_station_id: int|null}>
     */
    public function listCategoryStations(): array
    {
        $result = [];
        foreach (MenuCategory::query()->orderBy('id', 'asc')->get() as $c) {
            $result[] = [
                'id' => (int) $c->id,
                'name' => (string) $c->name,
                'kitchen_station_id' => $c->kitchen_station_id !== null ? (int) $c->kitchen_station_id : null,
            ];
        }

        return $result;
    }

    /**
     * Remaps a category to a station (null = general). Affects future batches only;
     * existing groups keep their frozen station_id/station_name.
     *
     * @return array{id: int, name: string, kitchen_station_id: int|null}
     */
    public function updateCategoryStation(int $categoryId, ?int $stationId, int $userId): array
    {
        $payload = DB::transaction(function () use ($categoryId, $stationId, $userId) {
            /** @var MenuCategory|null $category */
            $category = MenuCategory::query()->where('id', $categoryId)->lockForUpdate()->first();

            if (! $category) {
                abort(404, 'Menu category not found.');
            }

            if ($stationId !== null) {
                /** @var KitchenStation|null $station */
                $station = KitchenStation::query()->where('id', $stationId)->first();

                if (! $station) {
                    abort(422, 'Unknown kitchen station.');
                }

                if (! $station->is_active) {
                    abort(422, 'Cannot assign to a disabled station; historical groups keep their identity.');
                }
            }

            $oldStationId = $category->kitchen_station_id !== null ? (int) $category->kitchen_station_id : null;

            // No-op: same mapping returns unchanged state without audit
            if ($oldStationId === $stationId) {
                return [
                    'id' => (int) $category->id,
                    'name' => (string) $category->name,
                    'kitchen_station_id' => $oldStationId,
                ];
            }

            $category->kitchen_station_id = $stationId;
            $category->save();

            DB::afterCommit(function () use ($categoryId, $oldStationId, $stationId, $userId) {
                Log::info('kitchen_station_mapping_changed', [
                    'actor_id' => $userId,
                    'category_id' => $categoryId,
                    'old_station_id' => $oldStationId,
                    'new_station_id' => $stationId,
                    'changed_at' => now()->utc()->toIso8601String(),
                ]);
            });

            return [
                'id' => (int) $category->id,
                'name' => (string) $category->name,
                'kitchen_station_id' => $stationId,
            ];
        });

        return $payload;
    }

    /**
     * Readiness gate for legacy backfill: counts pending/processing items that are
     * still unlinked (no work group) on queue-eligible orders. When unlinkedCount > 0
     * the queue projection is incomplete and the UI must show migration-unavailable
     * instead of silently omitting work.
     *
     * @return array{ready: bool, unlinkedCount: int}
     */
    public function queueReadiness(): array
    {
        $unlinkedCount = OrderItem::query()
            ->whereNull('kitchen_work_group_id')
            ->whereIn('status', ['pending', 'processing'])
            ->where('quantity', '>', 0)
            ->whereHas('order', function ($query) {
                $query->whereNotIn('status', ['draft', 'reserved', 'cancelled']);
            })
            ->count();

        return [
            'ready' => $unlinkedCount === 0,
            'unlinkedCount' => (int) $unlinkedCount,
        ];
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
