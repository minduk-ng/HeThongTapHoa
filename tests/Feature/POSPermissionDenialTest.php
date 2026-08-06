<?php

use function Pest\Laravel\actingAs;

test('guest khong truy cap validate/cancel/checkout', function () {
    $this->post('/staff/pos/validate-promotion')->assertRedirect('/login');
});

test('nguoi khong co quyen pos.create bi chan validate-promotion 403', function () {
    actingAs(posStaff([], []))
        ->postJson('/staff/pos/validate-promotion', ['code' => 'X', 'subtotal' => 100])
        ->assertStatus(403);
});

test('nguoi khong quyen pos.cancel_item|kitchen.cancel_item bi chan cancel-order 403', function () {
    actingAs(posStaff([], []))
        ->post('/staff/pos/cancel-order', ['table_id' => 1, 'cancellation_reason' => 'x'])
        ->assertStatus(403);
});

test('nguoi khong quyen pos.create bi chan checkout 403', function () {
    actingAs(posStaff([], []))
        ->postJson('/staff/pos/checkout', ['order_id' => 1])
        ->assertStatus(403);
});

test('nguoi khong quyen promotions.view bi chan danh sach khuyen mai 403', function () {
    actingAs(posStaff([], []))
        ->get('/manager/promotions')
        ->assertStatus(403);
});

test('nhan vien co pos.cancel_item (khong co kitchen.cancel_item) duoc cancel-item', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'pos.cancel_item'], ['/staff/pos']);
    $item = posMenuItem();
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'pending']], ['status' => 'pending']);

    $this->actingAs($staff)
        ->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'x'])
        ->assertSessionHasNoErrors();

    expect($order->refresh()->status)->toBe('cancelled');
});

test('nhan vien khong co quyen cancel-item van bi chan 403', function () {
    $staff = posStaff(['pos.view', 'pos.create'], ['/staff/pos']);
    $this->actingAs($staff)
        ->post('/staff/pos/cancel-order', ['table_id' => 1, 'cancellation_reason' => 'x'])
        ->assertStatus(403);
});
