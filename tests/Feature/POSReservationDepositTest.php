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

it('checks in a reserved order keeping its items', function () {
    $staff = posStaff();
    $table = posTable(['status' => 'reserved', 'reservation_name' => 'Anh Đức']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 2]], [
        'status' => 'reserved',
        'reservation_name' => 'Anh Đức',
    ]);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/check-in', [
        'order_id' => $order->id,
    ])->assertOk();

    expect($order->fresh()->status)->toBe('draft')
        ->and($order->fresh()->items()->count())->toBe(1);
    expect($table->fresh()->status)->toBe('occupied')
        ->and($table->fresh()->reservation_name)->toBeNull();
});

it('replaces draft order items on send to kitchen without duplication', function () {
    $staff = posStaff();
    $table = posTable(['status' => 'occupied']);
    $itemA = posMenuItem(['price' => 30000]);
    $itemB = posMenuItem(['price' => 40000]);
    $order = posOrder($table, [['item' => $itemA, 'qty' => 2]], ['status' => 'draft']);

    $this->actingAs($staff)->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => $itemA->price],
            ['menu_item_id' => $itemB->id, 'quantity' => 3, 'unit_price' => $itemB->price],
        ],
        'subtotal' => 150000,
        'vat_amount' => 0,
        'total' => 150000,
    ])->assertRedirect(); // sendToKitchen currently returns a redirect via `back()->with(...)` unless wantsJson()

    $fresh = $order->fresh();
    expect($fresh->status)->toBe('pending')
        ->and($fresh->items()->count())->toBe(2)
        ->and((float) $fresh->subtotal)->toBe(150000.0); // gán =, không cộng dồn
});

it('rejects check-in for non-reserved order', function () {
    $staff = posStaff();
    $order = posOrder(posTable(), [], ['status' => 'pending']);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/check-in', [
        'order_id' => $order->id,
    ])->assertStatus(422);
});

it('cancels reservation with deposit refund and releases table', function () {
    $staff = posStaff();
    $table = posTable(['status' => 'reserved', 'reservation_name' => 'Anh Đức']);
    $order = posOrder($table, [], ['status' => 'reserved']);
    $deposit = Deposit::create([
        'order_id' => $order->id, 'amount' => 200000,
        'method' => 'cash', 'status' => 'held',
    ]);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
        'deposit_resolution' => 'refund',
        'note' => 'Khách báo bận',
    ])->assertOk();

    expect($order->fresh()->status)->toBe('cancelled');
    expect($deposit->fresh()->status)->toBe('refunded')
        ->and($deposit->fresh()->resolved_by_user_id)->toBe($staff->id)
        ->and($deposit->fresh()->resolved_at)->not->toBeNull();
    expect($table->fresh()->status)->toBe('available')
        ->and($table->fresh()->reservation_name)->toBeNull();
});

it('cancels reservation forfeiting deposit on occupied table without touching table', function () {
    $staff = posStaff();
    $table = posTable(['status' => 'occupied']);
    posOrder($table); // khách hiện tại
    $reserved = posOrder($table, [], ['status' => 'reserved']);
    Deposit::create(['order_id' => $reserved->id, 'amount' => 100000, 'method' => 'cash', 'status' => 'held']);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $reserved->id,
        'deposit_resolution' => 'forfeit',
    ])->assertOk();

    expect($reserved->fresh()->status)->toBe('cancelled');
    expect(Deposit::first()->status)->toBe('forfeited');
    expect($table->fresh()->status)->toBe('occupied');
});

it('requires deposit_resolution when held deposit exists', function () {
    $staff = posStaff();
    $order = posOrder(posTable(['status' => 'reserved']), [], ['status' => 'reserved']);
    Deposit::create(['order_id' => $order->id, 'amount' => 50000, 'method' => 'cash', 'status' => 'held']);

    $this->actingAs($staff)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
    ])->assertStatus(422);
});
