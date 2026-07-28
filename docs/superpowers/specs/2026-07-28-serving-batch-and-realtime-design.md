# Serving Batch Select & Realtime POS Sync

**Date:** 2026-07-28
**Status:** Approved
**Scope:** Backend event + POSManager realtime listener + ServingDisplay batch selection UI

---

## Problem

1. When ServingDisplay marks items as served (`POST /staff/serving/mark-served`), no WebSocket event is broadcast. POSManager has no way to know items were served — the POSCartPanel badge "Đã phục vụ" only appears after a manual page reload.

2. ServingDisplay requires clicking "Đã phục vụ" on each card individually. No batch operation exists for serving multiple orders at once.

---

## Solution Overview

- Create a new `ItemsServed` broadcast event fired after successful markServed.
- POSManager listens for `.ItemsServed` and reloads `tables` prop → POSCartPanel updates `isServed` badge in realtime.
- ServingDisplay adds multi-select (click card to toggle) + batch "Phục vụ đã chọn" button, while keeping the per-card quick-serve button.

---

## Backend

### New Event: `App\Events\ItemsServed`

```php
class ItemsServed implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public array $itemIds,
        public array $orderIds,
        public string $tableNumber,
        public int $servedCount,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel('pos-channel')];
    }

    public function broadcastAs(): string
    {
        return 'ItemsServed';
    }

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
```

### ServingController@markServed Changes

After successful `served_at` update:

1. Query distinct `order_id` values from the updated item IDs.
2. Load the first order's table_number for the event payload.
3. Dispatch `ItemsServed` wrapped in try-catch (same `safeDispatch` pattern as POSController).

```php
// After: ->update(['served_at' => now()]);

$orderIds = OrderItem::whereIn('id', $validated['item_ids'])
    ->distinct()
    ->pluck('order_id')
    ->toArray();

$tableNumber = Order::whereIn('id', $orderIds)
    ->with('table')
    ->first()
    ?->table?->table_number ?? '';

try {
    event(new ItemsServed($validated['item_ids'], $orderIds, $tableNumber, $count));
} catch (\Throwable $e) {
    Log::warning('ItemsServed broadcast skipped: '.$e->getMessage());
}
```

**API contract unchanged:** `POST /staff/serving/mark-served` with `{ item_ids: number[] }` — already supports items from multiple orders.

---

## Frontend: POSManager Realtime Sync

### POSManager.tsx — Add `.ItemsServed` Listener

In the existing WebSocket `useEffect` (pos-channel), add:

```ts
.listen('.ItemsServed', (payload: any) => {
    const eventKey = `ItemsServed_${payload?.order_ids?.join('_') || ''}`;
    if (isDuplicateEvent(eventKey)) return;

    const tableStr = payload?.table_number ? `Bàn ${payload.table_number}` : 'đơn hàng';
    addLogEntry('received', `Nhân viên đã phục vụ ${payload?.served_count || 0} món tại ${tableStr}`, 'Cập nhật trạng thái giỏ hàng');

    router.reload({ only: ['tables'], onError: () => {} });
})
```

**Data flow:** ItemsServed event → reload `tables` → `usePOSCart` rebuilds from `table.active_orders[].items[].served_at` → `isServed: true` → POSCartPanel renders "Đã phục vụ" badge.

---

## Frontend: ServingDisplay Batch Selection

### New State

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [batchSubmitting, setBatchSubmitting] = useState(false);
```

### Card Interaction

- **Click card body** (header + items area): toggle selection.
- **Selected card visual:** `ring-2 ring-sky-500 border-sky-300` + `CheckSquare` icon (sky-600) at top-right corner.
- **Per-card "Đã phục vụ" button:** unchanged — click serves that single order immediately (stopPropagation to avoid toggling selection). On success: remove from queue + remove from selectedIds.

### Selection Action Bar

When `selectedIds.size > 0`, replace the filter pills area with an action bar:

```
[✓ Đã chọn N đơn]  [Chọn tất cả]  [Bỏ chọn]  |  [Phục vụ đã chọn (N)]
```

- **Chọn tất cả:** selects all cards in `filteredQueue` (respects active table filter).
- **Bỏ chọn:** clears `selectedIds`.
- **Phục vụ đã chọn (N):** emerald button. Collects all `item_ids` from selected cards → single `POST /staff/serving/mark-served` → on success removes those cards from queue + clears selection.

When `selectedIds.size === 0`, filter pills display normally.

### Guard & Timeout (Batch)

```ts
const handleBatchServed = useCallback(() => {
    if (batchSubmitting || selectedIds.size === 0) return;
    setBatchSubmitting(true);

    const allItemIds = queue
        .filter(c => selectedIds.has(c.id))
        .flatMap(c => c.items.map(i => i.id));

    const timeoutId = setTimeout(() => setBatchSubmitting(false), 8000);

    fetch('/staff/serving/mark-served', { ... body: { item_ids: allItemIds } })
        .then(...)
        .then(data => {
            if (data.success) {
                setQueue(prev => prev.filter(c => !selectedIds.has(c.id)));
                setSelectedIds(new Set());
            }
        })
        .catch(console.error)
        .finally(() => { clearTimeout(timeoutId); setBatchSubmitting(false); });
}, [batchSubmitting, selectedIds, queue]);
```

### Unchanged Behaviors

- WebSocket listeners: `.ItemsReadyToServe` (push new card), `.OrderCompleted` (reload), `.TableStatusUpdated` checkout filter.
- New cards pushed via WS are NOT auto-selected.
- ElapsedTimer, fullscreen, WS status popover, AvatarDropdown — all unchanged.

---

## Files Changed

| File | Action |
|------|--------|
| `app/Events/ItemsServed.php` | CREATE |
| `app/Http/Controllers/Staff/ServingController.php` | MODIFY (fire event) |
| `resources/js/pages/staff/pos/POSManager.tsx` | MODIFY (add listener) |
| `resources/js/pages/staff/serving/ServingDisplay.tsx` | MODIFY (batch select UI) |

---

## Testing

1. Open POS (`/staff/pos`) and Serving (`/staff/serving`) in 2 tabs.
2. Complete an order from Kitchen → card appears in Serving.
3. In Serving: click card to select → click "Phục vụ đã chọn" → card disappears.
4. In POS: POSCartPanel badge updates to "Đã phục vụ" without manual reload.
5. Batch: select 3 cards → single request → all removed → POS updates all.
6. Per-card button still works independently (no selection needed).
