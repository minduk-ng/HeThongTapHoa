<?php

use App\Models\Ingredient;
use App\Models\ProductRecipe;

test('cancel hai nguon cung mot item completed khong doi kho', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = Ingredient::create(['name' => 'NL CancelRace '.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 20, 'unit' => 'g']);
    $order = posOrder($table, [['item' => $item, 'qty' => 3, 'status' => 'completed']]);

    // Nguon 1: POS cancelOrder
    $this->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'Khach bo ve'])
        ->assertSessionHasNoErrors();

    $orderItem = $order->items->first();

    // Nguon 2: Kitchen cancelItem tren cung order_item
    $this->post('/staff/kitchen/cancel-item', ['order_item_id' => $orderItem->id, 'cancellation_reason' => 'Trung huy'])
        ->assertSessionHasNoErrors();

    // Hủy không hoàn kho: stock giữ nguyên
    expect((float) Ingredient::find($ingredient->id)->stock_quantity)->toBe(1000.0);
});

test('kitchen cancelItem truoc POS cancelOrder khong doi kho', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    // item2 giu don active
    $item2 = posMenuItem();
    $ingredient = Ingredient::create(['name' => 'NL RC '.uniqid(), 'unit' => 'g', 'stock_quantity' => 500]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 10, 'unit' => 'g']);
    // 1 item tra hang (co recipe), 1 item con lai giu don con active
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 2, 'status' => 'completed'],
        ['item' => $item2, 'qty' => 1, 'status' => 'completed'],
    ]);
    $orderItem = $order->items->first();

    $this->post('/staff/kitchen/cancel-item', ['order_item_id' => $orderItem->id, 'cancellation_reason' => 'Huy'])
        ->assertSessionHasNoErrors();

    $this->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'Khach bo ve'])
        ->assertSessionHasNoErrors();

    // Khong nguon nao hoan kho: stock giữ nguyên
    expect((float) Ingredient::find($ingredient->id)->stock_quantity)->toBe(500.0);
});
