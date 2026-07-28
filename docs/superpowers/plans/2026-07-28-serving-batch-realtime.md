# Serving Batch Select & Realtime POS Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broadcast an `ItemsServed` WebSocket event when items are marked served, so POS updates in realtime; add batch multi-select UI to ServingDisplay.

**Architecture:** New Laravel broadcast event `ItemsServed` on `pos-channel`. POSManager listens and reloads `tables` prop. ServingDisplay adds click-to-select cards + batch serve button while keeping per-card quick-serve.

**Tech Stack:** Laravel 12, Laravel Reverb, Inertia.js v2, React 19, TypeScript, Tailwind CSS 4, Lucide React

## Global Constraints

- No emojis anywhere — Lucide React SVG icons only
- Plus Jakarta Sans (`font-display`) for headings, Inter for body
- Color tokens: sky (accent), emerald (success), amber (warning), rose (error), zinc/slate (UI chrome)
- Async guard: re-entry prevention + 8s safety timeout + `onError: () => {}`
- `tabular-nums` for all numbers/timers
- `Array.isArray()` defensive wrapper for Inertia props
- No inline SVG, no `alert()`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/Events/ItemsServed.php` | CREATE | Broadcast event carrying served item/order IDs + table info |
| `app/Http/Controllers/Staff/ServingController.php` | MODIFY | Fire ItemsServed after successful markServed |
| `resources/js/pages/staff/pos/POSManager.tsx` | MODIFY | Listen `.ItemsServed` → reload tables + log |
| `resources/js/pages/staff/serving/ServingDisplay.tsx` | MODIFY | Batch select UI (selectedIds state, action bar, card toggle) |

---

### Task 1: Backend — ItemsServed Event + Controller Dispatch

**Files:**
- Create: `app/Events/ItemsServed.php`
- Modify: `app/Http/Controllers/Staff/ServingController.php`

**Interfaces:**
- Produces: `ItemsServed` event broadcast on `pos-channel` with payload `{ item_ids: number[], order_ids: number[], table_number: string, served_count: number }`

- [ ] **Step 1: Create the ItemsServed event class**

Create `app/Events/ItemsServed.php`:

```php
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

- [ ] **Step 2: Modify ServingController to fire the event**

In `app/Http/Controllers/Staff/ServingController.php`, add imports at top:

```php
use App\Events\ItemsServed;
use App\Models\Order;
```

Replace the `markServed` method body (lines 24–47) with:

```php
public function markServed(Request $request): JsonResponse
{
    $validated = $request->validate([
        'item_ids' => 'required|array|min:1',
        'item_ids.*' => 'required|integer|exists:order_items,id',
    ]);

    try {
        $count = OrderItem::whereIn('id', $validated['item_ids'])
            ->where('status', 'completed')
            ->whereNull('served_at')
            ->update(['served_at' => now()]);

        // Broadcast ItemsServed event for realtime POS sync
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

        return response()->json([
            'success' => true,
            'served_count' => $count,
            'message' => 'Đã đánh dấu phục vụ thành công!',
        ]);
    } catch (\Throwable $e) {
        Log::error('Serving markServed error: '.$e->getMessage());

        return response()->json(['error' => 'Đánh dấu phục vụ thất bại.'], 500);
    }
}
```

- [ ] **Step 3: Verify no syntax errors**

Run: `php artisan route:list --path=staff/serving`
Expected: Shows GET and POST routes without errors.

- [ ] **Step 4: Commit**

```bash
git add app/Events/ItemsServed.php app/Http/Controllers/Staff/ServingController.php
git commit -m "feat(serving): broadcast ItemsServed event on markServed for realtime POS sync"
```

---

### Task 2: Frontend POSManager — Listen for ItemsServed

**Files:**
- Modify: `resources/js/pages/staff/pos/POSManager.tsx`

**Interfaces:**
- Consumes: `ItemsServed` event on `pos-channel` with payload `{ item_ids, order_ids, table_number, served_count }`
- Produces: `router.reload({ only: ['tables'] })` triggers `usePOSCart` rebuild → `isServed` badge update

- [ ] **Step 1: Add .ItemsServed listener to the WebSocket useEffect**

In `resources/js/pages/staff/pos/POSManager.tsx`, find the channel listener chain (around line 160–164):

```ts
channel
    .listen('.OrderSentToKitchen', handleOrderSent)
    .listen('.OrderCompleted', (data: any) => handleTableReload('OrderCompleted', data))
    .listen('.TableStatusUpdated', (data: any) => handleTableReload('TableStatusUpdated', data))
    .listen('.TableTransferred', (data: any) => handleTableReload('TableTransferred', data));
```

