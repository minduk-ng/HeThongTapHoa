# Kitchen priority dispatch recommendation

Date: 2026-10-16. Status: approved design sections; written specification awaiting user review. Design only; no algorithm implementation.

## Scope and source findings

Recommend pending kitchen work by send-batch × station. Default FIFO; optional priority view. Staff remain free to select any eligible work. No enforced scheduling, auto-completion, preparation-time prediction, or changes to cancellation/payment authority.

`app/Http/Controllers/Staff/POSController.php::sendToKitchen` creates new `OrderItem` rows per submitted addition, sometimes under an existing order. It logs `sent_kitchen` or `additional`, but these payloads list names/quantities rather than durable batch-to-item links. `OrderItem` has order/product IDs and timestamps, no batch/station fields. `MenuItem` has category; `MenuCategory` has name/description/sort order, no station. Current category names are not reliable station identities.

`KitchenController::index` returns active orders and paid orders with pending/processing items; orders are sorted by creation time. Its 10-minute warning KPI is existing behavior, distinct from new priority threshold. `completeItems` can complete eligible work on paid orders, while `completeOrder` rejects paid orders. Recommendation must therefore use existing item-level completion for group actions, not promise whole-order completion for paid work.

`routes/web.php` protects viewing with `kitchen.view`, completion with `kitchen.update`, cancellation with `orders.cancel`; `app/Models/User.php::hasPermission` is existing permission mechanism. `OrderActivityLogger` provides existing audit infrastructure. Batch/station reconstruction from historical names or equal timestamps would be invented linkage and is not permitted.

## Minimal proposed persistence

- `kitchen_stations`: numeric ID, unique stable code, display name, active flag. Seed one `general` station. No guessed kitchen/bar classification.
- `menu_categories.kitchen_station_id`: nullable FK; null resolves to `general`. Explicit category assignment uses a permission-controlled administration form. Station deletion is restricted while referenced; disabling prevents new assignment but preserves historical identity.
- `kitchen_send_batches`: ID, order ID, server `sent_at` UTC, `target_minutes` positive integer snapshot (default 15), `long_wait_minutes` positive integer snapshot (default 20), `origin` (`send` or `legacy_item`).
- `kitchen_work_groups`: ID, batch ID, station ID, station name snapshot, `deadline_at` UTC, integer `version` default 1; unique `(batch_id, station_id)`. Initial deadline is batch sent time plus target snapshot.
- `order_items.kitchen_work_group_id`: nullable indexed FK. Existing order-item status and quantity remain authoritative; no duplicate mutable queue-status column.
- Global configuration singleton `kitchen_dispatch_settings`: target minutes, long-wait minutes, version, updated actor/time; defaults 15 and 20. Values must be positive integers. New batches snapshot both settings transactionally; updates never recalculate existing batches/deadlines.

New send transaction creates one batch per successful send containing new items, partitions those items by explicit category station (or `general`), creates groups and links rows. Further additions always get a new batch even on same order. Reduction-only requests create no batch. Idempotent replay must reuse original transaction outcome, never create duplicate groups. Group's station is frozen at send time; later category mapping/name changes do not reroute existing work.

Backfill only existing unlinked pending/processing items belonging to non-draft/non-reserved/non-cancelled orders, including paid orders. Create one `legacy_item` batch/group per item, use `order_items.created_at` as explicitly labeled approximate sent time, assign `general`, snapshot defaults/current deployment settings. Missing timestamp falls back to order creation time then migration time, marked approximate. Do not pretend separate items formed one historical send. Use unique existing item linkage and restartable transaction chunks so rerun creates no duplicates. Completed/cancelled items need no queue backfill. New send writes must be active before catch-up backfill; queue read supports only linked records after backfill readiness check, showing migration-unavailable state rather than silently omitting work.

## Interfaces and files

Proposed `app/Services/KitchenDispatchService.php` projects groups from authoritative rows and coordinates settings/deadline writes. New models map above tables; migrations under `database/migrations/` add schema and separate restartable backfill command under `app/Console/Commands/BackfillKitchenDispatch.php`.

Existing `POSController.php` attaches batch/group creation to send transaction. `KitchenController.php` adds projected groups to `staff/kitchen/KitchenDisplay` props while preserving existing order/item action contracts. `OrderSentToKitchen` and existing completion/cancellation events trigger refetch after commit. Existing `resources/js/pages/staff/kitchen/KitchenDisplay.tsx` and `components/KitchenOrderCard.tsx` render groups; proposed `utils/dispatchQueue.ts` owns pure ordering interfaces.

