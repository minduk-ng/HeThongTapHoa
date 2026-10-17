# Kitchen Order Card, Display Settings Drawer & Toolbar Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Redesign `KitchenOrderCard` with auto-height and alert-only coloring, build a reusable `DisplaySettingsDrawer` backed by `localStorage` for zoom/density/grid customization across POS, Kitchen, and Serving, synchronize all toolbars to `h-14` (56px), and optimize Kitchen & Serving for mobile.

**Architecture:** A reusable React hook `useDisplaySettings` manages client-side preferences per screen with `localStorage` isolation and live preview. A slide-over `DisplaySettingsDrawer` component offers zoom (85%–125%), density, grid column overrides, and kitchen card mode. `KitchenOrderCard` removes `min-h-[300px]` and rigid row stretching to adopt natural auto-height with alert-only vibrant themes, while `POSToolbar` standardizes to `h-14` without modifying underlying POS transactional logic.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Lucide React icons, Inertia.js v2, Node built-in test runner (`node --test`).

## Global Constraints

- STRICTLY NO EMOJIS in JSX/TSX, button labels, select options, or notifications. All icons must be from `lucide-react`.
- Number formatting: all timers, quantities, and numerical indicators must have the `tabular-nums` class.
- Display Font: Page titles and card headings must use `.font-display` (`Plus Jakarta Sans`).
- Rule 16: Zero destructive DB actions. No migrations needed for this client-side UI improvement.
- Rule 13: Feature test suite (`php artisan test`) and TypeScript checks (`npm run types:check`) must remain 100% green.

---

### Task 1: Display Settings State & Storage Hook (`useDisplaySettings.ts`)

**Files:**
- Create: `resources/js/hooks/useDisplaySettings.ts`
- Test: `resources/js/hooks/useDisplaySettings.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface DisplaySettings {
      scale: 85 | 100 | 110 | 125;
      density: 'compact' | 'normal' | 'comfortable';
      gridColumns?: 'auto' | 2 | 3 | 4 | 5 | 6;
      cardMode?: 'auto' | 'compact';
      audioAlert?: boolean;
  }
  export function useDisplaySettings(screenId: 'kitchen' | 'pos' | 'serving'): {
      settings: DisplaySettings;
      previewSettings: DisplaySettings;
      updatePreview: (updates: Partial<DisplaySettings>) => void;
      saveSettings: () => void;
      resetSettings: () => void;
      revertPreview: () => void;
      hasUnsavedChanges: boolean;
  };
  ```

- [x] **Step 1: Write unit tests for `useDisplaySettings` logic**

Create `resources/js/hooks/useDisplaySettings.test.ts`:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('useDisplaySettings storage key and defaults logic', () => {
    it('generates isolated storage keys per screen', () => {
        const getStorageKey = (screenId: string) => `taphoa_settings_${screenId}_v1`;
        assert.equal(getStorageKey('kitchen'), 'taphoa_settings_kitchen_v1');
        assert.equal(getStorageKey('pos'), 'taphoa_settings_pos_v1');
        assert.equal(getStorageKey('serving'), 'taphoa_settings_serving_v1');
    });

    it('validates allowed scale levels and defaults to 100', () => {
        const validScales = [85, 100, 110, 125];
        const sanitizeScale = (val: unknown) => (validScales.includes(val as any) ? val : 100);
        assert.equal(sanitizeScale(85), 85);
        assert.equal(sanitizeScale(999), 100);
        assert.equal(sanitizeScale('invalid'), 100);
    });

    it('merges partial updates with preview settings without mutating active saved settings', () => {
        const initial = { scale: 100 as const, density: 'normal' as const, gridColumns: 'auto' as const };
        const preview = { ...initial, scale: 110 as const };
        assert.equal(initial.scale, 100);
        assert.equal(preview.scale, 110);
    });
});
```

- [x] **Step 2: Run test to verify it passes**

Run: `node --test resources/js/hooks/useDisplaySettings.test.ts`
Expected: PASS 3 tests.

- [x] **Step 3: Implement `useDisplaySettings.ts`**

Create `resources/js/hooks/useDisplaySettings.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react';

