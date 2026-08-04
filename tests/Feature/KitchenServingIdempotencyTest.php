<?php

use App\Models\Ingredient;
use App\Models\ProductRecipe;

// Kitchen: complete-items cùng idempotency key chỉ tác động 1 lần
test('complete-items trùng idempotency key chỉ hoàn thành 1 lần', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'pending']]);
    $orderItem = $order->items->first();

    $payload = ['order_id' => $order->id, 'item_ids' => [$orderItem->id], 'idempotency_key' => 'k1'];
    $this->postJson('/staff/kitchen/complete-items', $payload)->assertOk()->assertJson(['success' => true]);
    $this->postJson('/staff/kitchen/complete-items', $payload)->assertOk()->assertJson(['success' => true]);

    expect($orderItem->fresh()->status)->toBe('completed');
});

test('complete-items lần 1 trừ kho, lần 2 cùng key không trừ thêm', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = Ingredient::create([
        'name' => 'Test Ing', 'unit' => 'kg', 'stock_quantity' => 10,
    ]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 1, 'unit' => 'kg']);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'status' => 'pending']]);
    $orderItem = $order->items->first();

    $payload = ['order_id' => $order->id, 'item_ids' => [$orderItem->id], 'idempotency_key' => 'k-stock'];
    $this->postJson('/staff/kitchen/complete-items', $payload)->assertOk();
    $this->postJson('/staff/kitchen/complete-items', $payload)->assertOk();

    expect((float) $ingredient->fresh()->stock_quantity)->toBe(8.0); // trừ đúng 1 lần: 2 phần * 1kg
});

// Kitchen: complete/{order}
test('complete order trùng key không lỗi và không tác động thêm', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'pending']]);

    $payload = ['idempotency_key' => 'k-ord'];
    $this->postJson("/staff/kitchen/complete/{$order->id}", $payload)->assertOk()->assertJson(['success' => true]);
    $this->postJson("/staff/kitchen/complete/{$order->id}", $payload)->assertOk()->assertJson(['success' => true]);

    expect($order->fresh()->status)->toBe('completed');
});

// Serving
test('mark-served trùng key chỉ ghi served_at 1 lần, lần 2 vẫn 2xx', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);
    $orderItem = $order->items->first();

    $payload = ['item_ids' => [$orderItem->id], 'idempotency_key' => 'k-serve'];
    $this->postJson('/staff/serving/mark-served', $payload)->assertOk()->assertJson(['served_count' => 1]);
    $this->postJson('/staff/serving/mark-served', $payload)->assertOk()->assertJson(['success' => true]);

    expect($orderItem->fresh()->served_at)->not->toBeNull();
});

// Lỗi nghiệp vụ (món đã bị hủy) vẫn trả JSON 422 cho fetch
test('complete order đã cancelled trả JSON lỗi 422 khi wantsJson', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'cancelled']], ['status' => 'cancelled']);

    $this->postJson("/staff/kitchen/complete/{$order->id}", [])
        ->assertStatus(422)
        ->assertJsonStructure(['error']);
});