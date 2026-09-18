<?php

use App\Models\Deposit;
use App\Models\MoneyLedgerEntry;
use App\Models\Order;

test('reserving an already reserved table returns 422', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $table = posTable();

    $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Anh Đức',
        'reservation_phone' => '0901234567',
        'reservation_time' => now()->addHours(2)->toDateTimeString(),
    ])->assertOk();

    expect(Order::where('table_id', $table->id)->where('status', 'reserved')->count())->toBe(1);

    $res = $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Chị Lan',
        'reservation_phone' => '0909876543',
        'reservation_time' => now()->addHours(3)->toDateTimeString(),
    ]);

    $res->assertStatus(422)
        ->assertJsonFragment(['message' => 'Bàn này đã có đơn đặt trước chưa hoàn tất.']);

    expect(Order::where('table_id', $table->id)->count())->toBe(1);
});

test('occupied table with existing reservation cannot be reserved again', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $table = posTable(['status' => 'occupied']);
    posOrder($table); // active order on occupied table

    $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Anh Ba',
        'reservation_phone' => '0900000001',
        'reservation_time' => now()->addHours(3)->toDateTimeString(),
    ])->assertOk();

    $res = $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Chị Bốn',
        'reservation_phone' => '0900000002',
        'reservation_time' => now()->addHours(4)->toDateTimeString(),
    ]);

    $res->assertStatus(422)
        ->assertJsonFragment(['message' => 'Bàn này đã có đơn đặt trước chưa hoàn tất.']);
});

test('repeated check-in returns 422', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $table = posTable(['status' => 'reserved', 'reservation_name' => 'Anh Đức']);
    $order = posOrder($table, [], [
        'status' => 'reserved',
        'reservation_name' => 'Anh Đức',
    ]);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/check-in', [
        'order_id' => $order->id,
        'idempotency_key' => 'checkin_key_1',
    ])->assertOk();

    expect($order->fresh()->status)->toBe('draft');

    $res = $this->actingAs($staff)->postJson('/staff/pos/reservation/check-in', [
        'order_id' => $order->id,
        'idempotency_key' => 'checkin_key_2',
    ]);

    $res->assertStatus(422)
        ->assertJsonFragment(['message' => 'Đơn này không phải đơn đặt bàn chờ check-in']);
});

test('repeated cancellation returns 422', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel']);
    $table = posTable(['status' => 'reserved', 'reservation_name' => 'Anh Đức']);
    $order = posOrder($table, [], ['status' => 'reserved']);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
        'idempotency_key' => 'cancel_key_1',
    ])->assertOk();

    expect($order->fresh()->status)->toBe('cancelled');

    $res = $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
        'idempotency_key' => 'cancel_key_2',
    ]);

    $res->assertStatus(422)
        ->assertJsonFragment(['message' => 'Chỉ có thể hủy đơn đặt bàn']);
});

test('deposits are resolved once and locked during cancel', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'orders.cancel', 'deposits.refund']);
    $table = posTable(['status' => 'reserved', 'reservation_name' => 'Anh Đức']);
    $order = posOrder($table, [], ['status' => 'reserved']);
    $deposit = Deposit::create([
        'order_id' => $order->id,
        'amount' => 150000,
        'method' => 'cash',
        'status' => 'held',
    ]);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
        'deposit_resolution' => 'refund',
        'note' => 'Khách bận',
        'idempotency_key' => 'cancel_dep_key_1',
    ])->assertOk();

    expect($order->fresh()->status)->toBe('cancelled');
    expect($deposit->fresh()->status)->toBe('refunded')
        ->and($deposit->fresh()->resolved_by_user_id)->toBe($staff->id)
        ->and($deposit->fresh()->resolved_at)->not->toBeNull();

    $ledgerCount = MoneyLedgerEntry::where('type', 'deposit_refund')
        ->where('order_id', $order->id)
        ->count();
    expect($ledgerCount)->toBe(1);

    // Repeated cancel attempt is rejected
    $res = $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
        'deposit_resolution' => 'refund',
        'idempotency_key' => 'cancel_dep_key_2',
    ]);

    $res->assertStatus(422)
        ->assertJsonFragment(['message' => 'Chỉ có thể hủy đơn đặt bàn']);

    // Deposits not touched again
    expect($deposit->fresh()->status)->toBe('refunded');
    expect(MoneyLedgerEntry::where('type', 'deposit_refund')
        ->where('order_id', $order->id)
        ->count())->toBe(1);
});
