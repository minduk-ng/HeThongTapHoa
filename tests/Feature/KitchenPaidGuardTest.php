<?php

test('kitchen completeOrder khong un-pay don da paid', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'pending']], ['status' => 'paid']);

    $response = $this->postJson("/staff/kitchen/complete/{$order->id}");

    $response->assertStatus(422);
    expect($order->fresh()->status)->toBe('paid');
});

test('kitchen completeItems khong un-pay don da paid', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'pending']], ['status' => 'paid']);

    $response = $this->postJson('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [$order->items->first()->id],
    ]);

    expect($order->fresh()->status)->toBe('paid');
});

test('kitchen completeItems khong resurrect don da cancelled khi het mon', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'cancelled']], ['status' => 'cancelled']);

    $response = $this->postJson('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [$order->items->first()->id],
    ]);

    expect($order->fresh()->status)->toBe('cancelled');
});
