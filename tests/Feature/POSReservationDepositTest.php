<?php

use App\Models\Deposit;
use App\Models\Order;
use App\Models\Table;

it('reserves an available table with customer info only', function () {
    $staff = posStaff();
    $table = posTable();

    $res = $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Anh Đức',
        'reservation_phone' => '0901234567',
        'reservation_time' => now()->addHours(2)->toDateTimeString(),
    ]);

    $res->assertOk();
    $order = Order::where('table_id', $table->id)->first();
    expect($order->status)->toBe('reserved')
        ->and($order->reservation_name)->toBe('Anh Đức')
        ->and($order->total)->toBe(0.0);
    expect($table->fresh()->status)->toBe('reserved')
        ->and($table->fresh()->reservation_name)->toBe('Anh Đức');
});

it('reserves with pre-selected items and deposit', function () {
    $staff = posStaff();
    $table = posTable();
    $item = posMenuItem(['price' => 50000]);

    $res = $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Chị Hoa',
        'reservation_phone' => '0912345678',
        'reservation_time' => now()->addHours(1)->toDateTimeString(),
        'items' => [['menu_item_id' => $item->id, 'quantity' => 2]],
        'deposit' => ['amount' => 100000, 'method' => 'cash'],
    ]);

    $res->assertOk();
    $order = Order::where('table_id', $table->id)->first();
    expect($order->items()->count())->toBe(1)
        ->and((float) $order->subtotal)->toBe(100000.0);
    $deposit = Deposit::where('order_id', $order->id)->first();
    expect($deposit->status)->toBe('held')
        ->and((float) $deposit->amount)->toBe(100000.0)
        ->and($deposit->received_by_user_id)->toBe($staff->id);
});

it('keeps occupied table status when reserving for later', function () {
    $staff = posStaff();
    $table = posTable(['status' => 'occupied']);
    posOrder($table); // đơn khách hiện tại

    $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Anh Ba',
        'reservation_phone' => '0900000001',
        'reservation_time' => now()->addHours(3)->toDateTimeString(),
    ])->assertOk();

    expect($table->fresh()->status)->toBe('occupied');
});

it('rejects reserve with missing required fields', function () {
    $staff = posStaff();
    $table = posTable();

    $this->actingAs($staff)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
    ])->assertStatus(422);
});
