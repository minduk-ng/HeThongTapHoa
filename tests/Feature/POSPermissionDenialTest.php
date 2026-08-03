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
