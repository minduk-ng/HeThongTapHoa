# Security Critical + High Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loại bỏ toàn bộ Critical/High findings: privilege escalation, cọc bank giả→cash, refund/cancel vượt quyền, supplier debt tampering, spoofable checkout lock, CSV formula injection, email takeover và secret exposure.

**Architecture:** `PrivilegeGuard` bảo vệ đặc quyền; `MoneyLedgerService` là append-only source cho cash-in/out; mutation tiền có permission riêng; supplier partial payment dùng allocation; checkout lock chuyển server-side Redis; export đi qua sanitizer.

**Tech Stack:** Laravel 13/PHP 8.3+, Pest, Redis cache/locks, React 19/Inertia.

**Spec:** `docs/superpowers/specs/2026-09-17-security-critical-high-design.md`

## Global Constraints

- Không thêm dependency nếu platform/Laravel đã có.
- Không dùng `@phpstan-ignore`, baseline, `eslint-disable` để che lỗi mới.
- Money ledger append-only; không update/delete qua UI.
- Thu ngân được permission mutation tiền; guest/kitchen/inventory không được.
- Cash-out không chờ duyệt, nhưng mọi giao dịch phải có actor/shift/reference/reason/warnings.
- Gate mỗi task: focused Pest → full Pest → `composer types:check` → Pint → eslint/tsc/build nếu có frontend.

---

### Task 1: Root admin invariant + PrivilegeGuard

**Files:**
- Create: `database/migrations/2026_09_17_000001_add_is_root_admin_to_users.php`
- Create: `app/Services/Security/PrivilegeGuard.php`
- Create: `app/Models/SecurityAuditLog.php`
- Create: `database/migrations/2026_09_17_000002_create_security_audit_logs_table.php`
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `app/Http/Controllers/Admin/UserPermissionController.php`
- Modify: `app/Http/Controllers/Admin/RoleController.php`
- Test: `tests/Feature/Security/PrivilegeEscalationTest.php`

**Interfaces:**
- Produces `User::is_root_admin` boolean and `PrivilegeGuard` methods from spec.

- [ ] **Step 1: Write failing tests**

```php
<?php

use App\Models\Role;
use App\Models\User;

test('non root cannot assign admin role to self', function () {
    $user = posStaff(['users.edit'], ['/admin/permissions']);
    Role::firstOrCreate(['name' => 'admin'], ['description' => 'Admin', 'is_system' => true]);

    $this->actingAs($user)->put("/admin/permissions/{$user->id}", [
        'roles' => ['admin'],
    ])->assertForbidden();

    expect($user->fresh()->isAdmin())->toBeFalse();
});

test('root admin flag is not mass assignable', function () {
    $admin = posAdmin();
    $admin->fill(['is_root_admin' => true])->save();
    expect((bool) $admin->fresh()->is_root_admin)->toBeFalse();
});
```

- [ ] **Step 2: Run RED**

`php artisan test --filter=PrivilegeEscalationTest`

- [ ] **Step 3: Add migrations/model**

`users.is_root_admin` default false/index. `security_audit_logs` fields exactly per spec (`actor_id`, `action`, polymorphic-like target_type/id, before/after JSON, ip, user_agent, created_at).

- [ ] **Step 4: Implement PrivilegeGuard**

```php
final class PrivilegeGuard
{
    public static function assertRoot(User $actor): void
    {
        abort_unless((bool) $actor->is_root_admin, 403);
    }

    public static function assertCanAssignRoles(User $actor, User $target, array $roles): void
    {
        if (in_array('admin', $roles, true) || $target->isAdmin() || $target->is_root_admin) {
            static::assertRoot($actor);
            abort_if($target->id !== $actor->id && in_array('admin', $roles, true), 403);
        }
        abort_if($actor->id === $target->id && ! $actor->is_root_admin, 403);
    }
}
```

Implement remaining role checks per spec; controller calls guard before sync. Seeder marks exactly one `ADMIN_EMAIL` user root; aborts when ambiguous. Audit before/after.

- [ ] **Step 5: GREEN + full suite**

`php artisan test --filter=PrivilegeEscalationTest`; then full suite.

- [ ] **Step 6: Commit**

`git commit -m "security(rbac): root admin invariant + PrivilegeGuard + audit log"`

---

### Task 2: Permission split for money/cancel mutations

**Files:**
- Modify: `database/seeders/AuthorizationSeeder.php`
- Modify: `routes/web.php`
- Modify: `app/Http/Controllers/Staff/RefundController.php`
- Modify: `app/Http/Controllers/Staff/POSController.php`
- Modify: `app/Http/Controllers/Staff/ReservationController.php`
- Modify: `app/Http/Controllers/Staff/ShiftController.php`
- Modify: `app/Http/Controllers/Manager/SupplierController.php`
- Test: `tests/Feature/Security/MoneyPermissionTest.php`

