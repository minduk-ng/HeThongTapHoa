<?php

/*
|--------------------------------------------------------------------------
| POS — Hàng chờ phục vụ (servingQueue / markServed)
|--------------------------------------------------------------------------
| Bao phủ:
| - Chỉ hiện món completed, chưa phục vụ, thuộc đơn tạo trong ngày
| - Nhóm món theo đơn, đơn Mang đi hiển thị "Mang về"
| - markServed chỉ đánh dấu món completed chưa phục vụ
*/

test('hàng chờ phục vụ chỉ chứa món completed chưa phục vụ của đơn trong ngày', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'B50', 'status' => 'occupied']);
    $item = posMenuItem();

    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'status' => 'completed'], // hiển thị
        ['item' => $item, 'qty' => 2, 'status' => 'pending'],   // chưa xong → ẩn
    ]);

    // Món đã phục vụ rồi → ẩn (served_at không thuộc fillable nên phải forceFill)
    $servedOrder = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);
    $servedOrder->items->first()->forceFill(['served_at' => now()])->save();

    // Đơn của ngày hôm qua → ẩn
    $oldOrder = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);
    $oldOrder->forceFill(['created_at' => now()->subDay()])->save();

    $response = $this->get('/staff/serving');
    $response->assertInertia(fn ($page) => $page
        ->component('staff/serving/ServingDisplay')
        ->has('servingQueue', 1)
        ->where('servingQueue.0.order_id', $order->id)
        ->where('servingQueue.0.table_number', 'B50')
        ->has('servingQueue.0.items', 1)
        ->where('servingQueue.0.items.0.quantity', 1));
});

test('đơn Mang đi trong hàng chờ hiển thị nhãn "Mang về"', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem();
    posOrder(null, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);

    $response = $this->get('/staff/serving');
    $response->assertInertia(fn ($page) => $page
        ->component('staff/serving/ServingDisplay')
        ->has('servingQueue', 1)
        ->where('servingQueue.0.table_number', 'Mang về'));
});

test('markServed chỉ đánh dấu các món completed chưa phục vụ', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'status' => 'completed'],
        ['item' => $item, 'qty' => 1, 'status' => 'pending'], // chưa xong → không được đánh dấu
    ]);
    [$done, $cooking] = $order->items->all();

    $response = $this->post('/staff/serving/mark-served', [
        'item_ids' => [$done->id, $cooking->id],
    ]);

    $response->assertOk();
    expect($response->json('served_count'))->toBe(1);
    expect($done->fresh()->served_at)->not->toBeNull();
    expect($cooking->fresh()->served_at)->toBeNull();
});

test('markServed không đánh dấu lặp món đã phục vụ trước đó', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'status' => 'completed']]);
    $orderItem = $order->items->first();
    $originalTime = now()->subMinutes(30);
    $orderItem->forceFill(['served_at' => $originalTime])->save();

    $response = $this->post('/staff/serving/mark-served', [
        'item_ids' => [$orderItem->id],
    ]);

    $response->assertOk();
    expect($response->json('served_count'))->toBe(0);
});

test('markServed yêu cầu danh sách item_ids hợp lệ', function () {
    $this->actingAs(posAdmin());

    $this->post('/staff/serving/mark-served', ['item_ids' => []])
        ->assertSessionHasErrors(['item_ids']);

    $this->post('/staff/serving/mark-served', ['item_ids' => [999999]])
        ->assertSessionHasErrors(['item_ids.0']);
});
