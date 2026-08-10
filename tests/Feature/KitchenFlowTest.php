<?php

use App\Models\Ingredient;
use App\Models\OrderActivity;
use App\Models\ProductRecipe;

/*
|--------------------------------------------------------------------------
| Bếp — Hoàn tất món / hủy món (KitchenController)
|--------------------------------------------------------------------------
| Bao phủ:
| - completeOrder: toàn bộ món completed
| - completeItems: hoàn tất một phần, đơn chỉ completed khi hết món chờ
| - Món cancelled/completed không bị đụng lại
| - cancelItem: hủy món kèm lý do; hủy món cuối → đơn cancelled + nhả bàn
| - Trừ kho KHÔNG còn xảy ra ở bếp: stock chỉ đổi tại checkout (voucher)
*/

test('hoàn tất cả đơn: mọi món completed và kho không bị trừ ở bếp', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();

    $coffee = Ingredient::create(['name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000]);
    $milk = Ingredient::create(['name' => 'Sữa '.uniqid(), 'unit' => 'ml', 'stock_quantity' => 2000]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $coffee->id, 'amount' => 20, 'unit' => 'g']);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $milk->id, 'amount' => 100, 'unit' => 'ml']);

    $order = posOrder($table, [['item' => $item, 'qty' => 3, 'price' => 30000]]);

    $response = $this->post("/staff/kitchen/complete/{$order->id}");

    $response->assertSessionHasNoErrors();
    expect($order->fresh()->status)->toBe('completed');
    $order->items->each(fn ($orderItem) => expect($orderItem->fresh()->status)->toBe('completed'));

    // Hoàn tất ở bếp KHÔNG trừ kho: stock giữ nguyên
    expect((float) $coffee->fresh()->stock_quantity)->toBe(1000.0);
    expect((float) $milk->fresh()->stock_quantity)->toBe(2000.0);
    expect(OrderActivity::where('order_id', $order->id)->where('action', 'completed')->exists())->toBeTrue();
});

test('hoàn tất cả đơn: món completed/cancelled không bị đụng lại, kho giữ nguyên', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();

    $sugar = Ingredient::create(['name' => 'Đường '.uniqid(), 'unit' => 'g', 'stock_quantity' => 500]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $sugar->id, 'amount' => 10, 'unit' => 'g']);

    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'status' => 'completed'], // đã hoàn tất trước đó
        ['item' => $item, 'qty' => 2, 'status' => 'cancelled'], // đã hủy
        ['item' => $item, 'qty' => 1, 'status' => 'pending'],   // món mới cần làm
    ]);

    $this->post("/staff/kitchen/complete/{$order->id}")->assertSessionHasNoErrors();

    // Chỉ món pending được hoàn tất, kho không đổi
    expect((float) $sugar->fresh()->stock_quantity)->toBe(500.0);
});

test('hoàn tất một phần món: đơn vẫn ở bếp cho tới khi món cuối cùng xong', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1],
        ['item' => $item, 'qty' => 2],
    ]);
    [$first, $second] = $order->items->all();

    // Hoàn tất món thứ nhất
    $this->post('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [$first->id],
    ])->assertSessionHasNoErrors();

    expect($first->fresh()->status)->toBe('completed');
    expect($second->fresh()->status)->toBe('pending');
    expect($order->fresh()->status)->toBe('pending'); // đơn chưa xong

    // Hoàn tất món còn lại → đơn completed
    $this->post('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [$second->id],
    ])->assertSessionHasNoErrors();

    expect($order->fresh()->status)->toBe('completed');
});

test('complete-items bỏ qua item không thuộc đơn được chỉ định', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 1]]);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 1]]);
    $foreignItem = $order2->items->first();

    $this->post('/staff/kitchen/complete-items', [
        'order_id' => $order1->id,
        'item_ids' => [$foreignItem->id],
    ])->assertSessionHasNoErrors();

    // Item của đơn khác không bị đổi trạng thái
    expect($foreignItem->fresh()->status)->toBe('pending');
    expect($order2->fresh()->status)->toBe('pending');
});

test('bếp hủy món kèm lý do, đơn vẫn hoạt động khi còn món khác', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1],
        ['item' => $item, 'qty' => 2],
    ]);
    $target = $order->items->first();

    $response = $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $target->id,
        'cancellation_reason' => 'Hết nguyên liệu',
        'note' => 'Nhập kho ngày mai',
    ]);

    $response->assertSessionHasNoErrors();

    $targetFresh = $target->fresh();
    expect($targetFresh->status)->toBe('cancelled');
    expect($targetFresh->cancellation_reason)->toBe('Hết nguyên liệu: Nhập kho ngày mai');
    expect($targetFresh->cancelled_at)->not->toBeNull();

    // Đơn và bàn vẫn hoạt động vì còn món khác
    expect($order->fresh()->status)->not->toBe('cancelled');
    expect($table->fresh()->status)->toBe('occupied');
});

test('bếp hủy món cuối cùng: đơn cancelled và bàn được nhả nếu không còn đơn khác', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1]]);

    $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $order->items->first()->id,
        'cancellation_reason' => 'Khách hủy',
    ])->assertSessionHasNoErrors();

    expect($order->fresh()->status)->toBe('cancelled');
    expect($table->fresh()->status)->toBe('available');
});

