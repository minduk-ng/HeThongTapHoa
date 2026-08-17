<?php

test('kitchen display van hien thi don paid con mon pending', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 20000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'pending']], ['status' => 'paid']);

    $response = $this->get('/staff/kitchen');

    $response->assertOk();
    $response->assertSee($order->order_code);
});

test('kitchen display khong hien thi don paid het mon', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 20000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'paid']);

    $response = $this->get('/staff/kitchen');

    $response->assertOk();
    $response->assertDontSee($order->order_code);
});
