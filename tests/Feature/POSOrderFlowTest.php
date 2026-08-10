<?php

use App\Models\Order;
use App\Models\OrderActivity;
use App\Models\OrderItem;
use App\Services\Checkout\OrderTotals;

/*
|--------------------------------------------------------------------------
| POS — Luồng gửi đơn xuống Bếp (sendToKitchen)
|--------------------------------------------------------------------------
| Bao phủ:
| - Sinh mã đơn theo prefix bàn + ngày, tuần tự không trùng
| - REGRESSION: trùng order_code sau khi chuyển/gộp bàn (đếm theo table_id cũ)
| - Đơn Mang đi (table_id NULL, prefix MD)
| - Gọi thêm món vào đơn có sẵn (cộng dồn tiền, has_additional_items)
| - Giảm/hủy món đã gửi bếp (reduced_items); orders.subtotal/total giữ snapshot, preview JIT là nguồn đúng
| - Idempotency key chống double-submit
| - Phân quyền pos.create
*/

test('gửi bếp tạo đơn mới với mã đơn đúng prefix bàn và ngày', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'B01']);
    $item = posMenuItem(['price' => 30000]);

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 2, 'unit_price' => 30000],
        ],
        'subtotal' => 60000,
        'vat_amount' => 0,
        'total' => 60000,
    ]);

    $response->assertSessionHasNoErrors();

    $order = Order::firstOrFail();
    $prefix = 'B01-'.date('ymd').'-';
    expect($order->order_code)->toBe($prefix.'01');
    expect($order->status)->toBe('pending');
    expect($order->table_id)->toBe($table->id);
    expect((float) $order->total)->toBe(60000.0);
    expect($order->has_additional_items)->toBeFalse();

    // Bàn chuyển sang trạng thái có khách
    expect($table->fresh()->status)->toBe('occupied');

    // Món được ghi nhận đúng số lượng và thành tiền
    $orderItem = OrderItem::firstOrFail();
    expect($orderItem->quantity)->toBe(2);
    expect((float) $orderItem->subtotal)->toBe(60000.0);

    // Audit log: created + sent_kitchen
    expect(OrderActivity::where('order_id', $order->id)->pluck('action')->all())
        ->toContain('created')
        ->toContain('sent_kitchen');
});

test('REGRESSION: mã đơn không trùng khi bàn đã từng chuyển đi (đếm theo prefix, không theo table_id)', function () {
    $this->actingAs(posAdmin());
    $tableA = posTable(['table_number' => 'B02']);
    $tableB = posTable(['table_number' => 'B03']);
    $item = posMenuItem();

    // Đơn cũ mang mã của bàn A nhưng đã bị chuyển sang bàn B (transfer/merge đổi table_id)
    posOrder($tableB, [['item' => $item, 'qty' => 1, 'price' => 20000]], [
        'order_code' => 'B02-'.date('ymd').'-01',
    ]);

    // Gửi bếp đơn mới tại bàn A: nếu đếm theo table_id sẽ sinh lại -01 → trùng khóa unique
    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $tableA->id,
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 1, 'unit_price' => 20000],
        ],
        'subtotal' => 20000,
        'vat_amount' => 0,
        'total' => 20000,
    ]);

    $response->assertSessionHasNoErrors();
    $newOrder = Order::where('table_id', $tableA->id)->firstOrFail();
    expect($newOrder->order_code)->toBe('B02-'.date('ymd').'-02');
});

test('đơn Mang đi được tạo với table_id NULL và prefix MD, nối tiếp sequence hiện có', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem();

    // Đã có đơn mang đi thứ 4 trong ngày
    posOrder(null, [['item' => $item, 'qty' => 1, 'price' => 20000]], [
        'order_code' => 'MD-'.date('ymd').'-04',
    ]);

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 1, 'unit_price' => 20000],
        ],
        'subtotal' => 20000,
        'vat_amount' => 0,
        'total' => 20000,
    ]);

    $response->assertSessionHasNoErrors();
    $order = Order::latest('id')->firstOrFail();
    expect($order->table_id)->toBeNull();
    expect($order->order_code)->toBe('MD-'.date('ymd').'-05');
});

test('gọi thêm món vào đơn có sẵn cộng dồn tiền và bật cờ has_additional_items', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000]], [
        'status' => 'completed',
    ]);

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'order_id' => $order->id,
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 3, 'unit_price' => 20000],
        ],
        'subtotal' => 60000,
        'vat_amount' => 0,
        'total' => 60000,
    ]);

    $response->assertSessionHasNoErrors();

    $order->refresh();
    expect((float) $order->total)->toBe(80000.0);
    expect($order->status)->toBe('pending'); // quay lại bếp chế biến
    expect($order->has_additional_items)->toBeTrue();
    expect($order->items()->count())->toBe(2);

    // Không tạo đơn mới
    expect(Order::count())->toBe(1);

    // Audit log: additional
    expect(OrderActivity::where('order_id', $order->id)->pluck('action')->all())
        ->toContain('additional');
});

