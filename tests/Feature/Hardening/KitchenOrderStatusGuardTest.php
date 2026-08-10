<?php

use App\Models\Order;

/*
|--------------------------------------------------------------------------
| Kitchen — Guard trạng thái khi hoàn tất đơn (race với checkout)
|--------------------------------------------------------------------------
| Bao phủ:
| - completeOrder không ghi đè order đã paid (guard ngoài cũ + lock trong transaction)
| - completeOrder không ghi đè order đã completed (guard cũ bỏ sót 'completed')
|
| Lưu ý (TDD): race thật (checkout giữa lúc check và update) chỉ bảo vệ được bằng
| lockForUpdate trong transaction — không mô phỏng được trong test đơn luồng.
| Test 'paid'-guard pass cả trước và sau fix (guard ngoài đã chặn paid).
| Test 'completed'-guard là test chứng minh fix: code cũ bỏ sót 'completed' nên
| sẽ set món pending thành completed → fail; sau fix, guard trong transaction skip.
*/

test('completeOrder khong ghi de order da thanh toan', function () {
    $admin = posAdmin();
    $item = posMenuItem();
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => $item->price]], ['status' => 'paid']);
    $orderItem = $order->items->first();

    $this->actingAs($admin)->post('/staff/kitchen/complete/'.$order->id, []);

    $order->refresh();
    expect($order->status)->toBe('paid');
    expect($orderItem->fresh()->status)->not->toBe('completed');
});

test('completeOrder khong ghi de order da completed', function () {
    $admin = posAdmin();
    $item = posMenuItem();
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => $item->price]], ['status' => 'completed']);
    $orderItem = $order->items->first();

    $this->actingAs($admin)->post('/staff/kitchen/complete/'.$order->id, []);

    $order->refresh();
    expect($order->status)->toBe('completed');
    expect($orderItem->fresh()->status)->not->toBe('completed');
});