Replace with:

```ts
const handleItemsServed = (payload: any) => {
    const eventKey = `ItemsServed_${payload?.order_ids?.join('_') || ''}`;
    if (isDuplicateEvent(eventKey)) return;

    const tableStr = payload?.table_number ? `Bàn ${payload.table_number}` : 'đơn hàng';
    addLogEntry('received', `Nhân viên đã phục vụ ${payload?.served_count || 0} món tại ${tableStr}`, 'Cập nhật trạng thái giỏ hàng');

    router.reload({ only: ['tables'], onError: () => {} });
};

channel
    .listen('.OrderSentToKitchen', handleOrderSent)
    .listen('.OrderCompleted', (data: any) => handleTableReload('OrderCompleted', data))
    .listen('.TableStatusUpdated', (data: any) => handleTableReload('TableStatusUpdated', data))
    .listen('.TableTransferred', (data: any) => handleTableReload('TableTransferred', data))
    .listen('.ItemsServed', handleItemsServed);
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add resources/js/pages/staff/pos/POSManager.tsx
git commit -m "feat(pos): listen ItemsServed event to realtime update cart served status"
```

---

### Task 3: Frontend ServingDisplay — Batch Selection UI

**Files:**
- Modify: `resources/js/pages/staff/serving/ServingDisplay.tsx`

**Interfaces:**
- Consumes: Existing `queue` state, existing `handleServed` per-card function, existing `filteredQueue`
- Produces: Batch `POST /staff/serving/mark-served` with combined item_ids from selected cards

- [ ] **Step 1: Add new imports and state**

Add `CheckSquare`, `Square`, `CheckCheck` to the lucide-react import:

```ts
import {
    ConciergeBell,
    CheckCircle,
    Clock,
    RefreshCw,
    Maximize2,
    Minimize2,
    ClipboardList,
    Layers,
    CheckSquare,
    Square,
    CheckCheck,
} from 'lucide-react';
```

Inside the `ServingDisplay` component, after `const [isWsPopoverOpen, setIsWsPopoverOpen] = useState(false);` add:

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [batchSubmitting, setBatchSubmitting] = useState(false);
```

- [ ] **Step 2: Add toggle selection handler and batch serve handler**

After the `filteredQueue` and `totalItems` definitions (around line 229), add:

```ts
// Toggle card selection
const toggleSelect = useCallback((cardId: string) => {
    setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(cardId)) {
            next.delete(cardId);
        } else {
            next.add(cardId);
        }
        return next;
    });
}, []);

// Select all visible (filtered) cards
const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredQueue.map(c => c.id)));
}, [filteredQueue]);

// Clear selection
const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
}, []);

