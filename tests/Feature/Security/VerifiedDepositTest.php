<?php

use App\Models\Deposit;
use App\Models\MoneyLedgerEntry;
use App\Models\Payment;
use App\Models\Shift;

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

    expect(Deposit::where('order_id', $order->id)->count())->toBe(0);
});

test('bank deposit with reference but without verification is rejected', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), []);

    $this->actingAs($admin)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id,
        'amount' => 100000,
        'method' => 'bank_transfer',
        'reference' => 'CK-123456',
        'bank_verified' => false,
    ])->assertStatus(422);

    expect(Deposit::where('order_id', $order->id)->count())->toBe(0);
});

test('verified bank deposit stores server-derived verifier, time and shift', function () {
    $admin = posAdmin();
    $other = posAdmin();
    $shift = Shift::create(['opened_at' => now(), 'opening_cash' => 100000, 'status' => 'open', 'opened_by' => $admin->id]);
    $order = posOrder(posTable(), []);

    $this->actingAs($admin)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id,
        'amount' => 100000,
        'method' => 'bank_transfer',
        'reference' => 'CK-123456',
        'bank_verified' => true,
        // Spoof attempt: client must not control verifier/shift.
        'verified_by_user_id' => $other->id,
        'shift_id' => 999999,
    ])->assertOk();

    $deposit = Deposit::where('order_id', $order->id)->firstOrFail();
    expect($deposit->status)->toBe('held')
        ->and($deposit->reference)->toBe('CK-123456')
        ->and((bool) $deposit->bank_verified)->toBeTrue()
        ->and($deposit->verified_by_user_id)->toBe($admin->id)
        ->and($deposit->verified_at)->not->toBeNull()
        ->and($deposit->shift_id)->toBe($shift->id);
});

test('cash deposit needs no reference or verification', function () {
    $admin = posAdmin();
    $order = posOrder(posTable(), []);

    $this->actingAs($admin)->postJson('/staff/pos/deposit', [
        'order_id' => $order->id,
        'amount' => 50000,
        'method' => 'cash',
    ])->assertOk();

    $deposit = Deposit::where('order_id', $order->id)->firstOrFail();
    expect($deposit->status)->toBe('held')
        ->and((bool) $deposit->bank_verified)->toBeFalse()
        ->and($deposit->verified_by_user_id)->toBeNull();
});

test('reservation with unverified bank deposit is rejected', function () {
    $admin = posAdmin();
    $table = posTable(['status' => 'available']);

    $this->actingAs($admin)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Anh Test',
        'reservation_phone' => '0912345678',
        'reservation_time' => now()->addHour()->toDateTimeString(),
        'deposit' => ['amount' => 100000, 'method' => 'bank_transfer'],
    ])->assertStatus(422);

    expect(Deposit::count())->toBe(0);
});

test('checkout refunds excess bank deposit in cash with audited source', function () {
    $staff = posStaff();
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem(['price' => 20000]);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'served']], ['status' => 'completed']);
    Deposit::create([
        'order_id' => $order->id, 'amount' => 100000, 'method' => 'bank_transfer',
        'status' => 'held', 'reference' => 'CK-999', 'bank_verified' => true,
    ]);

    $this->actingAs($staff)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 0,
        'change_amount' => 0,
    ])->assertOk();

    // Payment remains cash per business decision.
    $refundPayment = Payment::where('invoice_id', $order->fresh()->invoice->id)
        ->where('amount', '<', 0)->firstOrFail();
    expect($refundPayment->method)->toBe('cash');

    $entry = MoneyLedgerEntry::where('type', 'deposit_refund')
        ->where('order_id', $order->id)
        ->orWhere('invoice_id', $order->fresh()->invoice->id)
        ->firstOrFail();
    expect($entry->method)->toBe('cash')
        ->and($entry->meta['source_method'] ?? null)->toBe('bank_transfer')
        ->and($entry->meta['reference'] ?? null)->toBe('CK-999')
        ->and($entry->warning_flags)->toContain('bank_to_cash_refund');
});
