# POS Draft Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Undo-only restoration of the previous unconfirmed cart snapshot per table/invoice, capped at 50 steps in the current POS session.

**Architecture:** Pure transition module `draftUndo.ts` owns snapshot push/pop/validation with no React imports. `usePOSCart` owns history + cart atomically, reconciles server baselines, and exposes `undoDraft`/`canUndo`/`undoError`; `POSCartPanel` renders one `Hoàn tác` button. No server endpoint, no redo, no hotkey.

**Tech Stack:** TypeScript, React 19, `node:test` + `node:assert/strict`, Vite build, ESLint.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-16-pos-draft-undo-design.md`.
- Context key is `(tableId, invoiceKey, generation)`; virtual takeaway table ID is 0; generation guards recycled keys.
- Snapshots are deep immutable copies of unconfirmed rows only (line IDs, quantities, notes, price/VAT, draft metadata); confirmed rows and confirmed staged reductions are never stored or restored.
- Record successful add/remove/quantity changes only; max 50 per context; in-memory session only; reload/logout ends history.
- Product ID is never line identity; local rows need stable `draftLineId`.
- Before editing any symbol: GitNexus `impact({target, direction: "upstream"})`, report blast radius; warn on HIGH/CRITICAL.
- Before committing (only when explicitly requested): `detect_changes()`, status/diff/diff-check; stage only intended files.
- Tests: `node --test`; typecheck `npm run types:check`; lint changed files; build `npm run build`.
- No emojis; Lucide icons only.

---

## File Structure

- Create `resources/js/pages/staff/pos/utils/draftUndo.ts` — types `DraftLine`, `DraftSnapshot`, `UndoEntry`, pure `pushDraftSnapshot`, `popDraftSnapshot`, `validateRestore`, `fingerprintBaseline`.
- Create `resources/js/pages/staff/pos/utils/draftUndo.test.ts` — transition/restore/fingerprint tests.
- Modify `resources/js/pages/staff/pos/types/pos.types.ts` — add optional `draftLineId?: string` to `CartItem` (additive only).
- Modify `resources/js/pages/staff/pos/hooks/usePOSCart.ts` — per-context `{cart, history, baselineFingerprint, generation, sending}` state, `commitDraftChange`/`undoDraft`/`invalidateContexts`/`reconcileBaseline` integration, lifecycle callbacks.
- Modify `resources/js/pages/staff/pos/components/POSCartPanel.tsx` — `Hoàn tác` button with disabled reasons; no other UI changes.

---

### Task 1: Pure snapshot transitions + validation

**Files:**
- Create: `resources/js/pages/staff/pos/utils/draftUndo.ts`
- Test: `resources/js/pages/staff/pos/utils/draftUndo.test.ts`

**Interfaces:**
- Consumes: `CartItem`, `POSProductData` types.
- Produces: `DraftLine`; `pushDraftSnapshot(history: readonly DraftSnapshot[], snap: DraftSnapshot, cap = 50): DraftSnapshot[]`; `validateRestore(snap: DraftSnapshot, latestProducts: ReadonlyMap<number, POSProductData>): { ok: true } | { ok: false; message: string }`; `fingerprintBaseline(payload: BaselinePayload): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { pushDraftSnapshot } from './draftUndo.ts';