// Batch mark served
const handleBatchServed = useCallback(() => {
    if (batchSubmitting || selectedIds.size === 0) return;
    setBatchSubmitting(true);

    const allItemIds = queue
        .filter(c => selectedIds.has(c.id))
        .flatMap(c => c.items.map(i => i.id));

    const timeoutId = setTimeout(() => setBatchSubmitting(false), 8000);

    fetch('/staff/serving/mark-served', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-XSRF-TOKEN': getXSRFToken(),
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ item_ids: allItemIds }),
    })
        .then(res => {
            if (!res.ok) throw new Error('Lỗi máy chủ hoặc kết nối mạng.');
            return res.json();
        })
        .then(data => {
            if (data.success) {
                setQueue(prev => prev.filter(c => !selectedIds.has(c.id)));
                setSelectedIds(new Set());
            }
        })
        .catch((err) => {
            console.error('Serving batch mark-served failed:', err);
        })
        .finally(() => {
            clearTimeout(timeoutId);
            setBatchSubmitting(false);
        });
}, [batchSubmitting, selectedIds, queue]);
```

- [ ] **Step 3: Update existing handleServed to also remove from selectedIds**

In the existing `handleServed` callback, find the success handler:

```ts
.then(data => {
    if (data.success) {
        setQueue(prev => prev.filter(c => c.id !== card.id));
    }
})
```

Replace with:

```ts
.then(data => {
    if (data.success) {
        setQueue(prev => prev.filter(c => c.id !== card.id));
        setSelectedIds(prev => { const n = new Set(prev); n.delete(card.id); return n; });
    }
})
```

- [ ] **Step 4: Replace the center toolbar section with conditional action bar**

Find the center filter pills section (the `<div className="flex-1 min-w-0 overflow-x-auto">` block, around lines 291–327). Replace the entire block with:

```tsx
{/* Center: Selection Action Bar OR Filter Pills */}
<div className="flex-1 min-w-0 overflow-x-auto">
    {selectedIds.size > 0 ? (
        <div className="flex items-center gap-2">
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                <CheckSquare className="h-3.5 w-3.5 stroke-[1.5]" />
                <span className="tabular-nums">Đã chọn {selectedIds.size} đơn</span>
            </span>
            <button
                type="button"
                onClick={selectAll}
                className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
                Chọn tất cả
            </button>
            <button
                type="button"
                onClick={clearSelection}
                className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
                Bỏ chọn
            </button>
            <div className="h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />
            <button
                type="button"
                onClick={handleBatchServed}
                disabled={batchSubmitting}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <CheckCheck className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>{batchSubmitting ? 'Đang xử lý…' : `Phục vụ đã chọn (${selectedIds.size})`}</span>
            </button>
        </div>
    ) : (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`flex shrink-0 items-center space-x-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    activeFilter === 'all'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
            >
                <Layers className="h-3.5 w-3.5 stroke-[1.5]" />
                <span>Tất cả</span>
            </button>
            {tableFilters.map(f => (
                <button
                    key={f.tableNumber}
                    type="button"
                    onClick={() => setActiveFilter(f.tableNumber)}
                    className={`flex shrink-0 items-center space-x-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                        activeFilter === f.tableNumber
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                    }`}
                >
                    <span>{f.tableNumber}</span>
                    <span className={`ml-0.5 px-1 py-0.5 rounded-full text-[9px] tabular-nums ${
                        activeFilter === f.tableNumber
                            ? 'bg-white/20'
                            : 'bg-zinc-200 dark:bg-zinc-700'
                    }`}>
                        {f.count}
                    </span>
                </button>
            ))}
        </div>
    )}
</div>
```

- [ ] **Step 5: Update card rendering for selection toggle + visual**

Find the card grid rendering (the `{filteredQueue.map((card) => (` block). Replace the outer card `<div>` and its header/body sections with selection-aware version:

```tsx
{filteredQueue.map((card) => {
    const isSelected = selectedIds.has(card.id);
    return (
        <div
            key={card.id}
            className={`bg-white dark:bg-zinc-900 border rounded-2xl shadow-xs flex flex-col overflow-hidden cursor-pointer transition-all duration-150 ${
                isSelected
                    ? 'border-sky-300 ring-2 ring-sky-500 dark:border-sky-700'
                    : 'border-zinc-200/80 dark:border-zinc-800/80'
            }`}
            onClick={() => toggleSelect(card.id)}
        >
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    {isSelected ? (
                        <CheckSquare className="w-4 h-4 stroke-[1.5] text-sky-600 dark:text-sky-400 shrink-0" />
                    ) : (
                        <Square className="w-4 h-4 stroke-[1.5] text-zinc-300 dark:text-zinc-600 shrink-0" />
                    )}
                    <span className="font-display font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {card.table_number}
                    </span>
                    {card.table_area && (
                        <span className="text-[10px] font-medium text-zinc-400 truncate">
                            {card.table_area}
                        </span>
                    )}
                </div>
                <ElapsedTimer completedAt={card.completed_at} />
            </div>

            <div className="flex-1 px-4 py-2.5 space-y-1.5 min-h-0">
                {card.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="tabular-nums text-xs font-bold text-zinc-900 dark:text-zinc-100 shrink-0">
                                {item.quantity}x
                            </span>
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                {item.name}
                            </span>
                        </div>
                        {item.note && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 italic max-w-[120px] truncate">
                                {item.note}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleServed(card); }}
                    disabled={submittingIds.has(card.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                >
                    <CheckCircle className="w-3.5 h-3.5 stroke-[1.5]" />
                    {submittingIds.has(card.id) ? 'Đang xử lý…' : 'Đã phục vụ'}
                </button>
            </div>
        </div>
    );
})}
```

Key changes from original:
- Card `onClick={() => toggleSelect(card.id)}` + `cursor-pointer`
- Selected visual: `border-sky-300 ring-2 ring-sky-500`
- Header icon: `CheckSquare` (selected) / `Square` (unselected) replaces `ConciergeBell`
- Per-card button: added `e.stopPropagation()` to prevent toggle when clicking serve button

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add resources/js/pages/staff/serving/ServingDisplay.tsx
git commit -m "feat(serving): add batch multi-select UI with per-card quick serve"
```

---

## Verification

After all tasks complete:

1. Run `php artisan route:list --path=staff/serving` — routes exist
2. Run `npx tsc --noEmit` — no type errors
3. Run `npm run build` — production build succeeds
4. Manual test: open POS + Serving in 2 tabs, mark served → POS badge updates without reload
