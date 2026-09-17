# Security Medium + Low Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khóa WebSocket/OTP/session, sửa promotion/payment/idempotency/reservation races, giới hạn report/import DoS và harden production/CDN/dependencies.

**Architecture:** Reusable guards/services (OTP attempt policy, SessionRevoker, IdempotencyService, DateRange rule) thay vì patch từng controller.

**Tech Stack:** Laravel 13/PHP 8.3+, Redis, Pest, React/Inertia.

**Spec:** `docs/superpowers/specs/2026-09-17-security-medium-hardening-design.md`

## Global Constraints

- Không dùng ignore/baseline để làm xanh CI.
- Max report range 90 ngày; import CSV 2MB/5000 dòng.
- Giữ current session, revoke session khác sau credential change.
- Free product = 1 unit mỗi application.
- Idempotency durable cho money mutations, cache TTL chỉ phụ.
- Gate mỗi task: focused + full tests, PHPStan 7, Pint, frontend CI nếu đụng TS.

---

### Task 1: WebSocket permission matrix

**Files:** `routes/channels.php`, `tests/Feature/SecurityAdminAndChannelTest.php`, `app/Models/User.php` only if shared helper is missing.

- [ ] **Step 1: Write failing matrix tests**

```php
test('private pos channel requires pos permission', function () {
    $guest = posStaff([], []);
    $this->actingAs($guest)->postJson('/broadcasting/auth', [
        'socket_id' => '1.1', 'channel_name' => 'private-pos-channel',
    ])->assertForbidden();
});
```

- [ ] Implement callbacks: pos.view, kitchen.view, ingredients.view|inventory.history.view, pos.view|pos.create.
- [ ] Update existing SecurityAdminAndChannelTest expectations.
- [ ] Run focused/full tests and commit: `security(ws): permission-gated private channels and pos-room`.

---

### Task 2: OTP attempts, hashing and purpose isolation

**Files:** migration `otp_codes`; model; Signup/Forgot/Otp/Profile controllers; throttling/tests.

- [ ] **Step 1: Write failing tests:** wrong attempts 1-4 keep code usable, fifth locks; locked/expired generic response; purposes isolated; forgot reset does not delete change-email OTP.
- [ ] Add attempts/locked_at/index; hash new OTP values; verify Hash::check; atomically increment under lock.
- [ ] Principal rate limiter key email/user+purpose+session plus existing IP throttle.
- [ ] Verify focused/full tests and commit: `security(otp): hash codes, 5-attempt lockout and purpose isolation`.

---

### Task 3: SessionRevoker after credential changes

**Files:** new `SessionRevoker`; ForgotPassword/Profile/OAuth/password controllers; tests.

- [ ] **Step 1: Write failing test:** insert two sessions for user; call service with current ID; assert other deleted/current preserved/remember token rotated.
- [ ] Implement `SessionRevoker::revokeOthers(User $user, string $currentSessionId): void` and call after reset/change password/email.
- [ ] Verify focused/full tests and commit: `security(session): revoke other sessions after credential changes`.

---

### Task 4: Free product quantity = 1

**Files:** PromotionEngine, CheckoutService, promotion tests/frontend preview if needed.

- [ ] **Step 1: RED test** cart qty=5 gift item; expected discount exactly one unit price, invoice-line totals remain consistent.
- [ ] Replace `free_item_ids` semantics with `free_items [{menu_item_id,quantity:1}]`; deterministic line allocation.
- [ ] Search all consumers (`grep free_item_ids`), migrate each, then remove legacy key in same task.
- [ ] Verify promotion/checkout/full tests and commit: `fix(promotions): free_product discounts one unit only`.

---

### Task 5: Net cash payment / change accounting

**Files:** CheckoutService, ShiftService/payment tests/reports.

