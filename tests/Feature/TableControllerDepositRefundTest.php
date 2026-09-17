<?php

use App\Models\Deposit;

test('doi status ban tu reserved ve occupied giu coc va don con draft', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'T1'.substr(uniqid(), -3), 'status' => 'reserved', 'area' => 'Trong nhà', 'capacity' => 4]);
    $item = posMenuItem(['price' => 100000]);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'pending']], [
        'status' => 'reserved',
        'reservation_name' => 'An A',
    ]);
    Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $response = $this->post("/manager/tables/{$table->id}", [
        'table_number' => $table->table_number,
        'area' => $table->area ?? 'Trong nhà',
        'capacity' => $table->capacity,
        'status' => 'occupied',
    ]);
    $response->assertSessionHasNoErrors();

    expect($order->fresh()->status)->toBe('draft');
    expect($order->deposits()->where('status', 'held')->count())->toBe(1);
    expect($order->deposits()->where('status', 'refunded')->count())->toBe(0);
});

test('doi status ban ve available ma khong co deposits.refund thi bi chan 403', function () {
    $staff = posStaff(['tables.edit'], ['/manager/tables']);
    $table = posTable(['table_number' => 'T1'.substr(uniqid(), -3), 'status' => 'reserved', 'area' => 'Trong nhà', 'capacity' => 4]);
    $order = posOrder($table, [], ['status' => 'reserved', 'reservation_name' => 'An A']);
    Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $this->actingAs($staff)->post("/manager/tables/{$table->id}", [
        'table_number' => $table->table_number,
        'area' => $table->area ?? 'Trong nhà',
        'capacity' => $table->capacity,
        'status' => 'available',
    ])->assertForbidden();

    expect($order->fresh()->status)->toBe('reserved');
    expect($order->deposits()->where('status', 'held')->count())->toBe(1);
});
