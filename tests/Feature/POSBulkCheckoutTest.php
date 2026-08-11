<?php

use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderActivity;

/*
|--------------------------------------------------------------------------
| POS — Thanh toán gộp (bulkCheckout: 1 hóa đơn cho N đơn)
|--------------------------------------------------------------------------
| Bao phủ:
| - 1 hóa đơn duy nhất cho nhiều đơn, tổng tiền cộng dồn đúng
| - REGRESSION (Mang đi): chỉ thanh toán đúng các order_ids gửi lên,
|   các đơn mang đi khác của khách khác KHÔNG bị thanh toán ké
| - REGRESSION (bàn gộp): tổng tiền hóa đơn = tổng của TẤT CẢ đơn trong nhóm
| - Từ chối khi có đơn đã paid/cancelled trong danh sách
| - Khóa bếp áp dụng cho từng đơn trong danh sách
| - Nhả bàn cả nhóm sau khi thanh toán hết
| - Idempotency chống tạo hóa đơn trùng
*/

test('thanh toán gộp tạo đúng 1 hóa đơn cho nhiều đơn với tổng tiền cộng dồn', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'B30', 'status' => 'occupied']);
    $item = posMenuItem();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 25000, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 40000, 'status' => 'completed']], ['status' => 'completed']);

    $response = $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id, $order2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
        'change_amount' => 10000,
    ]);

    $response->assertSessionHasNoErrors();

    expect(Invoice::count())->toBe(1);
    $invoice = Invoice::firstOrFail();
    expect((float) $invoice->total_amount)->toBe(90000.0);
    expect($invoice->table_name)->toBe('B30');

    // Cả 2 đơn đều paid và trỏ về cùng 1 hóa đơn
    expect($order1->fresh()->status)->toBe('paid');
    expect($order2->fresh()->status)->toBe('paid');
    expect($order1->fresh()->invoice_id)->toBe($invoice->id);
    expect($order2->fresh()->invoice_id)->toBe($invoice->id);

    // Bàn được nhả
    expect($table->fresh()->status)->toBe('available');

    // Mỗi đơn có audit log checkout với cờ bulk
    expect(OrderActivity::where('action', 'checkout')->count())->toBe(2);
});

test('REGRESSION Mang đi: thanh toán gộp chỉ áp dụng cho order_ids được chọn, đơn của khách khác giữ nguyên', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem();

    // 3 đơn mang đi của 3 khách độc lập (table_id NULL)
    $orderA = posOrder(null, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);
    $orderB = posOrder(null, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'completed']);
    $orderC = posOrder(null, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);

    // Chỉ thanh toán đơn A
    $response = $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$orderA->id],
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasNoErrors();

    expect($orderA->fresh()->status)->toBe('paid');
    // Các đơn còn lại KHÔNG bị thanh toán ké
    expect($orderB->fresh()->status)->toBe('completed');
    expect($orderC->fresh()->status)->toBe('completed');
    expect($orderB->fresh()->invoice_id)->toBeNull();
    expect($orderC->fresh()->invoice_id)->toBeNull();

    $invoice = Invoice::firstOrFail();
    expect((float) $invoice->total_amount)->toBe(20000.0);
    expect($invoice->table_name)->toBe('Mang đi');
});

test('REGRESSION bàn gộp: hóa đơn gộp cộng đủ tổng tiền tất cả đơn của cả nhóm bàn', function () {
    $this->actingAs(posAdmin());
    $primary = posTable(['table_number' => 'B41', 'status' => 'occupied']);
    $sub = posTable(['table_number' => 'B42', 'status' => 'occupied']);
    $sub->update(['merged_into_table_id' => $primary->id]);
    $item = posMenuItem();

    // Đơn của bàn 1 (trước khi gộp) và đơn của bàn 2 (đã dồn về bàn chính sau merge)
    $orderT1 = posOrder($primary, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);
    $orderT2 = posOrder($primary, [['item' => $item, 'qty' => 1, 'price' => 60000, 'status' => 'completed']], ['status' => 'completed']);

    $response = $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$orderT1->id, $orderT2->id],
        'table_id' => $sub->id, // thao tác từ bàn phụ vẫn phải ra đúng nhóm
        'payment_method' => 'bank_transfer',
        'amount_received' => 160000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasNoErrors();

    $invoice = Invoice::firstOrFail();
    // Tổng tiền phải là CẢ 2 bàn, không phải chỉ bàn đang đứng
    expect((float) $invoice->total_amount)->toBe(160000.0);
    expect($invoice->table_name)->toContain('Gộp');

    // Cả nhóm bàn được nhả và gỡ liên kết gộp
    expect($primary->fresh()->status)->toBe('available');
    expect($sub->fresh()->status)->toBe('available');
    expect($sub->fresh()->merged_into_table_id)->toBeNull();
});