- [ ] **Step 1: RED test** payable 50k, received 100k → invoice received 100k/change 50k, Payment cash 50k, expectedCash +50k.
- [ ] Normalize payment rows server-side; cap cash payment at remaining payable; reject non-cash overpayment.
- [ ] Ensure mixed payment sum/net correct.
- [ ] Verify payment/shift/report/full tests and commit: `fix(payments): ledger records net cash, not gross amount received`.

---

### Task 6: Durable idempotency

**Files:** migration/model/service/middleware-ish helper; all money mutation controllers; cleanup command; tests.

- [ ] **Step 1: Write failing tests** new/processing/succeeded replay/failed retry and cross-user scope; duplicate request creates one payment/deposit only.
- [ ] Schema unique `(action,key)` + user/fingerprint/status/response.
- [ ] Service begin/succeed/fail around DB commit; require keys for checkout/deposit/refund/supplier payment/cash movement.
- [ ] Cleanup command 30 days + schedule.
- [ ] Verify focused/full tests and commit: `security(idempotency): durable records for financial mutations`.

---

### Task 7: Reservation transition locking

**Files:** ReservationController, tests.

- [ ] **Step 1: Write tests** duplicate reservation for same table rejected; repeated check-in/cancel idempotent/rejected; deposits resolve once.
- [ ] `reserve`: transaction + lock table + active reservation check.
- [ ] `checkIn`: lock order/table; `cancel`: lock order/deposits/table.
- [ ] Verify reservation/full tests and commit: `fix(reservations): serialize reserve/check-in/cancel transitions`.

---

### Task 8: Report DateRange rule + pagination

**Files:** reusable FormRequest/rule; 7 report controllers; frontend error/filters tests.

- [ ] **Step 1: Write shared-rule tests** valid 90 days, reject 91, start>end, invalid dates.
- [ ] Implement shared parser/rule; apply SalesInvoice/Cancelled/Reservations/Payments/InvoiceItems/Consumption/StockMovement.
- [ ] Replace unbounded detail `get()` with pagination where UI supports; summaries use aggregate SQL.
- [ ] Exports reuse same max range.
- [ ] Verify all report tests/full suite and commit: `security(reports): enforce 90-day range and paginate detail queries`.

---

### Task 9: Product import limits + safe errors

**Files:** ProductController/import service/tests.

- [ ] **Step 1: Write failing tests** >2MB reject, 5001 rows reject, XLSX reject, valid CSV <=5000 works, exception response generic.
- [ ] Stream `fgetcsv`; stop after 5000; only csv MIME/extensions; preview cache TTL, not giant session.
- [ ] Log correlation ID/detail; client sees generic message.
- [ ] Verify import/full tests and commit: `security(import): stream CSV with 2MB/5000-row limits and safe errors`.

---

### Task 10: Production defaults + CDN upload hardening

**Files:** `.env.example`, ProductController, SirvClientService/adapter, tests.

- [ ] **Step 1: Write upload failure/collision tests** — failed Sirv upload does not persist URL; two same-name uploads produce distinct paths.
- [ ] `.env.example`: debug false, log warning, secure cookie note, placeholder QR/bank.
- [ ] Upload filename slug+ULID; adapter false→exception; persist URL only after success; safe logs.
- [ ] Verify product/CDN/full tests and commit: `security(prod): safe defaults and atomic CDN uploads`.

---

### Task 11: Dependency advisory remediation

**Files:** composer.lock/package-lock.json; audit report.

- [ ] Capture before-audit output to task report.
- [ ] `composer update league/commonmark --with-all-dependencies` within constraints; no unrelated major.
- [ ] `npm audit fix` without force; inspect lock diff.
- [ ] Record remaining advisories + reachability.
- [ ] Full CI gate.
- [ ] Commit: `chore(security): update vulnerable PHP/Node dependencies`.

---

## Final Gate

- Full Pest suite.
- PHPStan level 7 zero errors.
- Pint clean.
- ESLint/tsc/build clean.
- Route permission matrix tests green.
- Composer/npm audit outputs saved in report.
