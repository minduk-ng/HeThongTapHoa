<?php

use App\Models\Order;
use App\Models\OrderActivity;
use App\Models\Table;

/*
|--------------------------------------------------------------------------
| POS — Nghiệp vụ bàn (transferTable / mergeTables / unmergeTable / cancelOrder)
|--------------------------------------------------------------------------
| Bao phủ:
| - Chuyển bàn thường: đơn đi theo bàn mới, bàn cũ nhả, bàn mới occupied
| - Chặn chuyển tới bàn không trống
| - Gộp bàn: đơn dồn về bàn chính, liên kết merged_into_table_id đúng
| - Gộp vào bàn phụ của nhóm khác phải bám theo bàn chính của nhóm đó
| - Tách bàn: đơn dồn về bàn giữ lại, các bàn khác được nhả
| - Hủy toàn bộ đơn của nhóm bàn: món + đơn cancelled, bàn nhả hết
*/

test('chuyển bàn thường: đơn đi theo bàn mới, bàn cũ nhả, bàn mới có khách', function () {
    $this->actingAs(posAdmin());
    $source = posTable(['status' => 'occupied']);
    $target = posTable(['status' => 'available']);
    $item = posMenuItem();
    $order = posOrder($source, [['item' => $item, 'qty' => 1]]);

    $response = $this->post('/staff/pos/transfer-table', [
        'source_table_id' => $source->id,
        'target_table_id' => $target->id,
    ]);

    $response->assertSessionHasNoErrors();
    expect($order->fresh()->table_id)->toBe($target->id);
    expect($source->fresh()->status)->toBe('available');
    expect($target->fresh()->status)->toBe('occupied');
});

test('chặn chuyển bàn nếu bàn đích hoặc bàn nguồn đang chứa đơn đặt trước', function () {
    $this->actingAs(posAdmin());
    $source = posTable(['status' => 'reserved']);
    $target = posTable(['status' => 'available']);
    posOrder($source, [], ['status' => 'reserved']);

    $response = $this->post('/staff/pos/transfer-table', [
        'source_table_id' => $source->id,
        'target_table_id' => $target->id,
    ]);

    $response->assertSessionHasErrors(['error' => 'Chuyển bàn thất bại: Không thể chuyển bàn đang có đơn đặt trước.']);
    
    // Đảo ngược
    $source2 = posTable(['status' => 'occupied']);
    $target2 = posTable(['status' => 'reserved']);
    posOrder($source2, []);
    posOrder($target2, [], ['status' => 'reserved']);

    $response2 = $this->post('/staff/pos/transfer-table', [
        'source_table_id' => $source2->id,
        'target_table_id' => $target2->id,
    ]);

    $response2->assertSessionHasErrors(['error' => 'Chuyển bàn thất bại: Không thể chuyển bàn đang có đơn đặt trước.']);
});

test('không thể chuyển tới bàn đang có khách (không thuộc nhóm gộp)', function () {
    $this->actingAs(posAdmin());
    $source = posTable(['status' => 'occupied']);
    $target = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($source, [['item' => $item]]);

    $response = $this->post('/staff/pos/transfer-table', [
        'source_table_id' => $source->id,
        'target_table_id' => $target->id,
    ]);

    $response->assertSessionHasErrors(['error']);
    expect($order->fresh()->table_id)->toBe($source->id);
    expect($source->fresh()->status)->toBe('occupied');
});

test('không thể chuyển bàn tới chính nó', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);

    $response = $this->post('/staff/pos/transfer-table', [
        'source_table_id' => $table->id,
        'target_table_id' => $table->id,
    ]);

    $response->assertSessionHasErrors(['target_table_id']);
});

test('chuyển bàn chính của nhóm gộp: đơn và các bàn phụ đi theo bàn đích mới', function () {
    $this->actingAs(posAdmin());
    $primary = posTable(['status' => 'occupied']);
    $sub = posTable(['status' => 'occupied']);
    $sub->update(['merged_into_table_id' => $primary->id]);
    $target = posTable(['status' => 'available']);
    $item = posMenuItem();
    $order = posOrder($primary, [['item' => $item]]);

    $response = $this->post('/staff/pos/transfer-table', [
        'source_table_id' => $primary->id,
        'target_table_id' => $target->id,
    ]);

    $response->assertSessionHasNoErrors();
    expect($order->fresh()->table_id)->toBe($target->id);
    expect($sub->fresh()->merged_into_table_id)->toBe($target->id);
    expect($primary->fresh()->status)->toBe('available');
    expect($target->fresh()->status)->toBe('occupied');
});

