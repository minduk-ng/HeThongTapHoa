<?php

use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderActivity;

/*
|--------------------------------------------------------------------------
| POS — Thanh toán đơn lẻ (checkout)
|--------------------------------------------------------------------------
| Bao phủ:
| - Khóa bếp: không cho thanh toán khi món chưa hoàn tất (thiếu quyền bypass)
| - Quyền pos.bypass_kitchen_lock cho phép duyệt khẩn cấp
| - Tạo hóa đơn đúng tổng tiền, nhả bàn khi hết đơn
| - Bàn KHÔNG được nhả khi vẫn còn đơn khác đang hoạt động
| - Chặn thanh toán lại đơn đã paid/cancelled
| - Nhóm bàn gộp: chỉ nhả cả nhóm khi tất cả đơn của nhóm đã xong
| - Đơn Mang đi: hóa đơn ghi "Mang đi"
| - Idempotency chống tạo hóa đơn trùng
*/

test('nhân viên thường không thể thanh toán khi món chưa được bếp hoàn tất', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $this->actingAs($staff);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'pending']]);

    $response = $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasErrors(['error']);
    expect($order->fresh()->status)->toBe('pending');
    expect(Invoice::count())->toBe(0);
    expect($table->fresh()->status)->toBe('occupied');
});

test('người có quyền bypass_kitchen_lock được duyệt khẩn cấp thanh toán món chưa hoàn tất', function () {
    $staff = posStaff(['pos.view', 'pos.create', 'pos.bypass_kitchen_lock']);
    $this->actingAs($staff);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'pending']]);

    $response = $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasNoErrors();
    expect($order->fresh()->status)->toBe('paid');
    expect(Invoice::count())->toBe(1);
});

test('thanh toán thành công tạo hóa đơn đúng tổng tiền và nhả bàn', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'B10', 'status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'completed'],
        ['item' => $item, 'qty' => 1, 'price' => 15000, 'status' => 'completed'],
    ], ['status' => 'completed']);

    $response = $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
        'change_amount' => 25000,
    ]);

    $response->assertSessionHasNoErrors();

    $order->refresh();
    expect($order->status)->toBe('paid');

    $invoice = Invoice::firstOrFail();
    expect((float) $invoice->total_amount)->toBe(75000.0);
    expect($invoice->table_name)->toBe('B10');
    expect($invoice->payment_method)->toBe('cash');
    expect($order->invoice_id)->toBe($invoice->id);

    // Bàn được nhả vì không còn đơn hoạt động
    expect($table->fresh()->status)->toBe('available');

    // Audit log: checkout
    expect(OrderActivity::where('order_id', $order->id)->where('action', 'checkout')->exists())->toBeTrue();
});

test('REGRESSION: thanh toán 1 đơn không ảnh hưởng các đơn khác cùng bàn, bàn vẫn giữ khách', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order1->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    // Chỉ đơn 1 được thanh toán, đơn 2 giữ nguyên
    expect($order1->fresh()->status)->toBe('paid');
    expect($order2->fresh()->status)->toBe('completed');
    expect(Invoice::count())->toBe(1);
    expect($table->fresh()->status)->toBe('occupied');
});

test('không thể thanh toán lại đơn đã paid hoặc đơn đã hủy', function () {
    $this->actingAs(posAdmin());
    $table = posTable();
    $item = posMenuItem();
    $paidOrder = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'paid']);
    $cancelledOrder = posOrder($table, [['item' => $item, 'status' => 'cancelled']], ['status' => 'cancelled']);

    foreach ([$paidOrder, $cancelledOrder] as $order) {
        $response = $this->post('/staff/pos/checkout', [
            'order_id' => $order->id,
            'payment_method' => 'cash',
            'amount_received' => 20000,
            'change_amount' => 0,
        ]);
        $response->assertSessionHasErrors(['error']);
    }

    expect(Invoice::count())->toBe(0);
});

