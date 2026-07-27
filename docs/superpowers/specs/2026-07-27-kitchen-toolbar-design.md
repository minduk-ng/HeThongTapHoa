# Kitchen Display — Toolbar Redesign

## Goal

Remove cancel-item/cancel-order buttons from the kitchen display (bếp không được huỷ đơn)
and replace the left sidebar layout with a single-row top toolbar, maximising space for order cards.

## Changes

### 1. Remove Void/Cancel Functionality

**KitchenDisplay.tsx:**
- Remove `VoidItemModal` import, state, and render
- Remove `handleOpenVoidModal`, `handleOpenCancelOrderModal`
- Remove `SystemLogEntry` import, `kitchenLogs` state, `addKitchenLog`
- Remove `KitchenLogPanel` import and render
- Remove `onCancelItem`/`onCancelOrder` props passed to `KitchenOrderCard`

**KitchenOrderCard.tsx:**
- Remove `onCancelItem`/`onCancelOrder` from props interface
- Remove `Trash2` button from item rows
- Remove "Hủy đơn" button from footer
- Remove `Trash2` import

### 2. Replace Sidebar with Top Toolbar

**Before:** `grid grid-cols-1 lg:grid-cols-12 gap-4` with left sidebar (4 cols) + cards (8 cols)

**After:** Full-width order card grid with a single-row toolbar pinned at top.

#### Toolbar Layout (3 horizontal zones)

```
[Left: Title + WS]  [Center: Station filter]  [Right: Stats + Actions]
```

- **Left:** `ChefHat` icon + "Bếp" title + WebSocket status dot + label
- **Center:** Pill buttons — `Tất cả | Pha chế | Bếp nóng` (same logic as current)
- **Right:** Stats badges (total orders / warnings) + sound toggle + refresh + fullscreen

#### Toolbar Styling
- `bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800`
- Padding: `px-4 py-2.5`
- Station filter: `bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg`
- Stats badges: mini pills with Lucide icons + numbers
- All icons `w-4 h-4 stroke-[1.5]` per `.agents/AGENTS.md` rules
- Title uses `font-display` (Plus Jakarta Sans)

#### Order Cards Area
- Full-width: remove sidebar columns
- Grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4`
- Container: `h-full w-full p-4 pt-0 overflow-hidden` with scrollable cards

### 3. Files Modified

- `resources/js/pages/staff/kitchen/KitchenDisplay.tsx`
- `resources/js/pages/staff/kitchen/components/KitchenOrderCard.tsx`
- `docs/PROJECT_CONTEXT_AND_ROUTING.md` (update architecture)

### 4. Non-Goals

- No new API endpoints
- No backend changes
- No new modals or components
- Future "báo hết món" feature is out of scope