`QueueGroup` payload: `{id, batchId, orderId, stationId, stationName, sentAt, deadlineAt, targetMinutes, longWaitMinutes, version, origin, items[]}`; items expose stable order-item ID, name, quantity, status, note. Response includes `serverNow`. Pending work means status `pending` or `processing` with positive quantity; terminal order cancellation excludes all groups. Completion/cancellation removes affected items immediately after authoritative refresh; group disappears only when no pending work remains. Partial changes preserve group identity/deadline.

`orderGroups(groups, mode, now)` returns immutable ordered copy, using one captured time for entire evaluation. FIFO key: `(sentAt, groupId)` ascending. Priority min-heap key: long-wait groups first when `now - sentAt >= longWaitMinutes`; inside that partition `(sentAt, groupId)` ascending; other groups `(deadlineAt, sentAt, groupId)` ascending. Numeric IDs provide deterministic ties. Future sent time has nonnegative displayed wait but is not long-wait. Ordering can apply globally or after station selection with same comparator.

Use bottom-up heap construction O(n), O(n) memory. Full ordered display requires extracting all entries O(n log n); showing first recommendation after build does not make full rendering O(n). Do not mutate comparator time while heap exists. Rebuild on data changes, mode/station changes, tab visibility restoration, and each 15-second clock tick using server-adjusted time. Refetch on reconnect and every 30 seconds while visible; mark stale data and disable mutations during disconnected reconciliation, retaining last display.

## Manual edits, permissions, audit, and errors

Proposed `PATCH /staff/kitchen/work-groups/{group}/deadline` accepts `{deadline_at, reason, expected_version}`. Authorize server-side `kitchen.dispatch.manage`, a new permission explicitly granted through existing role mechanism; kitchen viewing/completion alone does not grant it. Require trimmed nonempty reason up to 255 characters and valid timezone-qualified timestamp; past deadline is allowed for urgency. Lock group; reject stale version or terminal group with 409; invalid fields 422; unauthenticated 401; unauthorized 403; absent group 404. Return updated group/version and server time. No optimistic deadline mutation on failure.

Write deadline change and audit in same transaction. Audit event `kitchen_deadline_changed` through `OrderActivityLogger` includes order/group/batch/station IDs, actor ID, reason, old/new UTC deadline and server change time. Increment version and publish refresh after commit. No-op deadline submission returns unchanged state without fabricated change audit. Long-wait classification remains based on sent time, unaffected by manual deadline.

Settings and station-mapping administration also require `kitchen.dispatch.manage`, validate versions/FKs, audit actor/old/new/time, and affect future batches only. Proposed routes live in existing staff authenticated group in `routes/web.php`; new permission seeded using existing permission/role tables. Database failure rolls back both mutation and audit, returns generic failure, retains previous display. No client-only permission enforcement.

## Verification and acceptance

Tests cover FIFO ties; priority deadlines/ties; exact 20-minute threshold using each batch snapshot; old long-wait before newer overdue work; clock refresh without data event; immutable input; category remapping after send; multi-station sends; additions as new batch; reduction-only/no duplicate replay; partial/full completion/cancellation; paid pending work via item action; config snapshots; unauthorized/manual stale edits and transactional audit; restartable approximate legacy backfill. Existing 10-minute KPI is labeled independently, never used as priority comparator input.

Benchmark seed 20261016, n=100/1,000/10,000 groups, 5 warmups/30 measured runs with runtime/hardware recorded. Measure projection/network separately from heap build, first extraction, full extraction and rendering; report median/p95 and operation counts. Compare full output to comparator-sort oracle.

Simulation uses identical seeded arrivals, station assignments, immutable service durations, worker counts per station and total capacity for FIFO and priority. Nonpreemptive workers take next eligible group when free; same tie-break and clock model. Measure average/max arrival-to-start waiting time and number/share completed after deadline, including jobs unfinished at horizon separately. Run until drained for primary comparison. Include uniform and bursty arrivals, long jobs, manual deadlines and starvation-threshold cases. Publish both outcomes even if priority worsens metrics; no claim priority universally improves wait or lateness. Acceptance requires deterministic ordering/oracle equality and honest equal-capacity comparison, not guaranteed performance gain.

## Dependencies and decisions

Requires new durable batch/station schema before priority can be truthful. Legacy grouping is deliberately approximate and visibly labeled; historical exact batches are unrecoverable from inspected schema. No blocker changes approved scope: new data captures exact future groups, conservative backfill supports existing pending items. Future symbol edits require impact analysis.