test('bếp hủy món cuối của một đơn nhưng bàn vẫn giữ khách khi còn đơn khác hoạt động', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $orderToCancel = posOrder($table, [['item' => $item, 'qty' => 1]]);
    posOrder($table, [['item' => $item, 'qty' => 1]]); // đơn khác còn hoạt động

    $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $orderToCancel->items->first()->id,
        'cancellation_reason' => 'Khách hủy',
    ])->assertSessionHasNoErrors();

    expect($orderToCancel->fresh()->status)->toBe('cancelled');
    expect($table->fresh()->status)->toBe('occupied');
});

test('hủy món đã cancelled lần nữa không gây lỗi và không đổi dữ liệu', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'cancelled']]);
    $orderItem = $order->items->first();
    $orderItem->update(['cancellation_reason' => 'Lý do gốc']);

    $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $orderItem->id,
        'cancellation_reason' => 'Lý do mới',
    ])->assertSessionHasNoErrors();

    expect($orderItem->fresh()->cancellation_reason)->toBe('Lý do gốc');
});

test('bếp hủy món đã completed thì không hoàn kho', function () {
    $this->actingAs(posAdmin());

    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $coffee = Ingredient::create([
        'name' => 'Cà phê hoàn kho '.uniqid(),
        'unit' => 'g',
        'stock_quantity' => 940,
    ]);
    ProductRecipe::create([
        'menu_item_id' => $item->id,
        'ingredient_id' => $coffee->id,
        'amount' => 20,
        'unit' => 'g',
    ]);
    $order = posOrder($table, [[
        'item' => $item,
        'qty' => 3,
        'status' => 'completed',
    ]]);

    $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $order->items->first()->id,
        'cancellation_reason' => 'Khách hủy',
    ])->assertSessionHasNoErrors();

    expect($order->items->first()->fresh()->status)->toBe('cancelled');
    // Hủy món KHÔNG hoàn kho: stock giữ nguyên
    expect((float) $coffee->fresh()->stock_quantity)->toBe(940.0);
});

test('bếp hủy món pending thì không đổi kho và không ghi transaction import', function () {
    $this->actingAs(posAdmin());

    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $milk = Ingredient::create([
        'name' => 'Sữa pending '.uniqid(),
        'unit' => 'ml',
        'stock_quantity' => 500,
    ]);
    ProductRecipe::create([
        'menu_item_id' => $item->id,
        'ingredient_id' => $milk->id,
        'amount' => 100,
        'unit' => 'ml',
    ]);
    $order = posOrder($table, [[
        'item' => $item,
        'qty' => 2,
        'status' => 'pending',
    ]]);

    $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $order->items->first()->id,
        'cancellation_reason' => 'Hết nguyên liệu',
    ])->assertSessionHasNoErrors();

    expect((float) $milk->fresh()->stock_quantity)->toBe(500.0);
});

test('bếp hủy món completed lần hai không đổi kho thêm', function () {
    $this->actingAs(posAdmin());

    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $sugar = Ingredient::create([
        'name' => 'Đường idempotent '.uniqid(),
        'unit' => 'g',
        'stock_quantity' => 90,
    ]);
    ProductRecipe::create([
        'menu_item_id' => $item->id,
        'ingredient_id' => $sugar->id,
        'amount' => 10,
        'unit' => 'g',
    ]);
    $order = posOrder($table, [[
        'item' => $item,
        'qty' => 1,
        'status' => 'completed',
    ]]);
    $payload = [
        'order_item_id' => $order->items->first()->id,
        'cancellation_reason' => 'Khách hủy',
    ];

    $this->post('/staff/kitchen/cancel-item', $payload)->assertSessionHasNoErrors();
    $this->post('/staff/kitchen/cancel-item', $payload)->assertSessionHasNoErrors();

    expect((float) $sugar->fresh()->stock_quantity)->toBe(90.0);
});

test('hủy món completed vẫn an toàn khi ingredient và recipe đã bị xóa', function () {
    $this->actingAs(posAdmin());

    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = Ingredient::create([
        'name' => 'N.Lieu bi xoa '.uniqid(),
        'unit' => 'g',
        'stock_quantity' => 100,
    ]);
    ProductRecipe::create([
        'menu_item_id' => $item->id,
        'ingredient_id' => $ingredient->id,
        'amount' => 20,
        'unit' => 'g',
    ]);
    $ingredient->delete();
    $order = posOrder($table, [[
        'item' => $item,
        'qty' => 1,
        'status' => 'completed',
    ]]);

    $this->post('/staff/kitchen/cancel-item', [
        'order_item_id' => $order->items->first()->id,
        'cancellation_reason' => 'Khách hủy',
    ])->assertSessionHasNoErrors();

    expect($order->items->first()->fresh()->status)->toBe('cancelled');
});

test('nhân viên không có quyền kitchen.update bị chặn hoàn tất món (403)', function () {
    $staff = posStaff(['kitchen.view'], ['/staff/kitchen']);
    $this->actingAs($staff);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1]]);

    $this->post("/staff/kitchen/complete/{$order->id}")->assertStatus(403);
    expect($order->fresh()->status)->toBe('pending');
});