test('REGRESSION: bàn gộp chỉ được nhả và hủy liên kết gộp khi tất cả đơn trong nhóm đã thanh toán', function () {
    $this->actingAs(posAdmin());
    $primary = posTable(['table_number' => 'B21', 'status' => 'occupied']);
    $sub = posTable(['table_number' => 'B22', 'status' => 'occupied', 'merged_into_table_id' => null]);
    $sub->update(['merged_into_table_id' => $primary->id]);
    $item = posMenuItem();

    // Sau khi gộp, mọi đơn thuộc bàn chính
    $order1 = posOrder($primary, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($primary, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'completed']);

    // Thanh toán đơn 1: nhóm vẫn còn đơn 2 → không bàn nào được nhả
    $this->post('/staff/pos/checkout', [
        'order_id' => $order1->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    expect($primary->fresh()->status)->toBe('occupied');
    expect($sub->fresh()->merged_into_table_id)->toBe($primary->id);

    // Thanh toán nốt đơn 2: cả nhóm được nhả, hóa đơn ghi tên bàn gộp
    $this->post('/staff/pos/checkout', [
        'order_id' => $order2->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    expect($primary->fresh()->status)->toBe('available');
    $subFresh = $sub->fresh();
    expect($subFresh->status)->toBe('available');
    expect($subFresh->merged_into_table_id)->toBeNull();

    $lastInvoice = Invoice::latest('id')->firstOrFail();
    expect($lastInvoice->table_name)->toContain('Gộp');
    expect($lastInvoice->table_name)->toContain('B21');
    expect($lastInvoice->table_name)->toContain('B22');
});

test('thanh toán đơn Mang đi ghi hóa đơn "Mang đi" và không đụng tới bàn nào', function () {
    $this->actingAs(posAdmin());
    $otherTable = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $takeaway = posOrder(null, [['item' => $item, 'qty' => 1, 'price' => 45000, 'status' => 'completed']], ['status' => 'completed']);

    $response = $this->post('/staff/pos/checkout', [
        'order_id' => $takeaway->id,
        'payment_method' => 'bank_transfer',
        'amount_received' => 45000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasNoErrors();
    expect($takeaway->fresh()->status)->toBe('paid');

    $invoice = Invoice::firstOrFail();
    expect($invoice->table_name)->toBe('Mang đi');
    expect((float) $invoice->total_amount)->toBe(45000.0);

    // Bàn khác không liên quan giữ nguyên trạng thái
    expect($otherTable->fresh()->status)->toBe('occupied');
});

test('idempotency key chặn thanh toán lặp không tạo hóa đơn trùng', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);

    $payload = [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
        'idempotency_key' => 'checkout-key-xyz',
    ];

    $this->post('/staff/pos/checkout', $payload)->assertSessionHasNoErrors();
    $this->post('/staff/pos/checkout', $payload)->assertSessionHasNoErrors();

    expect(Invoice::count())->toBe(1);
});

test('checkout áp mã khuyến mãi trừ discount và tăng used_count', function () {
    $this->actingAs(posAdmin());
    $promo = App\Models\Promotion::create([
        'code' => 'CK10',
        'name' => 'Checkout 10%',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'max_uses' => 100,
        'used_count' => 0,
    ]);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 54000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $order->refresh();
    expect($order->promotion_id)->toBe($promo->id);
    expect((float) $order->discount_amount)->toBe(6000.0);
    expect((float) $order->total)->toBe(54000.0);
    expect((float) App\Models\Invoice::firstOrFail()->total_amount)->toBe(54000.0);
    expect($promo->fresh()->used_count)->toBe(1);
});

test('checkout từ chối mã không còn hợp lệ và rollback', function () {
    $this->actingAs(posAdmin());
    $promo = App\Models\Promotion::create([
        'code' => 'EXPIRE',
        'name' => 'Hết hạn',
        'discount_type' => 'fixed_amount',
        'discount_value' => 10000,
        'expires_at' => now()->subDay(),
    ]);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasErrors(['error']);

    expect($order->fresh()->status)->toBe('completed');
    expect(App\Models\Invoice::count())->toBe(0);
});

test('tổng tiền hóa đơn không tính món đã hủy', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 2, 'price' => 30000, 'status' => 'completed'],
        ['item' => $item, 'qty' => 5, 'price' => 30000, 'status' => 'cancelled'],
    ], ['status' => 'completed']);

    // Món hủy phải có quantity = 0 theo nghiệp vụ giảm món
    $order->items()->where('status', 'cancelled')->update(['quantity' => 0, 'subtotal' => 0]);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 60000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    expect((float) Invoice::firstOrFail()->total_amount)->toBe(60000.0);
});
