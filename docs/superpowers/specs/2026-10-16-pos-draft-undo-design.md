# POS draft Undo

Date: 2026-10-16. Status: approved design sections; written specification awaiting user review. Design only.

## Scope

One Undo button restores previous unconfirmed cart snapshot for current table/invoice. Maximum 50 snapshots per context, retained in memory during current POS session. Record successful add, remove, and quantity changes only. No redo, hotkey, browser persistence, cross-device history, undo of sending/payment/cancellation, or modification of confirmed lines. Switching table, invoice, or POS tab retains history; full page reload/logout ends session.

## Existing architecture and file ownership

`resources/js/pages/staff/pos/hooks/usePOSCart.ts` stores `tableCarts[tableId][invoiceKey]` and active invoice selection. It reconstructs server rows on `tables` refresh and currently preserves only selected local draft-key carts. `CartItem` in `types/pos.types.ts` includes confirmation, order-item ID, price, note, and staged reductions. Invoice keys here identify POS order/draft contexts, not necessarily a settled `invoices.id`.

`POSManager.tsx` integrates `usePOSCart`, `usePOSCheckout`, and `usePOSTables`; `components/POSCartPanel.tsx` owns cart actions. Proposed `utils/draftUndo.ts` defines immutable snapshot transitions. Cart hook owns history and reconciliation atomically with cart state; checkout/table hooks report lifecycle outcomes through callbacks. No server Undo endpoint.

## State and interfaces

Context key is tuple `(tableId, invoiceKey, generation)`, including virtual takeaway table ID 0. Generation prevents reused `draft_default` or recycled keys from inheriting old history. A locally created invoice gets collision-resistant stable key. Confirmed rows retain `orderItemId`; local rows receive stable `draftLineId` preserved across snapshots. Product ID is never line identity.

Each context stores `{cart, history, baselineFingerprint, generation, sending}`. Snapshot is deep immutable copy of all unconfirmed rows and their order, including line IDs, quantities, notes, price/VAT fields and existing draft metadata. It contains no confirmed rows or confirmed staged reductions. Operations address line ID. Existing add-to-line behavior may increment a compatible draft row, but cannot merge rows differing in note/price/confirmation metadata.

`commitDraftChange(contextKey, action, latestProducts)` validates proposed add/remove/quantity result first, then atomically pushes pre-change snapshot and installs new cart. Reject invalid/noninteger/out-of-stock quantities; identical result, missing-row removal, zero delta, and rejected changes create no history. Keep newest 50 entries by dropping oldest after push. One user action creates one snapshot even if several draft rows are affected. Note/price editing is outside recorded actions; if another feature changes these draft fields, clear that context's history to prevent Undo silently reverting unrelated edits.

`undoDraft(contextKey, latestProducts)` peeks without popping. Validate every restored product exists, is available, and aggregate restored unconfirmed demand per product fits current `max_servings`. Already-confirmed quantities are not charged again against remaining-stock capacity. Missing product/capacity data or known refresh in progress blocks restoration until refreshed. Empty snapshot is valid. If any row fails validation, show product-specific message and preserve both cart and stack exactly. No partial restoration or quantity clamping. On success, replace only unconfirmed segment in snapshot order, retain current confirmed rows and their staged fields byte-for-byte, then pop exactly one entry. Existing server-side stock validation still applies at send time.

`invalidateContexts(keys, reason)` clears only affected histories and advances generation where identity has ended. `reconcileBaseline(serverPayload)` compares semantic fingerprints rather than object references or timestamps.

## Baseline and lifecycle rules

Fingerprint canonicalizes table/group ownership, order IDs and invoice keys, order status, and server item IDs, quantities, prices, notes, confirmation/kitchen/serving status. Sort unordered collections by stable IDs before comparison. Exclude transport timestamps, unrelated tables, and local UI selection. Product availability refresh does not clear history; Undo validates against current products.

| Event | Required behavior |
| --- | --- |
| Table/invoice/tab selection | Retain all contexts; expose selected context's stack. |
| Identical realtime server payload | Preserve cart drafts and history, including additions under existing non-draft order keys. |
| External semantic baseline change | Clear affected context history before reconciling server state; preserve unrelated histories. |
| Send begins | Capture source context/generation; disable Undo and draft mutations in that context while request is pending. |
| Send succeeds | Clear source context history and reconcile committed server baseline; never clear newly selected table by mistake. |
| Send fails validation/network | Keep source cart and history; unlock when outcome is known. If subsequent server refresh proves committed/external change, baseline rule takes precedence. |
| Cancel/delete invoice or payment succeeds | Invalidate affected invoice contexts; prevent obsolete drafts/history resurrection. Failure alone does not clear. |
| Transfer/merge succeeds or arrives remotely | Invalidate all source/destination contexts whose ownership or baseline changed, including merged-table aliases; keep unrelated contexts. |

Own successful send may arrive through realtime before HTTP success. Its changed baseline already clears matching history; later success is idempotent. Failure must not restore history cleared by independent authoritative change. Callbacks carry captured context generation, so stale responses cannot clear replacement invoices. Ambiguous network outcome retains history but prevents send/Undo while authoritative reconciliation is pending; resolved failure preserves it, resolved success clears it.

## UI and errors

Button label `Hoàn tác`, adjacent to draft controls. Disable when no table/context, stack empty, sending/reconciling, or cart locked for checkout. Show accessible reason for disabled state. On success recompute totals/badges and broadcast existing draft-count whisper. On validation failure show concise error and no whisper. No keyboard handler. Confirmed reduction/cancellation uses existing separate flow and never enters Undo history.

## Verification and acceptance

Transition tests cover empty stack; 1/50/51 changes; immutable snapshots; add/remove/increment/decrement; no-op and invalid actions; repeated product rows; independent table/invoice/takeaway histories; generation reuse; switch away/back; session teardown. Freeze snapshots to detect mutation.

Restore tests change availability and capacity between edit and Undo, include deleted products and aggregate duplicate-row demand, and assert failed restore leaves cart/stack identical. Confirmed rows and staged reductions remain untouched through all successful restores. Integration tests cover sending disabled state; success/failure; selection change during request; realtime-before-response; identical/reordered realtime payloads; external item/status/ownership changes; payment/cancel/transfer/merge affecting only correct contexts; and local additions on existing order keys surviving identical refresh.

Acceptance: every valid supported action is reversible until oldest entry expires or specified invalidation occurs; no failed/no-op action consumes history; no restoration bypasses latest availability validation; no confirmed state can be restored or modified by Undo.

## Dependencies

Depends on explicit reconciliation and lifecycle callbacks in existing POS hooks. Menu ID map may supply lookups but is optional; correctness cannot depend on menu filter state. No database migration or kitchen/dashboard dependency. Future implementation requires symbol impact analysis before edits.
