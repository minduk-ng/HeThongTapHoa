<?php

use App\Models\Invoice;
use App\Models\MenuCategory;
use App\Models\OrderActivity;
use App\Models\OrderPromotion;

/*
|--------------------------------------------------------------------------
| POS — Thanh toán đơn lẻ (checkout)
|--------------------------------------------------------------------------
| Bao phủ:
| - Thanh toán được ngay khi đơn còn món ở bếp; sau khi paid bếp vẫn hoàn thành món
| - Tạo hóa đơn đúng tổng tiền, nhả bàn khi hết đơn
| - Bàn KHÔNG được nhả khi vẫn còn đơn khác đang hoạt động
| - Chặn thanh toán lại đơn đã paid/cancelled
| - Nhóm bàn gộp: chỉ nhả cả nhóm khi tất cả đơn của nhóm đã xong
| - Đơn Mang đi: hóa đơn ghi "Mang đi"
| - Idempotency chống tạo hóa đơn trùng
*/

test('thanh toán được khi đơn còn món pending/processing ở bếp', function () {
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
    $promo = promoV2(['type' => 'coupon', 'code' => 'CK10']);
    addAction($promo, 'discount_percent', 10);
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
    expect(OrderPromotion::where('order_id', $order->id)->where('promotion_id', $promo->id)->exists())->toBeTrue();
    expect((float) $order->discount_amount)->toBe(6000.0);
    expect((float) $order->total)->toBe(54000.0);
    expect((float) Invoice::firstOrFail()->total_amount)->toBe(54000.0);
    expect($promo->fresh()->used_count)->toBe(1);
});

test('checkout từ chối mã không còn hợp lệ và rollback', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'EXPIRE', 'end_date' => now()->subDay()]);
    addAction($promo, 'discount_amount', 10000);
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
    expect(Invoice::count())->toBe(0);
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

test('checkout specific_product: discount ap khi mon co mat, phan bo theo ty trong', function () {
    $this->actingAs(posAdmin());
    $cat = MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'price' => 300000]);
    $promo = promoV2(['type' => 'coupon', 'code' => 'ITEM10']);
    addCond($promo, 'specific_product', (string) $itemA->id);
    addAction($promo, 'discount_percent', 10);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [
        ['item' => $itemA, 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
        ['item' => $itemB, 'qty' => 1, 'price' => 300000, 'status' => 'completed'],
    ], ['status' => 'completed']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 360000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $order->refresh();
    // v2: % áp trên tổng subtotal 400k, phân bổ theo tỷ trọng từng dòng
    expect((float) $order->discount_amount)->toBe(40000.0);

    $items = $order->items->keyBy('menu_item_id');
    expect((float) $items[$itemA->id]->discount_amount)->toBe(10000.0);
    expect((float) $items[$itemB->id]->discount_amount)->toBe(30000.0);
});

test('checkout order scope phan bo discount xuong cac dong theo ty trong, dong cuoi nhan phan du', function () {
    $this->actingAs(posAdmin());
    $cat = MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'price' => 300000]);
    $promo = promoV2(['type' => 'coupon', 'code' => 'ORD10']);
    addAction($promo, 'discount_percent', 10);
    $table = posTable(['status' => 'occupied']);
    $order = posOrder($table, [
        ['item' => $itemA, 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
        ['item' => $itemB, 'qty' => 1, 'price' => 300000, 'status' => 'completed'],
    ], ['status' => 'completed']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 360000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $order->refresh();
    expect((float) $order->discount_amount)->toBe(40000.0);

    $items = $order->items->keyBy('menu_item_id');
    expect((float) $items[$itemA->id]->discount_amount)->toBe(10000.0);
    expect((float) $items[$itemB->id]->discount_amount)->toBe(30000.0);
});

test('checkout qua endpoint ghi invoice_lines payments va invoice_promotions', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'EP10']);
    addAction($promo, 'discount_percent', 10);
    $item = posMenuItem(['name' => 'Cf ep', 'price' => 50000, 'vat_rate' => 10]);
    $order = posOrder(posTable(['table_number' => 'B77']), [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 90000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $invoice = Invoice::firstOrFail();
    expect($invoice->lines)->toHaveCount(1);
    expect($invoice->lines->first()->name_snapshot)->toBe('Cf ep');
    expect($invoice->payments)->toHaveCount(1);
    expect((float) $invoice->payments->first()->amount)->toBe(90000.0);
    expect($invoice->promotions)->toHaveCount(1);
    expect((float) $invoice->total_amount)->toBe(90000.0); // 100k - 10k
});

