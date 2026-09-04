<?php

use App\Models\MenuCategory;

test('order detail tra ve discount_amount cua order va tung item', function () {
    $this->actingAs(posAdmin());
    $cat = MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $item = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $order = posOrder(posTable(), [
        ['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
    ], ['status' => 'paid', 'discount_amount' => 10000, 'total' => 90000]);

    $orderItem = $order->items->first();
    $orderItem->update(['discount_amount' => 10000]);

    $this->actingAs(posAdmin())
        ->get("/manager/orders/{$order->id}")
        ->assertInertia(fn ($page) => $page
            ->component('manager/orders/OrderDetail')
            ->where('order.discount_amount', 10000)
            ->where('order.items.0.discount_amount', 10000));
});