describe('pushDraftSnapshot', () => {
    it('caps at 50 and freezes snapshots', () => {
        let h: unknown[] = [];
        for (let i = 0; i < 51; i++) h = pushDraftSnapshot(h as never[], { rows: [{ draftLineId: String(i) }] } as never);
        assert.equal(h.length, 50);
        assert.throws(() => { (h[0] as { rows: unknown[] }).rows.push('x'); });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test resources/js/pages/staff/pos/utils/draftUndo.test.ts`
Expected: FAIL with "Cannot find module './draftUndo.ts'".

- [ ] **Step 3: Write minimal implementation**

```ts
export interface DraftLine { draftLineId: string; menu_item_id: number; quantity: number; note?: string; unit_price: number; vat_rate: number; orderItemId?: number; [k: string]: unknown }
export interface DraftSnapshot { rows: DraftLine[] }

function freeze<T>(v: T): T {
    if (Array.isArray(v)) { v.forEach(freeze); return Object.freeze(v) as T; }
    if (v && typeof v === 'object') { Object.values(v).forEach(freeze); return Object.freeze(v) as T; }
    return v;
}

function cloneRows(rows: readonly DraftLine[]): DraftLine[] {
    return rows.map((r) => ({ ...r }));
}

export function pushDraftSnapshot(history: readonly DraftSnapshot[], snap: DraftSnapshot, cap = 50): DraftSnapshot[] {
    const frozen: DraftSnapshot = freeze({ rows: cloneRows(snap.rows) });
    const next = [...history, frozen];
    return next.length > cap ? next.slice(next.length - cap) : next;
}

export function validateRestore(
    snap: DraftSnapshot,
    latestProducts: ReadonlyMap<number, { is_available: boolean; max_servings?: number }>,
): { ok: true } | { ok: false; message: string } {
    const demand = new Map<number, number>();
    for (const r of snap.rows) demand.set(r.menu_item_id, (demand.get(r.menu_item_id) ?? 0) + r.quantity);
    for (const [id, qty] of demand) {
        const p = latestProducts.get(id);
        if (!p) return { ok: false, message: `Món đã không còn trong thực đơn.` };
        if (!p.is_available) return { ok: false, message: `Món hiện đã hết hàng.` };
        const cap = p.max_servings ?? 999;
        if (qty > cap) return { ok: false, message: `Số lượng vượt quá suất phục vụ hiện tại.` };
    }
    return { ok: true };
}

export interface BaselinePayload { tables: unknown }
export function fingerprintBaseline(payload: BaselinePayload): string {
    return JSON.stringify(payload.tables ?? null);
}
```

> The real `fingerprintBaseline` in Task 2 integration canonicalizes table/group ownership, order IDs, invoice keys, statuses, server item IDs/quantities/prices/notes/confirmation-kitchen-serving flags sorted by stable IDs, excluding transport timestamps and UI selection. This stub is replaced with the canonical version in Task 2; tests below pin the canonical behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test resources/js/pages/staff/pos/utils/draftUndo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/staff/pos/utils/draftUndo.ts resources/js/pages/staff/pos/utils/draftUndo.test.ts
git commit -m "feat(pos): add draft undo snapshot transitions"
```

---

### Task 2: Hook integration (history ownership + lifecycle)

**Files:**
- Modify: `resources/js/pages/staff/pos/types/pos.types.ts` (add `draftLineId?: string`)
- Modify: `resources/js/pages/staff/pos/hooks/usePOSCart.ts`

**Interfaces:**
- Consumes: `pushDraftSnapshot`, `validateRestore`, `fingerprintBaseline` from Task 1.
- Produces: `undoDraft(contextKey): void`; `canUndo: boolean`; `undoError: string | null`; lifecycle callbacks consumed by checkout/table flows.

- [ ] **Step 1: Extend `CartItem` with stable draft line identity**

```ts
export interface CartItem {
    // ... existing fields unchanged
    draftLineId?: string;
}
```

Assign `draftLineId` (e.g. `crypto.randomUUID()` with `Date.now()` fallback) when creating any local draft row; preserve it across snapshots; never reuse it across distinct rows.

- [ ] **Step 2: Add per-context history state**

Per `(tableId, invoiceKey, generation)` store `{ cart, history: DraftSnapshot[], baselineFingerprint, generation, sending }`. Exact signatures owned by `usePOSCart`:

```ts
type ContextKey = { tableId: number; invoiceKey: string; generation: number };
function commitDraftChange(key: ContextKey, action: 'add' | 'remove' | 'setQty', lineId: string, qty: number, latestProducts: ReadonlyMap<number, POSProductData>): void;
function undoDraft(key: ContextKey, latestProducts: ReadonlyMap<number, POSProductData>): void;
function invalidateContexts(keys: ContextKey[], reason: string): void;
function reconcileBaseline(serverTables: POSTableData[]): void;
```

`commitDraftChange` validates the proposed result first (invalid/noninteger/out-of-stock/identical/no-op creates no history), then atomically pushes the pre-change snapshot and installs the new cart, dropping the oldest beyond 50. `undoDraft` peeks without popping, validates the full snapshot against latest products, and on failure preserves cart + stack exactly with a product-specific message; on success replaces only the unconfirmed segment in snapshot order, keeps confirmed rows byte-for-byte, then pops exactly one entry. Replace the Task 1 `fingerprintBaseline` stub with the canonical version:

```ts
export interface ServerItemView { id: number; quantity: number; unit_price: number; note?: string | null; status?: string; isConfirmed?: boolean; isKitchenCompleted?: boolean; isServed?: boolean }
export interface ServerOrderView { id: number; invoiceKey: string; status: string; tableId: number; items: ServerItemView[] }
export function fingerprintBaseline(orders: readonly ServerOrderView[]): string {
    const canon = [...orders]
        .map((o) => ({
            t: o.tableId, k: o.invoiceKey, s: o.status,
            items: [...o.items]
                .map((i) => [i.id, i.quantity, i.unit_price, i.note ?? '', i.status ?? '', !!i.isConfirmed, !!i.isKitchenCompleted, !!i.isServed] as const)
                .sort((a, b) => (a[0] as number) - (b[0] as number)),
        }))
        .sort((a, b) => a.t - b.t || (a.k < b.k ? -1 : 1));
    return JSON.stringify(canon);
}
```

`reconcileBaseline` maps `POSTableData[]` server orders into `ServerOrderView[]`, compares fingerprints, and only clears histories whose context fingerprint changed; transport timestamps, unrelated tables, and UI selection are excluded by construction.

- [ ] **Step 3: Wire lifecycle rules**

Table/invoice/tab selection retains all contexts. Identical realtime payload (semantic fingerprint equal) preserves drafts + history. External semantic change clears only affected histories before reconciling. Send begin captures source context/generation and disables Undo + mutations while pending. Send success clears source history and reconciles baseline (idempotent with realtime-arrived success). Send failure keeps history unless a later authoritative refresh proves a commit. Cancel/delete-invoice/payment success invalidates affected invoice contexts; transfer/merge invalidates source/destination ownership-changed contexts. Ambiguous network outcome retains history but blocks send/Undo until reconciliation resolves.

- [ ] **Step 4: Verify**

Run: `node --test resources/js/pages/staff/pos/utils/draftUndo.test.ts`
Expected: PASS.

Run: `npm run types:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/staff/pos/types/pos.types.ts resources/js/pages/staff/pos/hooks/usePOSCart.ts
git commit -m "feat(pos): integrate draft undo history into cart"
```

---

### Task 3: Undo button UI + benchmark note

**Files:**
- Modify: `resources/js/pages/staff/pos/components/POSCartPanel.tsx`
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md` (POS section only)

**Interfaces:**
- Consumes: `canUndo`, `undoError`, `undoDraft`, `sending` state from Task 2.
- Produces: visible `Hoàn tác` button; verification note with snapshot cost measurement.

- [ ] **Step 1: Add the button**

Place `Hoàn tác` adjacent to draft controls. Disabled when no table/context, stack empty, sending/reconciling, or checkout-locked; expose the reason via `title`/`aria-label`. On success recompute totals/badges and emit the existing draft-count whisper; on validation failure show the concise error and emit no whisper. No keyboard shortcut. Confirmed reduction/cancellation keeps its existing separate flow.

- [ ] **Step 2: Record benchmark note**

Measure push/pop plus snapshot clone/restore cost on representative cart sizes (e.g. 10/30/60 draft rows) with 5 warmups and median of 30 runs; record machine/runtime alongside. State explicitly that per-action Undo is not O(1) end-to-end — stack push/pop is O(1) but snapshot clone/restore is O(rows).

- [ ] **Step 3: Verify**

Run: `npx eslint resources/js/pages/staff/pos/utils/draftUndo.ts resources/js/pages/staff/pos/utils/draftUndo.test.ts resources/js/pages/staff/pos/hooks/usePOSCart.ts resources/js/pages/staff/pos/components/POSCartPanel.tsx`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/components/POSCartPanel.tsx docs/PROJECT_CONTEXT_AND_ROUTING.md
git commit -m "feat(pos): add draft undo button and docs"
```

---

## Self-Review

- Spec coverage: 50-cap/in-memory/session teardown (Tasks 1–2), add/remove/quantity-only + no redo/hotkey (Tasks 1–3), generation + draftLineId identity (Task 2), pre-validation + atomic push/pop (Tasks 1–2), latest-availability restore gate (Tasks 1–2), full lifecycle table incl. realtime-before-response and ambiguous network (Task 2), button/disabled/whisper rules (Task 3), snapshot-cost benchmark (Task 3).
- Placeholder scan: no TBD/TODO; all steps concrete.
- Type consistency: `DraftLine`/`DraftSnapshot`/`commitDraftChange`/`undoDraft`/`invalidateContexts`/`reconcileBaseline` names stable across tasks.