test('checkout chap nhan e_wallet va change_amount co the thieu', function () {
    $this->actingAs(posAdmin());
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'completed']);

    $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'e_wallet',
        'amount_received' => 100000,
        // KHÔNG gửi change_amount — trước đây required → 422
    ])->assertOk();
});

test('checkout voi ma con chi dung duoc 1 lan', function () {
    $admin = posAdmin();
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'POS1', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $code = $p->codes()->first()->code;

    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    // Lần 1: dùng được
    $r1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => $code,
    ]);
    $r1->assertOk();

    // Mã đã used + truy vết invoice
    $pc = $p->codes()->first()->fresh();
    expect($pc->status)->toBe('used');
    expect($pc->used_invoice_id)->toBe(Invoice::latest('id')->firstOrFail()->id);

    // Lần 2: đơn khác, cùng mã → reject already_used
    $o2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);
    $r2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o2->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => $code,
    ]);
    $r2->assertStatus(422);
});

test('validate-promotion ma con da dung tra loi ro rang', function () {
    $admin = posAdmin();
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'POSV', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $pc = $p->codes()->first();
    $pc->update(['status' => 'used', 'used_at' => now()]);

    $this->actingAs($admin)->postJson('/staff/pos/validate-promotion', [
        'code' => $pc->code, 'subtotal' => 100000,
    ])->assertStatus(422)
        ->assertJson(['error' => 'Mã khuyến mãi đã được sử dụng.']);
});

test('free product: mon tang trong order bi set 0 va kho van tru', function () {
    $free = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $ingredient = \App\Models\Ingredient::create(['name' => 'Ngl free '.uniqid(), 'stock_quantity' => 100, 'unit' => 'g']);
    $free->recipes()->create(['ingredient_id' => $ingredient->id, 'amount' => 10, 'unit' => 'g']);

    $coupon = promoV2(['type' => 'coupon', 'code' => 'F'.substr(uniqid(), -5)]);
    addAction($coupon, 'free_product', $free->id);

    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable();
    // Đơn có cả món thường + món tặng (nhân viên đã bấm thêm)
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed'],
        ['item' => $free, 'qty' => 1, 'price' => 20000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs(posAdmin())->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
        'promotion_code' => $coupon->code,
    ])->assertOk();

    $invoice = $order->fresh()->invoice;
    // Món tặng subtotal = 0 trong invoice line
    $freeLine = $invoice->lines()->where('menu_item_id', $free->id)->first();
    expect((float) $freeLine->subtotal)->toBe(0.0);
    // Line món tặng mang giá trị món tặng làm discount_amount
    expect((float) $freeLine->discount_amount)->toBe(20000.0);
    // Tổng discount các line = discount_amount của invoice (không double-count)
    expect((float) $invoice->lines->sum('discount_amount'))->toBe((float) $invoice->discount_amount);
    // Tổng hoá đơn = 30000 (món thường) — món tặng không tính tiền
    expect((float) $invoice->total_amount)->toBe(30000.0);
    // Kho đã trừ nguyên liệu món tặng
    expect((float) $ingredient->fresh()->stock_quantity)->toBe(90.0);
});

test('checkout: voucher disabled bi tu choi', function () {
    $admin = posAdmin();
    $p = promoV2(['type' => 'voucher', 'code' => null, 'code_prefix' => 'DSBL'.substr(uniqid(), -4), 'code_quantity' => 1, 'code_random' => false]);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $pc = \App\Models\PromotionCode::where('promotion_id', $p->id)->first();
    $pc->update(['status' => 'disabled']);
    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'promotion_code' => $pc->code,
    ])->assertStatus(422);
});

test('bếp vẫn hoàn thành món sau khi đơn đã thanh toán', function () {
    $this->actingAs(posAdmin());
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'status' => 'pending']]);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();
    expect($order->fresh()->status)->toBe('paid');

    $orderItem = $order->items()->first();
    $this->actingAs(posAdmin())->postJson('/staff/kitchen/complete-items', [
        'order_id' => $order->id,
        'item_ids' => [$orderItem->id],
    ])->assertOk();

    expect($orderItem->fresh()->status)->toBe('completed');
});
