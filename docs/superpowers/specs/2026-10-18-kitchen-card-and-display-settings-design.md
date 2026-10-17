# Kitchen Order Card Redesign, Display Settings Drawer & Toolbar Synchronization

Date: 2026-10-18. Status: Draft specification for review. Design only; no implementation code.

---

## 1. Context and Problem Statement

1. **Kitchen Order Card (`KitchenOrderCard.tsx`)**:
   - Current cards enforce `min-h-[300px]` and `h-full` inside a rigid CSS grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`). When Table A has 1 item and Table B has 5 items on the same row, Table A's card is forcibly stretched to match Table B's vertical height, creating massive dead space.
   - Headers unconditionally render a heavy blue gradient (`from-sky-600 to-sky-700`) regardless of order urgency, causing visual fatigue on kitchen display systems (KDS).
   - Desired state: Flexible auto-height where cards occupy only the height demanded by their content without stretching neighbouring cards. Neutral, clean card surfaces (`zinc`/`slate`) by default; vibrant alert themes (`amber`/`rose`) activate **only** when urgent thresholds are breached (Overdue deadline, Long Wait $\ge 15'$, or Additional Items).

2. **Cross-Screen Display Customization (POS, Kitchen, Serving)**:
   - Staff use varied hardware: handheld smartphones (waitstaff), 10–12" tablets (counter/KDS), 15.6" touch terminals (cashier POS), and 32–55" wall-mounted TVs (kitchen display).
   - There is no mechanism to tailor zoom level, column counts, or density per workstation.
   - Desired state: A dedicated Settings button on top toolbars opening a slide-over drawer (`DisplaySettingsDrawer.tsx`) offering screen zoom scaling, density, grid column overrides, and kitchen card display modes, backed by independent `localStorage` persistence and a reset-to-defaults mechanism.

3. **Toolbar Inconsistency**:
   - `KitchenDisplay` and `ServingDisplay` use a ~56px toolbar (`px-5 py-3`) with `h-5 w-5` utility icons.
   - `POSToolbar` uses a compact 44px toolbar (`h-11 px-3`) with `h-4 w-4` icons.
   - Desired state: Standardize all three displays to a uniform `h-14` (56px) height, matching icon sizes (`h-5 w-5 stroke-[1.5]`) and touch targets (`p-2` / `p-2.5`). POS internal tabs, table layout, menu algorithms, cart, and payment flows remain completely unchanged.

4. **Mobile Responsiveness for Kitchen and Serving**:
   - Waitstaff on mobile devices need a clean 1-column layout with touch targets $\ge 44\text{px}$ to mark items served quickly. Kitchen supervisors on mobile need a responsive single-column queue without broken headers or horizontal overflow.

---

## 2. Architectural Design

```
+-----------------------------------------------------------------------------------+
| Top Toolbar (h-14 / 56px across POS, Kitchen, Serving)                            |
| [Brand / Tab Switchers]          [Status / Stats]     [Settings] [Full] [Refresh] |
+-----------------------------------------------------------------------------------+
                                                              |
                                                    Click Settings Icon
                                                              v
+-----------------------------------------------------------------------------------+
| Page Content Container (Responsive CSS Scale & Dynamic Columns)                   |
|                                                                                   |
|  +---------------------------+  +---------------------------+                     |
|  | Kitchen Card 1 (Auto H)   |  | Kitchen Card 2 (Auto H)   |  +----------------+ |
|  | Table 1 — 1 item          |  | Table 2 — 5 items         |  | Settings Drawer| |
|  | [Clean Neutral Style]     |  | [Rose Alert if Overdue]   |  | (Slide-over)   | |
|  | Height: ~130px            |  | Height: ~260px            |  | - Zoom (85-125)| |
|  +---------------------------+  +---------------------------+  | - Density      | |
|                                                                | - Columns (2-6)| |
|                                                                | - Reset / Save | |
|                                                                +----------------+ |
+-----------------------------------------------------------------------------------+
```

### 2.1 Component Breakdown & Responsibilities

1. **`resources/js/hooks/useDisplaySettings.ts`**:
   - Manages state for display preferences per screen ID (`kitchen`, `pos`, `serving`).
   - Schema:
     ```typescript
     export interface DisplaySettings {
         scale: 85 | 100 | 110 | 125;
         density: 'compact' | 'normal' | 'comfortable';
         gridColumns?: 'auto' | 2 | 3 | 4 | 5 | 6; // Kitchen & Serving only
         cardMode?: 'auto' | 'compact';            // Kitchen only
         audioAlert?: boolean;                     // Kitchen only
     }
     ```
   - Persists state to `localStorage` under distinct keys (`taphoa_settings_{screenId}_v1`).
   - Exposes `settings`, `previewSettings`, `updatePreview`, `saveSettings`, `resetSettings`, and `hasUnsavedChanges`.

2. **`resources/js/components/common/DisplaySettingsDrawer.tsx`**:
   - Accessible slide-over drawer mounting to `document.body` or screen root.
   - Slide animation from right edge on desktop (`w-88` to `w-96`, `backdrop-blur-xs`); full width bottom sheet on mobile (`< 640px`).
   - Live preview updates as user selects options; "Lưu thiết lập" commits to storage, "Đặt lại mặc định" restores default config, closing without saving reverts preview.
   - Strictly Lucide React SVG icons (`Settings`, `RotateCcw`, `Check`, `X`, `SlidersHorizontal`), zero raw emojis.

3. **`resources/js/pages/staff/kitchen/components/KitchenOrderCard.tsx`**:
   - Remove `min-h-[300px]` and `h-full`. Card uses natural height based on item count.
   - Apply alert-driven styling hierarchy:
     - **Default (No urgent alert)**: Neutral header (`bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-700/60`), border `border-zinc-200/80 dark:border-zinc-800`.
     - **Overdue (`isOverdue`)**: Alert rose theme (`bg-gradient-to-r from-rose-600 to-rose-700 text-white animate-pulse`, border `border-rose-300 dark:border-rose-900/80`).
     - **Long Wait (`isLongWait`) or Additional Items (`hasAdditional`)**: Alert amber theme (`bg-gradient-to-r from-amber-500 to-amber-600 text-white`, border `border-amber-300 dark:border-amber-900/80`).
   - Compact item checklist with `tabular-nums` quantities and quick complete action.

4. **`resources/js/pages/staff/kitchen/KitchenDisplay.tsx`**:
   - Container layout refactored from rigid grid to auto-height item alignment (`items-start`).
   - Dynamic column class generated from `settings.gridColumns`:
     - `'auto'`: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`
     - Fixed `2` to `6`: `grid-cols-1 md:grid-cols-N lg:grid-cols-N xl:grid-cols-N`
   - Top toolbar unified to `h-14` with Settings drawer trigger button.

