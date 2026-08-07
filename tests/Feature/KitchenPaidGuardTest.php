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

test('kitchen cancelItem khong huy don da paid khi het mon', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'paid']);

    $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $order->items->first()->id,
        'cancellation_reason' => 'Khach doi y',
    ])->assertSessionHasNoErrors();

    expect($order->fresh()->status)->toBe('paid'); // không flip về cancelled
});