**Interfaces:** routes dùng permission mới; `POSController::sendToKitchen()` gọi permission check chỉ khi payload có `reduced_items`.

- [ ] **Step 1: Write failing permission matrix tests**

```php
test('pos.create alone cannot refund or reduce items', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);

    $this->actingAs($staff)->postJson('/staff/pos/refund', [])->assertForbidden();
    $this->actingAs($staff)->postJson('/staff/pos/send-to-kitchen', [
        'order_id' => 1,
        'items' => [],
        'reduced_items' => [['order_item_id' => 1, 'quantity' => 1, 'reason' => 'Khách đổi ý']],
    ])->assertForbidden();
});

test('shift viewer cannot record cash movement', function () {
    $viewer = posStaff(['shifts.view'], ['/staff/shifts']);
    $this->actingAs($viewer)->postJson('/staff/shifts/movements', [
        'type' => 'expense', 'category' => 'khac', 'amount' => 10000,
    ])->assertForbidden();
});
```

- [ ] **Step 2: Run RED** — `php artisan test --filter=MoneyPermissionTest`.
- [ ] **Step 3: Seed exact permissions**: `payments.refund`, `deposits.create`, `deposits.refund`, `suppliers.pay`, `orders.cancel`, `shifts.movement`, `cash-flow.view`; assign cashier role only.
- [ ] **Step 4: Update route middleware** and add controller-level check for `reduced_items`:

```php
if (! empty($validated['reduced_items']) && ! $request->user()?->hasPermission('orders.cancel')) {
    abort(403);
}
```

- [ ] **Step 5: GREEN + full suite** — focused test, then `php artisan test`, PHPStan/Pint.
- [ ] **Step 6: Commit**

`git commit -m "security(authz): split permissions for refund, deposit, supplier payment, cancel, shift movement"`

---

### Task 3: MoneyLedgerService + cash-flow page

**Files:**
- Create migration/model/service/controller: `money_ledger_entries`, `MoneyLedgerEntry`, `MoneyLedgerService`, `Manager/CashFlowController`
- Create frontend: `resources/js/pages/manager/cash-flow/CashFlowManager.tsx`
- Modify routes + page/permission seeder
- Test: `tests/Feature/MoneyLedgerTest.php`

**Interfaces:**
- `recordIn(string $type, float $amount, string $method, ?User $actor, array $links = [], array $meta = []): MoneyLedgerEntry`
- `recordOut(...)` cùng signature.

- [ ] **Step 1: Write failing ledger tests**

```php
test('large cash out is append only and warned', function () {
    $admin = posAdmin();
    $entry = app(MoneyLedgerService::class)->recordOut(
        'order_refund', 1_000_000, 'cash', $admin, [], ['source_method' => 'bank_transfer']
    );

    expect($entry->direction)->toBe('out')
        ->and($entry->warning_flags)->toContain('large_cash_out')
        ->and($entry->warning_flags)->toContain('bank_to_cash_refund');
});
```

- [ ] **Step 2: Run RED** — `php artisan test --filter=MoneyLedgerTest`.
- [ ] **Step 3: Schema/model** per spec; amount positive; JSON casts; no update/delete route.
- [ ] **Step 4: Service**

```php
public function recordOut(string $type, float $amount, string $method, ?User $actor, array $links = [], array $meta = []): MoneyLedgerEntry
```

Reject amount <=0; auto shift lookup; deterministic warning flags; write inside caller transaction.
- [ ] **Step 5: Integrate** sale/deposit/refund/supplier/cash movement paths. Record one ledger row per actual money event; no duplicates with existing Payment rows.
- [ ] **Step 6: Cash-flow Inertia page** metrics + filters + DataTable; no edit/delete.
- [ ] **Step 7: Verify** — ledger tests, full suite, frontend checks.
- [ ] **Step 8: Commit**

`git commit -m "feat(security): append-only money ledger + cash-flow hậu kiểm"`

---

### Task 4: Bank deposit verification + safe cash refund audit

**Files:**
- Create migration add deposit fields
- Modify: `app/Models/Deposit.php`, `ReservationController.php`, `CheckoutService.php`, `PaymentDrawer.tsx`
- Test: `tests/Feature/Security/VerifiedDepositTest.php`

- [ ] **Step 1: Write failing tests**

```php
test('bank deposit requires reference and verification', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), []);

    $this->actingAs($admin)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id,
        'amount' => 100000,
        'method' => 'bank_transfer',
        'reference' => '',
        'bank_verified' => false,
    ])->assertStatus(422);
});
```

- [ ] **Step 2: Migration/model fields** from spec.
- [ ] **Step 3: Controller validation** `required_if:method,bank_transfer` reference + accepted verification; server derives verifier/time/shift.
- [ ] **Step 4: Checkout refund** preserves original source in ledger while payment remains cash per business decision.
- [ ] **Step 5: UI** reference input + mandatory checkbox only for bank transfer.
- [ ] **Step 6: Verify** — focused/full tests + tsc/build/eslint.
- [ ] **Step 7: Commit**