test('giảm một phần số lượng món đã gửi bếp giữ snapshot orders.total, preview JIT tính lại', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 3, 'price' => 20000]]);
    $orderItem = $order->items()->firstOrFail();

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [
            [
                'order_item_id' => $orderItem->id,
                'reduce_quantity' => 1,
                'cancellation_reason' => 'Khách đổi ý',
            ],
        ],
        'subtotal' => 0,
        'vat_amount' => 0,
        'total' => 0,
    ]);

    $response->assertSessionHasNoErrors();

    $orderItem->refresh();
    expect($orderItem->quantity)->toBe(2);
    expect((float) $orderItem->subtotal)->toBe(40000.0);
    expect($orderItem->status)->not->toBe('cancelled');

    $order->refresh();
    // Gỡ ghi total trong reduce flow: orders.subtotal/total giữ snapshot ban đầu,
    // preview JIT (OrderTotals::preview) là nguồn đúng.
    expect((float) $order->subtotal)->toBe(60000.0);
    expect((float) $order->total)->toBe(60000.0);
    expect(OrderTotals::preview($order->items()->where('status', '!=', 'cancelled')->get())['subtotal'])->toBe(40000.0);
    expect($order->status)->not->toBe('cancelled');

    expect(OrderActivity::where('order_id', $order->id)->where('action', 'item_cancel')->exists())->toBeTrue();
});

test('giảm hết số lượng món cuối cùng sẽ hủy món và hủy luôn đơn hàng', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 20000]]);
    $orderItem = $order->items()->firstOrFail();

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [
            [
                'order_item_id' => $orderItem->id,
                'reduce_quantity' => 2,
                'cancellation_reason' => 'Hết nguyên liệu',
            ],
        ],
        'subtotal' => 0,
        'vat_amount' => 0,
        'total' => 0,
    ]);

    $response->assertSessionHasNoErrors();

    $orderItem->refresh();
    expect($orderItem->status)->toBe('cancelled');
    expect($orderItem->quantity)->toBe(0);
    expect($orderItem->cancellation_reason)->toContain('Hết nguyên liệu');

    expect($order->fresh()->status)->toBe('cancelled');
});

test('không thể giảm món của đơn đã hoàn tất thanh toán', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 20000]], [
        'status' => 'completed',
    ]);
    $orderItem = $order->items()->firstOrFail();
    $orderItem->update(['status' => 'completed']);

    $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'reduced_items' => [
            [
                'order_item_id' => $orderItem->id,
                'reduce_quantity' => 1,
                'cancellation_reason' => 'Khách đổi ý',
            ],
        ],
        'subtotal' => 0,
        'vat_amount' => 0,
        'total' => 0,
    ]);

    // Món đã completed bị bỏ qua, giữ nguyên số lượng
    expect($orderItem->fresh()->quantity)->toBe(2);
});

test('idempotency key chặn double-submit không tạo đơn trùng', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $item = posMenuItem();

    $payload = [
        'table_id' => $table->id,
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 1, 'unit_price' => 20000],
        ],
        'subtotal' => 20000,
        'vat_amount' => 0,
        'total' => 20000,
        'idempotency_key' => 'test-key-abc-123',
    ];

    $this->post('/staff/pos/send-to-kitchen', $payload)->assertSessionHasNoErrors();
    $this->post('/staff/pos/send-to-kitchen', $payload)->assertSessionHasNoErrors();

    expect(Order::count())->toBe(1);
});

test('gửi bếp thiếu dữ liệu bắt buộc bị từ chối bởi validation', function () {
    $this->actingAs(posAdmin());
    $table = posTable();

    // subtotal/vat/total không còn bắt buộc — giá tính từ DB.
    // Dữ liệu bắt buộc giờ là từng món: thiếu menu_item_id → bị từ chối.
    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [
            ['quantity' => 1],
        ],
    ]);

    $response->assertSessionHasErrors(['items.0.menu_item_id']);
    expect(Order::count())->toBe(0);
});

test('nhân viên không có quyền pos.create bị chặn gửi bếp (403)', function () {
    $staff = posStaff(['pos.view']); // chỉ có quyền xem
    $this->actingAs($staff);
    $table = posTable();
    $item = posMenuItem();

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 1, 'unit_price' => 20000],
        ],
        'subtotal' => 20000,
        'vat_amount' => 0,
        'total' => 20000,
    ]);

    $response->assertStatus(403);
    expect(Order::count())->toBe(0);
});

test('nhân viên có quyền pos.create gửi bếp thành công', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $this->actingAs($staff);
    $table = posTable();
    $item = posMenuItem();

    $response = $this->post('/staff/pos/send-to-kitchen', [
        'table_id' => $table->id,
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 1, 'unit_price' => 20000],
        ],
        'subtotal' => 20000,
        'vat_amount' => 0,
        'total' => 20000,
    ]);

    $response->assertSessionHasNoErrors();
    expect(Order::count())->toBe(1);
});
