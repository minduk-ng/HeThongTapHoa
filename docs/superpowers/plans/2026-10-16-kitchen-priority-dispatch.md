# Kitchen Priority Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recommend pending kitchen work by send-batch × station in FIFO or priority order, with manual deadline edits and full audit, without enforcing work order.

**Architecture:** New tables `kitchen_stations`, `kitchen_send_batches`, `kitchen_work_groups` plus `order_items.kitchen_work_group_id` and a settings singleton carry durable batch identity. `KitchenDispatchService` projects groups; `POSController::sendToKitchen` creates batches transactionally; `KitchenController` serves projected groups alongside existing order props; pure `dispatchQueue.ts` orders them client-side with a Min-Heap.

**Tech Stack:** PHP 8.3, Laravel 13, Eloquent, Pest, TypeScript React 19, `node:test`, MySQL/SQLite.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-16-kitchen-priority-dispatch-design.md`.
- Unit is send-batch × station; station mapping is explicit (`menu_categories.kitchen_station_id`, null → `general`); seed exactly one `general` station; never guess kitchen/bar from names.
- Defaults: target 15 min, long-wait 20 min, snapshots per batch; config changes affect future batches only.
- Permission literal from spec: `kitchen.dispatch.manage`. Verified: `pages` table registers `/staff/kitchen` (AuthorizationSeeder, group `Nhân viên`) and existing permissions use the `kitchen.*` prefix (`kitchen.view`, `kitchen.update`, `kitchen.cancel_item`), so the `kitchen` prefix groups correctly. Because the action token itself contains a dot, Task 2 must add a full-string entry `kitchen.dispatch.manage: 'Quản lý hạn điều phối'` to `PERMISSION_LABEL_DICTIONARY` in `RolesManager.tsx` (AGENTS.md rule 9 §3) and verify the permission appears grouped under the kitchen page in the roles modal. Never silently ship a permission the role UI cannot group or label.
- No enforced scheduling, no auto-completion, no prep-time prediction, no cancellation/payment authority changes.
- Legacy data is approximate and visibly labeled; never invent exact historical batches.
- Before editing any symbol: GitNexus `impact({target, direction: "upstream"})`, report blast radius; warn on HIGH/CRITICAL.
- Before committing (only when explicitly requested): `detect_changes()` + status/diff/diff-check; stage only intended files.
- PHP tests on sqlite `:memory:` only (`phpunit.xml`); full `php artisan test` required when PHP changes; PHPStan per `phpstan.neon`.
- Frontend: `node --test`, `npm run types:check`, ESLint, `npm run build`. No emojis; Lucide only.

---

## File Structure

- Create migrations: `database/migrations/2026_10_16_000001_create_kitchen_dispatch_tables.php` (stations, category FK, batches, groups, item FK, settings singleton).
- Create `app/Console/Commands/BackfillKitchenDispatch.php` + restartable chunked backfill; register in `routes/console.php` only if the project registers commands there.
- Create models: `app/Models/KitchenStation.php`, `KitchenSendBatch.php`, `KitchenWorkGroup.php`; extend `OrderItem`/`MenuCategory` fillables + relations + `@property` DocBlocks (Larastan rule 14).
- Create `app/Services/KitchenDispatchService.php` — projection, settings/deadline writes, audit via `OrderActivityLogger`.
- Modify `app/Http/Controllers/Staff/POSController.php::sendToKitchen` — transactional batch/group creation + idempotent replay.
- Modify `app/Http/Controllers/Staff/KitchenController.php::index` — add `workGroups` + `serverNow` props; preserve existing `orders`/`stats` contracts.
- Modify `routes/web.php` (staff group) — `PATCH /staff/kitchen/work-groups/{group}/deadline`; settings/station-mapping admin routes; register permission in `AuthorizationSeeder::$permissions` + `RoleController::$systemPermissions`, label in `RolesManager.tsx` dictionary.
- Create `resources/js/pages/staff/kitchen/utils/dispatchQueue.ts` + `.test.ts` — pure `orderGroups`, binary Min-Heap, comparator.
- Modify `resources/js/pages/staff/kitchen/KitchenDisplay.tsx` + `components/KitchenOrderCard.tsx` — FIFO/priority toggle, group rendering, deadline edit UI, refresh cadence.

---

### Task 1: Schema + models + backfill

**Files:**
- Create: `database/migrations/2026_10_16_000001_create_kitchen_dispatch_tables.php`
- Create: `app/Models/KitchenStation.php`, `app/Models/KitchenSendBatch.php`, `app/Models/KitchenWorkGroup.php`
- Create: `app/Console/Commands/BackfillKitchenDispatch.php`
- Test: `tests/Feature/Kitchen/KitchenDispatchBackfillTest.php`

**Interfaces:**
- Consumes: existing `orders`, `order_items`, `menu_categories` tables.
- Produces: tables/columns exactly per spec §Minimal proposed persistence; Eloquent relations `Batch->groups()`, `Group->batch()/station()/items()`, `OrderItem->workGroup()`, `MenuCategory->kitchenStation()`.

- [ ] **Step 1: Write the failing migration test**

```php
it('creates kitchen dispatch tables with general station seed', function () {
    expect(Schema::hasTable('kitchen_stations'))->toBeTrue();
    expect(Schema::hasTable('kitchen_send_batches'))->toBeTrue();
    expect(Schema::hasTable('kitchen_work_groups'))->toBeTrue();
    expect(Schema::hasColumn('order_items', 'kitchen_work_group_id'))->toBeTrue();
    expect(\App\Models\KitchenStation::where('code', 'general')->exists())->toBeTrue();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test tests/Feature/Kitchen/KitchenDispatchBackfillTest.php`
Expected: FAIL with "Class App\Models\KitchenStation not found" (or missing table).

- [ ] **Step 3: Write minimal migration + models + seeder**

Migration creates `kitchen_stations (id, code unique, name, is_active)`, seeds one `general` row; `menu_categories.kitchen_station_id` nullable FK nullOnDelete; `kitchen_send_batches (id, order_id FK, sent_at UTC, target_minutes unsigned, long_wait_minutes unsigned, origin enum send/legacy_item)`; `kitchen_work_groups (id, batch_id FK cascade, station_id FK restrict, station_name snapshot, deadline_at UTC, version default 1, unique(batch_id, station_id))`; `order_items.kitchen_work_group_id` nullable indexed FK nullOnDelete; `kitchen_dispatch_settings (id, target_minutes default 15, long_wait_minutes default 20, version, updated_by, updated_at)` with one seeded row. Backfill command: chunk unlinked pending/processing items on non-draft/non-reserved/non-cancelled orders (incl. paid), one `legacy_item` batch+group per item, `sent_at` = `order_items.created_at ?? orders.created_at ?? now()` marked `approximate_sent_time = true` in output, station `general`, restartable via `whereNull(kitchen_work_group_id)` chunks of 500 in transactions.

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test tests/Feature/Kitchen/KitchenDispatchBackfillTest.php`
Expected: PASS.

- [ ] **Step 5: Static analysis**

Run: `composer types:check`
Expected: PASS (DocBlocks `@property`/`@property-read` on new models, typed constructor params).

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_10_16_000001_create_kitchen_dispatch_tables.php app/Models/KitchenStation.php app/Models/KitchenSendBatch.php app/Models/KitchenWorkGroup.php app/Console/Commands/BackfillKitchenDispatch.php tests/Feature/Kitchen/KitchenDispatchBackfillTest.php
git commit -m "feat(kitchen): add dispatch batch station schema and backfill"
```

---

### Task 2: Send linkage + projection service + deadline API

**Files:**
- Create: `app/Services/KitchenDispatchService.php`
- Modify: `app/Http/Controllers/Staff/POSController.php` (`sendToKitchen`)
- Modify: `app/Http/Controllers/Staff/KitchenController.php` (`index`)
- Modify: `routes/web.php`, `database/seeders/AuthorizationSeeder.php`, `app/Http/Controllers/Admin/RoleController.php`, `resources/js/pages/admin/RolesManager.tsx`
- Test: `tests/Feature/Kitchen/KitchenDispatchFlowTest.php`

**Interfaces:**
- Consumes: Task 1 tables/models.
- Produces: `KitchenDispatchService::projectPending(?int $stationId = null): array`; `updateDeadline(groupId, deadlineAt, reason, expectedVersion, userId): array`; `QueueGroup {id, batchId, orderId, stationId, stationName, sentAt, deadlineAt, targetMinutes, longWaitMinutes, version, origin, items[]}` + `serverNow`.

- [ ] **Step 1: Write the failing flow test**

```php
use App\Models\KitchenSendBatch;
use App\Models\KitchenWorkGroup;

it('creates one batch per send and partitions new items by station', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', ['table_id' => $table->id, 'items' => [['menu_item_id' => $item->id, 'quantity' => 2]]])
        ->assertRedirect();
    expect(KitchenSendBatch::count())->toBe(1);
    expect(KitchenWorkGroup::count())->toBeGreaterThanOrEqual(1);
});

it('rejects deadline edit without permission', function () {
    $table = posTable();
    $item = posMenuItem();
    $this->actingAs(posStaff(['pos.create'], ['/staff/pos']))
        ->post('/staff/pos/send-to-kitchen', ['table_id' => $table->id, 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]]);
    $group = KitchenWorkGroup::firstOrFail();
    $this->actingAs(posStaff(['kitchen.view'], ['/staff/kitchen']))
        ->patchJson("/staff/kitchen/work-groups/{$group->id}/deadline", ['deadline_at' => now()->addMinutes(5)->toIso8601String(), 'reason' => 'VIP', 'expected_version' => 1])
        ->assertForbidden();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test tests/Feature/Kitchen/KitchenDispatchFlowTest.php`
Expected: FAIL with missing table/service or 404 route.

- [ ] **Step 3: Write minimal implementation**

`sendToKitchen`: inside the existing DB transaction, after new `OrderItem` rows are created, create one `KitchenSendBatch` (server `now()` UTC, snapshot current settings), partition new items by resolved station (`menuItem->category->kitchen_station_id ?? general`), create one `KitchenWorkGroup` per station with `deadline_at = sent_at + target snapshot`, link items. Reduction-only payloads create no batch. Idempotency key replay returns the original outcome without new rows. `projectPending`: pending = item status `pending|processing`, quantity > 0, order not cancelled; group vanishes when empty; partial updates keep identity/deadline. `PATCH deadline`: validate `deadline_at` (timezone-aware), `reason` trimmed 1–255 chars, `expected_version`; authorize `kitchen.dispatch.manage` server-side (401/403/404/409/422 per spec); lock row, write + `OrderActivityLogger` event `kitchen_deadline_changed` with actor/old/new/time in the same transaction, bump version, broadcast refresh. Register the permission string in both seeder arrays; add the full-string entry `kitchen.dispatch.manage: 'Quản lý hạn điều phối'` to `PERMISSION_LABEL_DICTIONARY` and verify grouping/label in the roles modal.

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test tests/Feature/Kitchen/KitchenDispatchFlowTest.php`
Expected: PASS.

- [ ] **Step 5: Full suite + static analysis**

Run: `php artisan test`
Expected: 100% green (sqlite `:memory:`, no skipped/deleted tests).

Run: `composer types:check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Services/KitchenDispatchService.php app/Http/Controllers/Staff/POSController.php app/Http/Controllers/Staff/KitchenController.php routes/web.php database/seeders/AuthorizationSeeder.php app/Http/Controllers/Admin/RoleController.php resources/js/pages/admin/RolesManager.tsx tests/Feature/Kitchen/KitchenDispatchFlowTest.php
git commit -m "feat(kitchen): link sends to dispatch groups and deadline API"
```

---

### Task 3: Pure ordering queue (FIFO + Min-Heap) + tests

**Files:**
- Create: `resources/js/pages/staff/kitchen/utils/dispatchQueue.ts`
- Test: `resources/js/pages/staff/kitchen/utils/dispatchQueue.test.ts`

**Interfaces:**
- Consumes: `QueueGroup[]` shape from Task 2.
- Produces: `orderGroups(groups: readonly QueueGroup[], mode: 'fifo' | 'priority', nowMs: number): QueueGroup[]` (new array, inputs frozen).

- [ ] **Step 1: Write the failing test**

```ts
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { orderGroups } from './dispatchQueue.ts';

const g = (id: number, sentAt: string, deadlineAt: string) => ({
    id, batchId: id, orderId: id, stationId: 1, stationName: 'general',
    sentAt, deadlineAt, targetMinutes: 15, longWaitMinutes: 20, version: 1, origin: 'send', items: [],
});

describe('orderGroups', () => {
    it('fifo orders by sentAt then id', () => {
        const out = orderGroups([g(2, '2026-10-16T10:01:00Z', '2026-10-16T10:16:00Z'), g(1, '2026-10-16T10:00:00Z', '2026-10-16T10:15:00Z')], 'fifo', Date.parse('2026-10-16T10:30:00Z'));
        assert.deepEqual(out.map((x) => x.id), [1, 2]);
    });
    it('long-wait partition beats earlier deadline', () => {
        const now = Date.parse('2026-10-16T11:00:00Z');
        const out = orderGroups([
            g(1, '2026-10-16T10:50:00Z', '2026-10-16T10:55:00Z'),
            g(2, '2026-10-16T10:00:00Z', '2026-10-16T12:00:00Z'),
        ], 'priority', now);
        assert.equal(out[0].id, 2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test resources/js/pages/staff/kitchen/utils/dispatchQueue.test.ts`
Expected: FAIL with "Cannot find module './dispatchQueue.ts'".

- [ ] **Step 3: Write minimal implementation**

Bottom-up binary Min-Heap over the comparator: long-wait (`nowMs - sentAt >= longWaitMinutes * 60000`, future sent → not long-wait) first ordered by `(sentAt, id)`; others by `(deadlineAt, sentAt, id)`. `orderGroups` freezes inputs in tests, builds heap O(n), extracts all O(n log n), returns a new array, captures one `nowMs` for the whole evaluation.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test resources/js/pages/staff/kitchen/utils/dispatchQueue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/staff/kitchen/utils/dispatchQueue.ts resources/js/pages/staff/kitchen/utils/dispatchQueue.test.ts
git commit -m "feat(kitchen): add fifo and priority dispatch queue"
```

---

### Task 4: Kitchen display wiring + simulation benchmark

**Files:**
- Modify: `resources/js/pages/staff/kitchen/KitchenDisplay.tsx`, `resources/js/pages/staff/kitchen/components/KitchenOrderCard.tsx`
- Create: `resources/js/pages/staff/kitchen/utils/dispatchQueue.bench.ts`
- Modify: `docs/PROJECT_CONTEXT_AND_ROUTING.md` (kitchen section only)

**Interfaces:**
- Consumes: `workGroups` + `serverNow` props (Task 2), `orderGroups` (Task 3).
- Produces: FIFO/priority toggle (default FIFO), group cards with deadline/wait/`Chờ lâu`/`Quá hạn` labels, deadline edit dialog (permission-gated, reason required), 15s clock rebuild + 30s refetch + reconnect refetch, stale/disconnected states.

- [ ] **Step 1: Wire the display**

Default mode FIFO; toggle to priority reuses the same comparator. Server-adjusted `now` = `serverNow + (Date.now() - receivedAt)`; rebuild ordering on data/mode/station change, tab visibility restore, and each 15s tick. Refetch `only: ['workGroups','serverNow','orders','stats']` every 30s while visible and on reconnect; show stale banner and disable deadline mutations while disconnected, retaining last display. Deadline edit sends `{deadline_at, reason, expected_version}`; on failure keep old value, show the server message, no optimistic update. Existing item complete/cancel actions unchanged; paid-order groups use item-level completion only.

- [ ] **Step 2: Write the benchmark + simulation script**

Seed 20261016; n = 100/1,000/10,000 groups; 5 warmups/30 measured runs; record runtime/hardware; separate projection/network vs heap-build vs first-extract vs full-extract vs render; median/p95 + op counts; oracle-compare full output to comparator sort. Simulation: identical seeded arrivals/stations/service durations/worker counts for FIFO vs priority, nonpreemptive, same tie-breaks; report avg/max arrival-to-start wait and deadline-miss counts/shares (unfinished-at-horizon listed separately); publish both outcomes even if priority is worse.

- [ ] **Step 3: Verify**

Run: `node --test resources/js/pages/staff/kitchen/utils/dispatchQueue.test.ts`
Expected: PASS.

Run: `npm run types:check`
Expected: PASS.

Run: `npx eslint resources/js/pages/staff/kitchen/utils/dispatchQueue.ts resources/js/pages/staff/kitchen/utils/dispatchQueue.test.ts resources/js/pages/staff/kitchen/KitchenDisplay.tsx resources/js/pages/staff/kitchen/components/KitchenOrderCard.tsx`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/kitchen/KitchenDisplay.tsx resources/js/pages/staff/kitchen/components/KitchenOrderCard.tsx resources/js/pages/staff/kitchen/utils/dispatchQueue.bench.ts docs/PROJECT_CONTEXT_AND_ROUTING.md
git commit -m "feat(kitchen): wire dispatch recommendation display and benchmarks"
```

---

## Self-Review

- Spec coverage: batch×station unit + frozen station (Tasks 1–2), FIFO/priority keys + exact 20-min snapshot rule (Task 3), 15/20 snapshots future-only (Tasks 1–2), manual edit permission/audit/version (Task 2), legacy approximate backfill + readiness gate (Task 1), immutable input + rebuild cadence (Tasks 3–4), oracle + equal-capacity simulation (Task 4). Permission-naming conflict flagged in Global Constraints, not silently resolved.
- Placeholder scan: no TBD/TODO; every step has concrete code/commands.
- Type consistency: `QueueGroup`, `orderGroups`, `KitchenDispatchService::projectPending/updateDeadline` names stable across tasks.