test('gộp bàn: đơn của bàn nguồn dồn về bàn chính, liên kết gộp được ghi nhận', function () {
    $this->actingAs(posAdmin());
    $source = posTable(['status' => 'occupied']);
    $target = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $sourceOrder = posOrder($source, [['item' => $item, 'qty' => 1, 'price' => 50000]]);
    $targetOrder = posOrder($target, [['item' => $item, 'qty' => 1, 'price' => 30000]]);

    $response = $this->post('/staff/pos/merge-tables', [
        'source_table_id' => $source->id,
        'target_table_id' => $target->id,
    ]);

    $response->assertSessionHasNoErrors();

    // Đơn bàn nguồn chuyển hết về bàn chính
    expect($sourceOrder->fresh()->table_id)->toBe($target->id);
    expect($targetOrder->fresh()->table_id)->toBe($target->id);

    $sourceFresh = $source->fresh();
    expect($sourceFresh->merged_into_table_id)->toBe($target->id);
    expect($sourceFresh->status)->toBe('occupied');
    expect($target->fresh()->status)->toBe('occupied');
});

test('chặn gộp bàn nếu nhóm nguồn hoặc đích đang chứa đơn đặt trước', function () {
    $this->actingAs(posAdmin());
    $source = posTable(['status' => 'reserved']);
    $target = posTable(['status' => 'occupied']);
    posOrder($source, [], ['status' => 'reserved']);
    posOrder($target, []);

    $response = $this->post('/staff/pos/merge-tables', [
        'source_table_id' => $source->id,
        'target_table_id' => $target->id,
    ]);

    $response->assertSessionHasErrors(['error' => 'Gộp bàn thất bại: Không thể gộp bàn đang có đơn đặt trước.']);
    
    // Đảo ngược
    $source2 = posTable(['status' => 'occupied']);
    $target2 = posTable(['status' => 'reserved']);
    posOrder($source2, []);
    posOrder($target2, [], ['status' => 'reserved']);

    $response2 = $this->post('/staff/pos/merge-tables', [
        'source_table_id' => $source2->id,
        'target_table_id' => $target2->id,
    ]);

    $response2->assertSessionHasErrors(['error' => 'Gộp bàn thất bại: Không thể gộp bàn đang có đơn đặt trước.']);
});

test('gộp vào bàn phụ của một nhóm sẽ bám theo bàn chính của nhóm đó', function () {
    $this->actingAs(posAdmin());
    $primary = posTable(['status' => 'occupied']);
    $sub = posTable(['status' => 'occupied']);
    $sub->update(['merged_into_table_id' => $primary->id]);
    $newcomer = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($newcomer, [['item' => $item]]);

    $response = $this->post('/staff/pos/merge-tables', [
        'source_table_id' => $newcomer->id,
        'target_table_id' => $sub->id, // chọn bàn phụ làm đích
    ]);

    $response->assertSessionHasNoErrors();
    // Phải quy về bàn chính chứ không tạo chuỗi gộp lồng nhau
    expect($newcomer->fresh()->merged_into_table_id)->toBe($primary->id);
    expect($order->fresh()->table_id)->toBe($primary->id);
});

test('tách bàn: đơn dồn về bàn giữ lại, các bàn còn lại được nhả', function () {
    $this->actingAs(posAdmin());
    $primary = posTable(['status' => 'occupied']);
    $sub = posTable(['status' => 'occupied']);
    $sub->update(['merged_into_table_id' => $primary->id]);
    $item = posMenuItem();
    $order = posOrder($primary, [['item' => $item, 'status' => 'pending']]);

    $response = $this->post('/staff/pos/unmerge-table', [
        'source_table_id' => $sub->id,
        'keep_table_id' => $primary->id,
    ]);

    $response->assertSessionHasNoErrors();

    expect($order->fresh()->table_id)->toBe($primary->id);

    $primaryFresh = $primary->fresh();
    expect($primaryFresh->status)->toBe('occupied'); // còn đơn hoạt động
    expect($primaryFresh->merged_into_table_id)->toBeNull();

    $subFresh = $sub->fresh();
    expect($subFresh->status)->toBe('available');
    expect($subFresh->merged_into_table_id)->toBeNull();
});