`git commit -m "security(deposit): verify bank deposits and audit bank-to-cash refunds"`

---

### Task 5: Refund/cancel/send-to-kitchen authorization invariants

**Files:** `RefundController`, `POSController`, routes, tests.

- [ ] **Step 1: Write failing tests** — missing `orders.cancel` cannot reduce; item from another order returns 422; paid/cancelled order rejected; refund requires `payments.refund` and writes ledger/audit.
- [ ] **Step 2: Inside sendToKitchen transaction** load requested order under lock, query reduced item by both `id` and `order_id`, guard state/qty.
- [ ] **Step 3: Refund** permission + reason + ledger entry; keep existing line locks/lot logic.
- [ ] **Step 4: Verify** focused/full tests.
- [ ] **Step 5: Commit**

`git commit -m "security(pos): enforce cancel/refund permissions and order-item ownership"`

---

### Task 6: Supplier partial payment allocations

**Files:** migration/model `SupplierPaymentAllocation`; modify `SupplierPayment`, `StockVoucher`, `Supplier::debt`, `SupplierController::storePayment`, modal/tests.

- [ ] **Step 1: Write failing tests**

```php
test('partial supplier payments cannot exceed outstanding', function () {
    // create supplier + import voucher total 100000
    // pay allocation 40000 => outstanding 60000, is_paid false
    // second allocation 70000 => 422
});
```

- [ ] **Step 2: Schema/relations** + `outstandingAmount(): float` derived from voucher total minus allocations.
- [ ] **Step 3: Transaction** lock vouchers + current allocation sums, validate, insert header/allocations, derive is_paid, ledger out.
- [ ] **Step 4: UI** allocations per voucher (amount input capped outstanding), total matches payment.
- [ ] **Step 5: Verify** focused/full tests + frontend gates.
- [ ] **Step 6: Commit**

`git commit -m "security(suppliers): partial debt payments with voucher allocations"`

---

### Task 7: Server-side checkout lock

**Files:** new `CheckoutLockService`, controller/routes/events; modify `usePOSCheckoutLock.ts`, channels/tests.

- [ ] **Step 1: Write failing tests** — acquire owner, conflict 409, owner release, non-owner forbidden, TTL reacquire using `Cache::store('array')`/time travel.
- [ ] **Step 2: Redis service** key/value/TTL per spec; acquire atomic, release owner/admin, renew.
- [ ] **Step 3: Endpoints** permission pos.create; broadcast status.
- [ ] **Step 4: Client** replace whisper authority with acquire/release/heartbeat API; whispers only informational or remove.
- [ ] **Step 5: Verify** focused/full tests + tsc/build.
- [ ] **Step 6: Commit**

`git commit -m "security(pos): server-authoritative checkout locks with Redis TTL"`

---

### Task 8: CSV formula sanitizer

**Files:** create `SpreadsheetCellSanitizer`; modify ProductController export and `reportExport.ts`; tests.

- [ ] **Step 1: Unit tests**

```php
it('neutralizes spreadsheet formulas', function (string $input) {
    expect(SpreadsheetCellSanitizer::sanitize($input))->toStartWith("'");
})->with(['=1+1', '+SUM(A1:A2)', '-1+1', '@cmd', "\tformula", "\rformula"]);
```

- [ ] **Step 2: PHP helper** used before `fputcsv`.
- [ ] **Step 3: TS helper** `escapeCsvCell` prefixes `'` before CSV quoting; XLSX explicit string.
- [ ] **Step 4: Verify** PHP/TS focused + full gates.
- [ ] **Step 5: Commit**

`git commit -m "security(export): neutralize spreadsheet formulas in CSV/XLSX exports"`

---

### Task 9: Email recent re-auth + secret cleanup

**Files:** ProfileController/routes/session helper; `.agents/AGENTS.md`; tests.

- [ ] **Step 1: Tests** — updateEmail without recent auth→403/validation; with password confirmation→OTP flow; email old receives notification; security audit created.
- [ ] **Step 2: Recent auth helper** session timestamp TTL 15m; password-confirm endpoint; Google-only requires OAuth reauth/password setup.
- [ ] **Step 3: updateEmail guard + audit**; rotate remember token now. Plan 2 will replace this with shared SessionRevoker while preserving behavior.
- [ ] **Step 4: Remove plaintext credential from `.agents/AGENTS.md`**; replace placeholder; document external rotation checklist without secret.
- [ ] **Step 5: Verify/commit**

`git commit -m "security(account): recent re-auth for email changes + remove plaintext credentials"`

---

## Final Gate

- Full Pest suite.
- `composer types:check` (PHPStan level 7).
- `pint --test`.
- `npm run lint:check`, `npm run types:check`, `npm run build`.
- `composer audit --locked` and `npm audit --omit=dev` recorded (dependency fixes in Plan 2).