5. **`resources/js/pages/staff/serving/ServingDisplay.tsx`**:
   - Top toolbar unified to `h-14` with Settings drawer trigger button.
   - Column override and density classes integrated into serving batch cards and item list.
   - Mobile single-column optimization.

6. **`resources/js/pages/staff/pos/components/POSToolbar.tsx`**:
   - Container upgraded from `h-11` (44px) to `h-14` (56px) `px-5 py-2.5`.
   - Utility buttons updated to `p-2` with `h-5 w-5 stroke-[1.5]` icons matching Kitchen and Serving.
   - Added Settings button triggering `DisplaySettingsDrawer` for POS scale and density.
   - Tabs, table selectors, order notes, and unread error badges scaled proportionally.

---

## 3. Data Flow & Persistence

```
[ User Opens Drawer ]
         |
         v
[ Reads localStorage: "taphoa_settings_{screen}_v1" ]
         |
         +--> If null, initialize with DEFAULT_SETTINGS
         |
[ User Toggles Options (e.g., 4 columns, 85% scale) ]
         |
         v
[ Update previewSettings ] ---> Triggers React state re-render
                                (Immediate visual feedback on underlying page)
         |
         +---------------------------------------+
         |                                       |
         v (Clicks "Lưu thiết lập")               v (Clicks "Đặt lại mặc định")
[ Write to localStorage ]              [ Remove key from localStorage ]
[ Toast "Đã lưu cài đặt hiển thị" ]    [ Reset preview to default values ]
[ Close Drawer ]                       [ Write default to localStorage ]
```

---

## 4. Mobile Responsiveness Strategy

1. **Toolbar on Mobile (`< 640px`)**:
   - Tab switchers on POS and station pills on Kitchen wrap with `overflow-x-auto no-scrollbar` to prevent vertical wrapping.
   - Height remains strictly pinned to `h-14` without overflow clipping.
2. **Cards on Mobile**:
   - Kitchen cards and Serving batches collapse to single column (`grid-cols-1 w-full`).
   - Checkboxes and complete action buttons maintain minimum touch target $44 \times 44\text{px}$.
3. **Settings Drawer on Mobile**:
   - Transitions to full-screen or slide-up bottom sheet with clear close header and thumb-friendly save button.

---

## 5. Scope Boundary (Anti-Scope Creep)

- **Included**:
  - `KitchenOrderCard.tsx` layout and color-on-alert redesign.
  - `DisplaySettingsDrawer.tsx` component and `useDisplaySettings.ts` hook.
  - Integration of Settings button on POS, Kitchen, and Serving toolbars.
  - Height and styling unification of `POSToolbar.tsx`, `KitchenDisplay.tsx`, and `ServingDisplay.tsx` to `h-14`.
  - Column and scale controls for Kitchen and Serving.
- **Explicitly Excluded (Postponed to Phase 2)**:
  - Deep architectural changes to POS table map, reservation modals, draft-undo logic, or menu query algorithms.
  - Backend schema or database migration modifications (all settings are client-side `localStorage`).
  - Cashier shift, invoice, or payment checkout modifications.

---

## 6. Verification & Quality Acceptance Criteria

1. **Anti-Slop & Design Compliance**:
   - Zero raw emojis in drawer, toolbars, or card buttons. All icons use `lucide-react`.
   - All numerical quantities, elapsed timers, and column badges use `tabular-nums`.
   - Typography uses display font (`Plus Jakarta Sans` / `.font-display`) for card titles and drawer headers.
2. **Visual Auto-Height Verification**:
   - A single-item card on Kitchen display renders at $\le 150\text{px}$ height.
   - A 5-item card in the same row renders at $\approx 250\text{px}$ height without forcing the single-item card to stretch.
   - Default cards show clean neutral surface; overdue cards show rose gradient and pulse; long wait cards show amber theme.
3. **Settings Persistence**:
   - Changing settings and reloading the browser automatically restores persisted values.
   - Clicking "Đặt lại mặc định" restores default configuration.
4. **Automated Suite**:
   - `npm run types:check`: 0 errors.
   - `npm run lint:check`: 0 lint errors.
   - `npm run format:check`: 100% Prettier compliant.
   - `php artisan test`: 100% green feature test suite.
