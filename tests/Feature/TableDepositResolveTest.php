<?php

use App\Models\Deposit;
use App\Models\Order;
use App\Models\Table;

test('chuyen ban reserved sang occupied giu coc va don, khong huy', function () {
    $admin = posAdmin();
    $table = posTable(['status' => 'reserved', 'reservation_name' => 'Anh Nam']);
    $order = posOrder($table, [], ['status' => 'reserved', 'reservation_name' => 'Anh Nam']);
    Deposit::create(['order_id' => $order->id, 'amount' => 100000, 'method' => 'cash', 'status' => 'held', 'received_by_user_id' => $admin->id]);

    $this->actingAs($admin)->post('/manager/tables/'.$table->id, array_merge([
        'table_number' => $table->table_number,
        'area' => $table->area,
        'capacity' => $table->capacity,
    ], ['status' => 'occupied']))->assertSessionHasNoErrors();

    expect($order->fresh()->status)->toBe('draft');
    expect(Deposit::where('order_id', $order->id)->where('status', 'held')->count())->toBe(1);
    expect($table->fresh()->status)->toBe('occupied');
});

test('chuyen ban reserved sang available huy don va hoan coc', function () {
    $admin = posAdmin();
    $table = posTable(['status' => 'reserved', 'reservation_name' => 'Anh Tu']);
    $order = posOrder($table, [], ['status' => 'reserved', 'reservation_name' => 'Anh Tu']);
    Deposit::create(['order_id' => $order->id, 'amount' => 100000, 'method' => 'cash', 'status' => 'held', 'received_by_user_id' => $admin->id]);

    $this->actingAs($admin)->post('/manager/tables/'.$table->id, array_merge([
        'table_number' => $table->table_number,
        'area' => $table->area,
        'capacity' => $table->capacity,
    ], ['status' => 'available']))->assertSessionHasNoErrors();

    expect($order->fresh()->status)->toBe('cancelled');
    expect(Deposit::where('order_id', $order->id)->where('status', 'refunded')->count())->toBe(1);
});

test('PaymentsReport hien thi coc hoan trong ky', function () {
    $admin = posAdmin();
    $table = posTable(['status' => 'reserved']);
    $order = posOrder($table, [], ['status' => 'reserved']);
    Deposit::create(['order_id' => $order->id, 'amount' => 100000, 'method' => 'cash', 'status' => 'held', 'received_by_user_id' => $admin->id]);

    $this->actingAs($admin)->postJson('/staff/pos/reservation/cancel', [
        'order_id' => $order->id,
        'deposit_resolution' => 'refund',
    ])->assertOk();

    $res = $this->actingAs($admin)->get('/reports/payments');
    $res->assertInertia(fn ($page) => $page
        ->where('metrics.refunded_deposit_total', 100000)
        ->where('metrics.refunded_deposit_count', 1));
});