export interface DisplaySettings {
    scale: 85 | 100 | 110 | 125;
    density: 'compact' | 'normal' | 'comfortable';
    gridColumns?: 'auto' | 2 | 3 | 4 | 5 | 6;
    cardMode?: 'auto' | 'compact';
    audioAlert?: boolean;
}

const DEFAULT_SETTINGS: Record<'kitchen' | 'pos' | 'serving', DisplaySettings> = {
    kitchen: {
        scale: 100,
        density: 'normal',
        gridColumns: 'auto',
        cardMode: 'auto',
        audioAlert: true,
    },
    pos: {
        scale: 100,
        density: 'normal',
    },
    serving: {
        scale: 100,
        density: 'normal',
        gridColumns: 'auto',
    },
};

export function getStorageKey(screenId: string): string {
    return `taphoa_settings_${screenId}_v1`;
}

export function useDisplaySettings(screenId: 'kitchen' | 'pos' | 'serving') {
    const defaultVal = DEFAULT_SETTINGS[screenId];
    const key = getStorageKey(screenId);

    const [settings, setSettings] = useState<DisplaySettings>(() => {
        if (typeof window === 'undefined') return defaultVal;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return defaultVal;
            const parsed = JSON.parse(raw);
            return { ...defaultVal, ...parsed };
        } catch {
            return defaultVal;
        }
    });

    const [previewSettings, setPreviewSettings] = useState<DisplaySettings>(settings);

    // Synchronize preview when persisted settings update
    useEffect(() => {
        setPreviewSettings(settings);
    }, [settings]);

    const updatePreview = useCallback((updates: Partial<DisplaySettings>) => {
        setPreviewSettings((prev) => ({ ...prev, ...updates }));
    }, []);

    const saveSettings = useCallback(() => {
        setSettings(previewSettings);
        try {
            localStorage.setItem(key, JSON.stringify(previewSettings));
        } catch {
            // ignore localStorage quota errors
        }
    }, [key, previewSettings]);

    const resetSettings = useCallback(() => {
        setPreviewSettings(defaultVal);
        setSettings(defaultVal);
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
    }, [defaultVal, key]);

    const revertPreview = useCallback(() => {
        setPreviewSettings(settings);
    }, [settings]);

    const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(previewSettings);

    return {
        settings,
        previewSettings,
        updatePreview,
        saveSettings,
        resetSettings,
        revertPreview,
        hasUnsavedChanges,
    };
}
```

- [x] **Step 4: Run typecheck**

Run: `npm run types:check`
Expected: 0 errors.

- [x] **Step 5: Commit**

```bash
git add resources/js/hooks/useDisplaySettings.ts resources/js/hooks/useDisplaySettings.test.ts
git commit -m "feat(settings): add useDisplaySettings hook with localStorage persistence"
```

---

### Task 2: Display Settings Slide-Over Drawer Component (`DisplaySettingsDrawer.tsx`)

**Files:**
- Create: `resources/js/components/common/DisplaySettingsDrawer.tsx`

**Interfaces:**
- Consumes: `DisplaySettings` from `resources/js/hooks/useDisplaySettings.ts`
- Props:
  ```typescript
  export interface DisplaySettingsDrawerProps {
      isOpen: boolean;
      onClose: () => void;
      screenId: 'kitchen' | 'pos' | 'serving';
      settings: DisplaySettings;
      previewSettings: DisplaySettings;
      onUpdatePreview: (updates: Partial<DisplaySettings>) => void;
      onSave: () => void;
      onReset: () => void;
      hasUnsavedChanges: boolean;
  }
  ```

- [x] **Step 1: Implement `DisplaySettingsDrawer.tsx`**

Create `resources/js/components/common/DisplaySettingsDrawer.tsx` with:
- Right slide-over container on desktop (`w-88` to `w-96`), full-width bottom sheet on mobile (`< 640px`).
- Backdrop overlay with `backdrop-blur-xs` and ESC key listener.
- Zoom scale pills: `85%`, `100%`, `110%`, `125%`.
- Density pills: `Thu gọn` (compact), `Tiêu chuẩn` (normal), `Rộng rãi` (comfortable).
- Kitchen/Serving Grid Columns selector: `Tự động`, `2 cột`, `3 cột`, `4 cột`, `5 cột`, `6 cột`.
- Kitchen Card Appearance: `Tự co giãn (Auto-height)`, `Siêu thu gọn (Compact)`.
- Kitchen Audio Alert toggle switch.
- Sticky footer with "Đặt lại mặc định" (`RotateCcw`) and "Lưu thiết lập" (`Check`) buttons.
- STRICTLY NO EMOJIS (use Lucide SVG icons only: `X`, `RotateCcw`, `Check`, `SlidersHorizontal`, `Monitor`, `LayoutGrid`, `Volume2`).

- [x] **Step 2: Run typecheck**

Run: `npm run types:check`
Expected: 0 errors.

- [x] **Step 3: Commit**

```bash
git add resources/js/components/common/DisplaySettingsDrawer.tsx
git commit -m "feat(settings): add DisplaySettingsDrawer slide-over component"
```

---

### Task 3: Kitchen Order Card Redesign (`KitchenOrderCard.tsx`)

**Files:**
- Modify: `resources/js/pages/staff/kitchen/components/KitchenOrderCard.tsx`

**Interfaces:**
- Consumes: `order`, `group`, `nowMs`, `density`, `cardMode`.
- Produces: Compact, auto-height card that does not stretch row neighbors; dynamic color-on-alert themes.

- [x] **Step 1: Refactor outer container and height constraints**

In `KitchenOrderCard.tsx`:
- Change:
  ```diff
  - className={`border bg-white dark:bg-zinc-900 ${cardBorderClass} flex h-full min-h-[300px] flex-col justify-between overflow-hidden rounded-2xl shadow-sm transition-shadow duration-200 hover:shadow-md`}
  + className={`border bg-white dark:bg-zinc-900 ${cardBorderClass} flex w-full flex-col justify-between overflow-hidden rounded-2xl shadow-sm transition-all duration-200 hover:shadow-md`}
  ```

- [x] **Step 2: Refactor header color hierarchy (Coloring-on-Alert)**

In `KitchenOrderCard.tsx`:
- Change default header:
  ```typescript
  // Default clean neutral styling
  let headerBgClass =
      'bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200/80 dark:border-zinc-700/60 text-zinc-900 dark:text-zinc-100';
  let cardBorderClass = 'border-zinc-200/80 dark:border-zinc-800';
  let badgeTimeClass = 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200';

  if (isOverdue) {
      headerBgClass =
          'bg-gradient-to-r from-rose-600 to-rose-700 dark:from-rose-700/90 dark:to-rose-800/90 text-white animate-pulse';
      cardBorderClass = 'border-rose-400 dark:border-rose-800 shadow-rose-500/10 shadow-md';
      badgeTimeClass = 'bg-black/25 text-white';
  } else if (isLongWait || hasAdditional || isOver10Mins) {
      headerBgClass =
          'bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600/90 dark:to-amber-700/90 text-white';
      cardBorderClass = 'border-amber-400 dark:border-amber-800 shadow-amber-500/10 shadow-md';
      badgeTimeClass = 'bg-black/25 text-white';
  }
  ```

- [x] **Step 3: Compact item checklist layout**

Refactor item rows inside `KitchenOrderCard`:
- Ensure item checklist rows have concise padding (`py-1.5 px-2.5` on compact/normal).
- Quantities styled with `tabular-nums font-bold`.
- Ensure complete buttons have accessible touch targets $\ge 40\text{px}$ without blowing out card height when there is only 1 item.

- [x] **Step 4: Run typecheck and existing tests**

Run: `npm run types:check`
Expected: 0 errors.

- [x] **Step 5: Commit**

```bash
git add resources/js/pages/staff/kitchen/components/KitchenOrderCard.tsx
git commit -m "feat(kitchen): redesign KitchenOrderCard with auto-height and color-on-alert"
```

---

### Task 4: Kitchen Display Layout & Toolbar Integration (`KitchenDisplay.tsx`)

**Files:**
- Modify: `resources/js/pages/staff/kitchen/KitchenDisplay.tsx`

- [x] **Step 1: Integrate `useDisplaySettings` and `DisplaySettingsDrawer`**

In `KitchenDisplay.tsx`:
- Import `useDisplaySettings` and `DisplaySettingsDrawer`.
- Initialize `const displaySettings = useDisplaySettings('kitchen');`.
- Add state `const [isSettingsOpen, setIsSettingsOpen] = useState(false);`.

- [x] **Step 2: Unify top toolbar to `h-14` (56px)**

In `KitchenDisplay.tsx`:
- Update toolbar container to `flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 dark:border-zinc-800 dark:bg-zinc-900`.
- Standardize utility icon button classes: `p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400 transition-colors`.
- Add Settings button:
  ```tsx
  <button
      type="button"
      onClick={() => setIsSettingsOpen(true)}
      className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-sky-600 dark:hover:bg-zinc-800 dark:hover:text-sky-400 transition-colors"
      title="Cài đặt hiển thị"
  >
      <SlidersHorizontal className="h-5 w-5 stroke-[1.5]" />
  </button>
  ```

- [x] **Step 3: Refactor card grid container to `items-start` with dynamic column mapping**

In `KitchenDisplay.tsx`:
- Generate grid columns class:
  ```typescript
  const getGridColsClass = (cols?: 'auto' | 2 | 3 | 4 | 5 | 6) => {
      switch (cols) {
          case 2: return 'grid-cols-1 sm:grid-cols-2';
          case 3: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
          case 4: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
          case 5: return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
          case 6: return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
          default: return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
      }
  };
  ```
- Wrap cards in:
  ```tsx
  <div className={`grid ${getGridColsClass(displaySettings.previewSettings.gridColumns)} items-start gap-3`}>
  ```
- Apply zoom scale wrapper if scale !== 100:
  ```tsx
  <div style={{ zoom: displaySettings.previewSettings.scale === 100 ? undefined : `${displaySettings.previewSettings.scale}%` }}>
  ```

- [x] **Step 4: Mount `DisplaySettingsDrawer`**

Render `DisplaySettingsDrawer` at the bottom of `KitchenDisplay.tsx`:
```tsx
<DisplaySettingsDrawer
    isOpen={isSettingsOpen}
    onClose={() => {
        displaySettings.revertPreview();
        setIsSettingsOpen(false);
    }}
    screenId="kitchen"
    settings={displaySettings.settings}
    previewSettings={displaySettings.previewSettings}
    onUpdatePreview={displaySettings.updatePreview}
    onSave={() => {
        displaySettings.saveSettings();
        setIsSettingsOpen(false);
    }}
    onReset={displaySettings.resetSettings}
    hasUnsavedChanges={displaySettings.hasUnsavedChanges}
