<?php

use App\Services\Checkout\OrderTotals;

test('reduce-items khong con ghi total vao orders, preview dung', function () {
    $this->actingAs(posStaff());
    $itemA = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [
        ['item' => $itemA, 'qty' => 4, 'price' => 30000, 'status' => 'pending'],
    ], ['status' => 'pending']);
    $orderItem = $order->items->first();
    $originalTotal = (float) $order->total;

    $this->postJson('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [[
            'order_item_id' => $orderItem->id,
            'reduce_quantity' => 1,
            'cancellation_reason' => 'Khach doi y',
        ]],
        'subtotal' => 0, 'vat_amount' => 0, 'total' => 0,
    ])->assertRedirect();

    // subtotal/total sau khi reduce-items KHÔNG do sendToKitchen update nữa
    // preview mới là nguồn đúng: 3 mon * 30000 = 90000
    $p = OrderTotals::preview($order->fresh()->items()->where('status', '!=', 'cancelled')->get());
    expect($p['subtotal'])->toBe(90000.0);
    expect($order->fresh()->items->first()->quantity)->toBe(3);
    // orders.total KHÔNG do sendToKitchen touch nữa (gỡ ghi)
    expect((float) $order->fresh()->total)->toBe($originalTotal);
});
