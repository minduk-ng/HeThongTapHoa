<?php

use App\Models\Ingredient;
use App\Models\InventoryTransaction;

test('completeItems khong deduct khi order item đa bi huy giua chung', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = Ingredient::create(['name' => 'NL CM '.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000]);
    App\Models\ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 20, 'unit' => 'g']);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'status' => 'processing']]);
    $orderItem = $order->items->first();

    // Huy tu POS
    $this->post('/staff/pos/cancel-order', ['table_id' => $table->id, 'cancellation_reason' => 'huy'])
        ->assertSessionHasNoErrors();

    // Kitchen muon complete item đã huy → phai khong deduct
    $this->post('/staff/kitchen/complete-items', ['order_id' => $order->id, 'item_ids' => [$orderItem->id]])
        ->assertSessionHasNoErrors();

    expect(InventoryTransaction::where('ingredient_id', $ingredient->id)->where('type', 'export')->count())->toBe(0);
    expect((float) App\Models\Ingredient::find($ingredient->id)->stock_quantity)->toBe(1000.0);
});