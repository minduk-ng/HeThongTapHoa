# Task 11 Final Security Wave Report

## Finding Mapping

1. **Critical: durable idempotency**
   - Required `idempotency_key` on checkout, bulk checkout, deposit, refund, supplier payment, and cash movement.
   - Added canonical recursive fingerprint sorting with SHA-256.
   - Added `resource_type`/`resource_id` linkage and transaction-local success recording.
   - Stale processing records replay committed linked resources instead of re-executing.
   - Added missing-key, replay, mismatch, and crash-after-commit regression coverage.
2. **Critical: root admin seeding**
   - Resolve root invariant before role assignment.
   - Preserve exactly one existing root; strip admin from all non-roots.
   - Abort on multiple roots; bootstrap one configured root when none exists.
   - Exact-sync cashier permissions/pages and remove stale dangerous pivots.
3. **Important: table alternate cancel**
   - Lock table, reserved order, and held deposits in one transaction.
   - Require `orders.cancel`, plus `deposits.refund` when held deposits exist.
4. **Important: expected cash**
   - Derive expected cash only from shift-scoped cash ledger entries.
   - Removed legacy Payment/Deposit/CashMovement double counting.
5. **Important: financial fingerprints**
   - Fingerprints now include every validated mutation field except idempotency key.
   - Lists and nested maps canonicalized deterministically.
6. **Important: supplier migration backfill**
   - Added `is_migration_backfill`; synthetic headers excluded from supplier payment relation/totals.
   - Allocations still settle historical voucher debt; down migration targets marked synthetic rows.
7. **Important: session revocation**
   - Added `users.session_version`, login/session initialization, middleware comparison, and revocation increment.
   - Current session version refreshed; database rows still removed; cache/Redis peers invalidate on next request.
8. **Important: checkout lock ownership**
   - Added immutable UUID owner token.
   - Release/renew require user and token.
   - Redis paths use atomic Lua compare/delete and compare/expire; fallback uses cache lock.
9. **Important: legacy OTP migration**
   - Existing OTP rows deleted during hash/lockout migration.
10. **Important: atomic OTP consume**
    - Added row-locked transactional consume with optional credential mutation callback.
    - Signup, email change, and password change use atomic consume.
11. **Important: report bounds**
    - Capped seven detail report families at 500 rows.
    - Added total/truncated metadata and shared visible warning.
12. **Important: ledger schema/service**
    - Added reference, reason, occurred_at/index/backfill.
    - Added outside_shift, refund_burst, and large_deposit warnings with config thresholds.
    - Cash flow validates paired 90-day ranges and filters by occurred_at.
13. **Important: import preview**
    - Preview key includes actor ID and random token; payload stores actor ID.
    - Confirm checks ownership and consumes under cache lock with `Cache::pull`.
14. **Cheap fixes**
    - Product image deletion occurs only after DB update; failed update deletes new upload, preserves old image.
    - Report export Node test wired into package script and CI workflow.
    - Newline added to PHP and TypeScript spreadsheet formula triggers.
    - Added `pos.view` presence-room test.
    - Full-order cancel frontend gate now requires `orders.cancel`.

## Verification

- `php artisan migrate:fresh --env=testing --force`: PASS, all migrations.
- `php artisan test`: PASS, 616 tests, 3172 assertions.
- `composer types:check`: PASS, 0 errors.
- `vendor/bin/pint --test`: PASS.
- `npm run test:report-export`: PASS, 7 tests.
- `npx eslint .`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS. Existing chunk-size advisory only.
- `git diff --check`: PASS.
- `node .gitnexus/run.cjs detect-changes --scope all`: CRITICAL blast radius, 92 changed symbols, 95 affected flows; expected auth/payment/report security scope.

## Re-review Fixes (NB1/NB2)

1. **NB1 (Critical): Redis eval() argument order in `CheckoutLockService`**
   - `add`/`compareAndDelete`/`compareAndPut` passed the args array where `numKeys` belongs → TypeError on every Redis acquire/release/renew.
   - Fixed via one `evalScript()` helper calling `command('eval', ...)` per driver: phpredis `(script, args[], 2)`, predis `(script, 2, ...keys/args)` (base `Connection::command` is typed, so phpstan stays honest; Lua scripts unchanged).
   - Tests: two mocked-connection tests assert the eval shape for both phpredis (acquire/renew/release) and predis (acquire) branches; existing array-driver `Cache::lock` fallback tests untouched and green.
2. **NB2 (Important): summary metrics from capped 500-row window**
   - `InvoiceItemsReportController`: total_amount/discount/quantity/invoice_count now SQL aggregates on the cloned base query (`sum`/`COUNT(DISTINCT invoice_id)`); `line_count` = uncapped `total_count`.
   - `ProductDetailsReportController`: revenue/quantity summed via SQL over the uncapped grouped subquery; `item_count` = uncapped `total_count`; `top_item` still from capped rows (row 1 by revenue is the true top).
   - `ProfitReportController`: headline revenue/cost computed from the uncapped `$items` collection (same recipe-cost formula as `daily`); `rows` stays capped at 500 items.
   - `ReservationsReportController`: `deposit_total` = SQL sum of held `deposits.amount` joined to the full filtered reservation range.
   - Tests: InvoiceItems (502 lines on 1 invoice) and Profit (501 items × 1 line) assert exact full-range summary totals with 500-row detail cap and `pagination.truncated` true.

### Verification (re-review wave)

- `php artisan test`: PASS, 620 tests, 3220 assertions.
- `composer types:check`: PASS, 0 errors.
- `vendor/bin/pint --test`: PASS.
- `npx eslint .`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS. Existing chunk-size advisory only.