test('thanh toán gộp bị từ chối nếu danh sách chứa đơn đã thanh toán hoặc đã hủy', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $validOrder = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);
    $paidOrder = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'paid']);

    $response = $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$validOrder->id, $paidOrder->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasErrors(['error']);
    // Giao dịch rollback toàn bộ: không hóa đơn, không đơn nào đổi trạng thái
    expect(Invoice::count())->toBe(0);
    expect($validOrder->fresh()->status)->toBe('completed');
});

test('khóa bếp: thanh toán gộp bị chặn nếu bất kỳ đơn nào còn món chưa hoàn tất (không có quyền bypass)', function () {
    $staff = posStaff(['pos.view', 'pos.create']);
    $this->actingAs($staff);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $doneOrder = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);
    $cookingOrder = posOrder($table, [['item' => $item, 'status' => 'processing']]);

    $response = $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$doneOrder->id, $cookingOrder->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 40000,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasErrors(['error']);
    expect(Invoice::count())->toBe(0);
    expect($doneOrder->fresh()->status)->toBe('completed');
    expect($cookingOrder->fresh()->status)->toBe('pending');
});

test('bàn không được nhả nếu sau thanh toán gộp vẫn còn đơn khác hoạt động', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order1 = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($table, [['item' => $item, 'status' => 'pending']]); // còn hoạt động

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    expect($order1->fresh()->status)->toBe('paid');
    expect($table->fresh()->status)->toBe('occupied');
});

test('idempotency key chặn thanh toán gộp lặp không tạo hóa đơn trùng', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'status' => 'completed']], ['status' => 'completed']);

    $payload = [
        'order_ids' => [$order->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
        'idempotency_key' => 'bulk-key-001',
    ];

    $this->post('/staff/pos/bulk-checkout', $payload)->assertSessionHasNoErrors();
    $this->post('/staff/pos/bulk-checkout', $payload)->assertSessionHasNoErrors();

    expect(Invoice::count())->toBe(1);
});

test('bulk checkout áp một mã và phân bổ discount đúng tổng, đơn cuối nhận phần dư', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'BULKFIX']);
    addAction($promo, 'discount_amount', 10001);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id, $order2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 49999,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $o1 = $order1->fresh();
    $o2 = $order2->fresh();
    expect((float) $o1->discount_amount)->toBe(5000.0);
    expect((float) $o2->discount_amount)->toBe(5001.0);
    expect((float) $o1->discount_amount + (float) $o2->discount_amount)->toBe(10001.0);
    expect((float) Invoice::firstOrFail()->total_amount)->toBe(49999.0);
    expect($promo->fresh()->used_count)->toBe(1);
});

test('thanh toán gộp yêu cầu order_ids không rỗng', function () {
    $this->actingAs(posAdmin());

    $response = $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [],
        'payment_method' => 'cash',
        'amount_received' => 0,
        'change_amount' => 0,
    ]);

    $response->assertSessionHasErrors(['order_ids']);
});

test('bulk checkout ghi discount xuong tung dong trong moi order', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'BULK10']);
    addAction($promo, 'discount_percent', 10);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem(['price' => 50000]);
    $o1 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);
    $o2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$o1->id, $o2->id],
        'payment_method' => 'cash',
        'amount_received' => 135000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    foreach ([$o1, $o2] as $o) {
        $o->refresh();
        $items = $o->items;
        foreach ($items as $it) {
            expect((float) $it->discount_amount)->toBeGreaterThanOrEqual(0);
        }
    }
    // Tổng discount order = tổng discount item trên mỗi đơn
    $o1->refresh();
    $o2->refresh();
    expect((float) $o1->items->sum('discount_amount'))->toBe((float) $o1->discount_amount);
    expect((float) $o2->items->sum('discount_amount'))->toBe((float) $o2->discount_amount);
    expect((float) $o1->discount_amount + (float) $o2->discount_amount)->toBe(15000.0);
});

test('bulk checkout ghi lines cho moi don va tong payments', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 60000, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 40000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id, $order2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    $invoice = Invoice::firstOrFail();
    expect($invoice->lines)->toHaveCount(2);
    expect((float) $invoice->subtotal_amount)->toBe(100000.0);
    expect((float) $invoice->total_amount)->toBe(100000.0);
    expect($invoice->payments)->toHaveCount(1);
});
