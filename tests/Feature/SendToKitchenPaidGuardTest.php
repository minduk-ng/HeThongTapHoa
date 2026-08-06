<?php

/*
|--------------------------------------------------------------------------
| POS — sendToKitchen chặn đơn paid/cancelled
|--------------------------------------------------------------------------
| - Không cho thêm món vào đơn đã thanh toán hoặc đã hủy (tránh đơn
|   quay về pending → double invoice)
| - Reduction bỏ qua món thuộc đơn paid/cancelled/completed
*/

test('sendToKitchen tu choi gui mon vao don da paid', function () {
    $this->actingAs(posAdmin());
    $itemA = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $itemA, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'paid']);

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'items' => [['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 30000]],
        'subtotal' => 30000, 'vat_amount' => 0, 'total' => 30000,
    ]);

    $response->assertSessionHasErrors('error');
    expect($order->fresh()->status)->toBe('paid');
    expect($order->fresh()->items()->count())->toBe(1); // không thêm món
});

test('sendToKitchen reduction bo qua don da paid', function () {
    $this->actingAs(posAdmin());
    $itemA = posMenuItem(['price' => 30000]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [['item' => $itemA, 'qty' => 4, 'price' => 30000, 'status' => 'pending']], ['status' => 'paid']);
    $orderItem = $order->items->first();

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [[
            'order_item_id' => $orderItem->id,
            'reduce_quantity' => 1,
            'cancellation_reason' => 'Khach doi y',
        ]],
        'subtotal' => 0, 'vat_amount' => 0, 'total' => 0,
    ]);

    expect($orderItem->fresh()->quantity)->toBe(4); // không bị giảm
    expect($order->fresh()->status)->toBe('paid');
});