test('tách bàn khi không còn đơn hoạt động thì bàn giữ lại cũng được nhả', function () {
    $this->actingAs(posAdmin());
    $primary = posTable(['status' => 'occupied']);
    $sub = posTable(['status' => 'occupied']);
    $sub->update(['merged_into_table_id' => $primary->id]);

    $response = $this->post('/staff/pos/unmerge-table', [
        'source_table_id' => $sub->id,
        'keep_table_id' => $primary->id,
    ]);

    $response->assertSessionHasNoErrors();
    expect($primary->fresh()->status)->toBe('available');
    expect($sub->fresh()->status)->toBe('available');
});

test('serializes reserved orders with reservation info and deposit_total in index', function () {
    $staff = posStaff();
    $table = posTable(['status' => 'reserved']);
    $order = posOrder($table, [], ['status' => 'reserved', 'reservation_name' => 'Anh Đức']);
    \App\Models\Deposit::create(['order_id' => $order->id, 'amount' => 100000, 'method' => 'cash', 'status' => 'held']);

    $res = $this->actingAs($staff)->get('/staff/pos');
    
    $res->assertOk();
    $res->assertInertia(fn (\Inertia\Testing\AssertableInertia $page) => $page
        ->has('tables', fn (\Inertia\Testing\AssertableInertia $tables) => $tables
            ->where('1.id', $table->id)
            ->where('1.active_orders.0.status', 'reserved')
            ->where('1.active_orders.0.reservation_name', 'Anh Đức')
            ->where('1.active_orders.0.deposit_total', 100000)
            ->etc()
        )
    );
});

test('hủy toàn bộ đơn của nhóm bàn: món và đơn cancelled kèm lý do, bàn nhả hết', function () {
    $this->actingAs(posAdmin());
    $primary = posTable(['status' => 'occupied']);
    $sub = posTable(['status' => 'occupied']);
    $sub->update(['merged_into_table_id' => $primary->id]);
    $item = posMenuItem();
    $order1 = posOrder($primary, [['item' => $item, 'qty' => 2]]);
    $order2 = posOrder($primary, [['item' => $item, 'qty' => 1]]);

    $response = $this->post('/staff/pos/cancel-order', [
        'table_id' => $sub->id, // hủy từ bàn phụ vẫn phải quét cả nhóm
        'cancellation_reason' => 'Khách bỏ về',
        'note' => 'Không chờ được',
    ]);

    $response->assertSessionHasNoErrors();

    foreach ([$order1, $order2] as $order) {
        $fresh = $order->fresh();
        expect($fresh->status)->toBe('cancelled');
        $fresh->items->each(function ($orderItem) {
            expect($orderItem->status)->toBe('cancelled');
            expect($orderItem->cancellation_reason)->toContain('Khách bỏ về');
        });
    }

    expect($primary->fresh()->status)->toBe('available');
    $subFresh = $sub->fresh();
    expect($subFresh->status)->toBe('available');
    expect($subFresh->merged_into_table_id)->toBeNull();

    expect(OrderActivity::where('action', 'order_cancelled')->count())->toBe(2);
});

test('hủy toàn bộ đơn chỉ hoàn kho cho món completed, không hoàn món pending', function () {
    $this->actingAs(posAdmin());

    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $ingredient = App\Models\Ingredient::create([
        'name' => 'Nguyên liệu hủy POS '.uniqid(),
        'unit' => 'g',
        'stock_quantity' => 940,
    ]);
    App\Models\ProductRecipe::create([
        'menu_item_id' => $item->id,
        'ingredient_id' => $ingredient->id,
        'amount' => 20,
        'unit' => 'g',
    ]);
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 3, 'status' => 'completed'],
        ['item' => $item, 'qty' => 2, 'status' => 'pending'],
    ]);

    $this->post('/staff/pos/cancel-order', [
        'table_id' => $table->id,
        'cancellation_reason' => 'Khách bỏ về',
    ])->assertSessionHasNoErrors();

    expect((float) $ingredient->fresh()->stock_quantity)->toBe(1000.0);
    expect((float) App\Models\InventoryTransaction::where('ingredient_id', $ingredient->id)->where('type', 'import')->value('quantity'))->toBe(60.0);
    expect($order->fresh()->status)->toBe('cancelled');
    expect($order->fresh()->items->pluck('status')->unique()->all())->toBe(['cancelled']);
});

test('hủy đơn ở bàn không có đơn hoạt động trả về lỗi rõ ràng', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'available']);

    $response = $this->post('/staff/pos/cancel-order', [
        'table_id' => $table->id,
        'cancellation_reason' => 'Nhầm bàn',
    ]);

    $response->assertSessionHasErrors(['error']);
});