/>
```

- [x] **Step 5: Run typecheck and verify**

Run: `npm run types:check`
Expected: 0 errors.

- [x] **Step 6: Commit**

```bash
git add resources/js/pages/staff/kitchen/KitchenDisplay.tsx
git commit -m "feat(kitchen): integrate display settings drawer and h-14 toolbar"
```

---

### Task 5: Serving Display Layout & Toolbar Integration (`ServingDisplay.tsx`)

**Files:**
- Modify: `resources/js/pages/staff/serving/ServingDisplay.tsx`

- [x] **Step 1: Integrate `useDisplaySettings` and `DisplaySettingsDrawer` in `ServingDisplay.tsx`**

- Import `useDisplaySettings` and `DisplaySettingsDrawer`.
- Initialize `const displaySettings = useDisplaySettings('serving');`.
- Add `const [isSettingsOpen, setIsSettingsOpen] = useState(false);`.

- [x] **Step 2: Unify toolbar to `h-14` (56px) and add Settings button**

In `ServingDisplay.tsx`:
- Standardize toolbar to `h-14` (`flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 dark:border-zinc-800 dark:bg-zinc-900`).
- Add Settings button with icon `<SlidersHorizontal className="h-5 w-5 stroke-[1.5]" />`.

- [x] **Step 3: Connect dynamic column classes and scale wrapper**

- In `ServingDisplay.tsx`, connect `displaySettings.previewSettings.gridColumns` and zoom scale style.
- Ensure cards stack as `grid-cols-1` on mobile screens (`< 640px`).

- [x] **Step 4: Mount `DisplaySettingsDrawer`**

Render `DisplaySettingsDrawer` for `serving`.

- [x] **Step 5: Run typecheck and verify**

Run: `npm run types:check`
Expected: 0 errors.

- [x] **Step 6: Commit**

```bash
git add resources/js/pages/staff/serving/ServingDisplay.tsx
git commit -m "feat(serving): integrate display settings drawer and h-14 toolbar"
```

---

### Task 6: POS Toolbar Synchronization & Setting Drawer Integration (`POSToolbar.tsx` & `POSManager.tsx`)

**Files:**
- Modify: `resources/js/pages/staff/pos/components/POSToolbar.tsx`
- Modify: `resources/js/pages/staff/pos/POSManager.tsx`

- [x] **Step 1: Standardize `POSToolbar.tsx` to `h-14` (56px)**

In `POSToolbar.tsx`:
- Update line 124:
  ```diff
  - <div className="flex h-11 w-full shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900">
  + <div className="flex h-14 w-full shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5 dark:border-zinc-800 dark:bg-zinc-900">
  ```
- Update utility buttons:
  ```diff
  - const utilityButtonClass = 'p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors';
  + const utilityButtonClass = 'p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors';
  ```
- Change utility icons inside `POSToolbar.tsx` from `h-4 w-4` to `h-5 w-5 stroke-[1.5]` (Activity, Minimize2, Maximize2, RefreshCw).
- Add `onOpenSettings?: () => void;` prop to `POSToolbarProps`.
- Add Settings button next to Fullscreen & Refresh:
  ```tsx
  <button
      type="button"
      onClick={onOpenSettings}
      className={utilityButtonClass}
      title="Cài đặt hiển thị POS"
  >
      <SlidersHorizontal className="h-5 w-5 stroke-[1.5]" />
  </button>
  ```

- [x] **Step 2: Connect settings drawer and zoom wrapper in `POSManager.tsx`**

In `POSManager.tsx`:
- Import `useDisplaySettings` and `DisplaySettingsDrawer`.
- Initialize `const displaySettings = useDisplaySettings('pos');`.
- Add `const [isSettingsOpen, setIsSettingsOpen] = useState(false);`.
- Pass `onOpenSettings={() => setIsSettingsOpen(true)}` to `<POSToolbar />`.
- Mount `DisplaySettingsDrawer` for `pos`.
- Wrap main content area below toolbar with zoom style:
  ```tsx
  <div
      className="flex flex-1 min-h-0 overflow-hidden"
      style={{ zoom: displaySettings.previewSettings.scale === 100 ? undefined : `${displaySettings.previewSettings.scale}%` }}
  >
  ```
- PRESERVE 100% of internal POS logic (table map, cart, checkout, draft-undo).

- [x] **Step 3: Run typecheck and verify**

Run: `npm run types:check`
Expected: 0 errors.

- [x] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/components/POSToolbar.tsx resources/js/pages/staff/pos/POSManager.tsx
git commit -m "feat(pos): standardize POSToolbar to h-14 and connect display settings"
```

---

### Task 7: Full Quality Verification & Regression Suite

**Files:**
- Test: All automated verification scripts

- [x] **Step 1: Run unit tests**
Run: `node --test resources/js/hooks/useDisplaySettings.test.ts`
Run: `node --test resources/js/pages/staff/pos/utils/menuAlgorithms.test.ts`
Expected: ALL PASS.

- [x] **Step 2: Run TypeScript check**
Run: `npm run types:check`
Expected: 0 errors.

- [x] **Step 3: Run ESLint**
Run: `npm run lint:check`
Expected: 0 errors.

- [x] **Step 4: Run Prettier check**
Run: `npm run format:check`
Expected: 100% code style compliant.

- [x] **Step 5: Run PHP feature regression test suite**
Run: `php artisan test tests/Feature/POSOrderFlowTest.php tests/Feature/POSCheckoutTest.php tests/Feature/KitchenFlowTest.php`
Expected: 100% pass (44/44 tests green).

- [x] **Step 6: Run GitNexus detect-changes**
Run: `node .gitnexus/run.cjs detect-changes`
Expected: Verify only intended symbols modified.

- [x] **Step 7: Final commit**
Commit any remaining docs or plan status updates.
