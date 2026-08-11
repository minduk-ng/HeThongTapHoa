<?php

use App\Models\InvoiceLine;
use App\Models\OrderPromotion;
use App\Services\Promotions\PromotionEngine;

test('condition min_order_value: khong tho dieu kien thi khong ap dung', function () {
    $p = promoV2();
    addCond($p, 'min_order_value', '200000');

    $res = PromotionEngine::resolveAll([], linesV2(), 120000);

    expect($res['status'])->toBe('ok');
    expect($res['promotions'])->toBeEmpty();
    expect($res['total_discount'])->toBe(0.0);
});

test('condition min_order_value: tho dieu kien ap dung', function () {
    $p = promoV2();
    addCond($p, 'min_order_value', '100000');
    addAction($p, 'discount_percent', 10);

    $res = PromotionEngine::resolveAll([], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(15000.0);
});

test('condition min_quantity + specific_product: AND', function () {
    $p = promoV2();
    addCond($p, 'min_quantity', '3');
    addCond($p, 'specific_product', '10');
    addAction($p, 'discount_amount', 20000);

    // Đủ 3 món + có món 10 → OK
    $res = PromotionEngine::resolveAll([], linesV2(), 150000);
    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(20000.0);

    // Thiếu món 10 → không áp dụng
    $p->delete(); // loại promo đang khớp ở phần 1 để chỉ còn $p2 trong pool
    $p2 = promoV2();
    addCond($p2, 'min_quantity', '3');
    addCond($p2, 'specific_product', '999');
    addAction($p2, 'discount_amount', 20000);
    $res2 = PromotionEngine::resolveAll([], linesV2(), 150000);
    expect($res2['status'])->toBe('ok');
    expect($res2['promotions'])->toBeEmpty();
    expect($res2['total_discount'])->toBe(0.0);
});

test('promotion tu dong chon 1 tot nhat', function () {
    $p1 = promoV2();
    addAction($p1, 'discount_amount', 5000);
    $p2 = promoV2();
    addAction($p2, 'discount_amount', 20000);
    $p3 = promoV2();
    addAction($p3, 'discount_amount', 10000);

    $res = PromotionEngine::resolveAll([], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);  // chỉ 1 promotion tốt nhất
    expect($res['promotions'][0]['promotion']->id)->toBe($p2->id);
    expect($res['total_discount'])->toBe(20000.0);
});

test('discount_percent cap max_discount_amount', function () {
    $p = promoV2();
    addAction($p, 'discount_percent', 20, 15000);

    $res = PromotionEngine::resolveAll([], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(15000.0);  // 20% = 30000, cap 15000
});

test('coupon nhap ma: validate + exclusive', function () {
    // stackable=false → chặn promotion tự động (spec: PROMOTION tự động bị loại nếu có COUPON stackable=false)
    $coupon = promoV2(['type' => 'coupon', 'code' => 'SAVE10', 'stackable' => false]);
    addAction($coupon, 'discount_percent', 10);
    $auto = promoV2();
    addAction($auto, 'discount_amount', 5000);

    // Nhập mã SAVE10 → chỉ mã, KHÔNG promotion tự động
    $res = PromotionEngine::resolveAll(['SAVE10'], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);
    expect($res['promotions'][0]['promotion']->id)->toBe($coupon->id);
});

test('resolveAll: code trung lap chi ap dung 1 lan', function () {
    $coupon = promoV2(['type' => 'coupon', 'code' => 'DD10']);
    addAction($coupon, 'discount_amount', 10000);

    $res = PromotionEngine::resolveAll(['DD10', 'dd10', '  DD10 '], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);
    expect($res['total_discount'])->toBe(10000.0);  // không bị nhân đôi
});

test('exclusive=true bo het promotion khac', function () {
    $ex = promoV2(['type' => 'coupon', 'code' => 'EXCL', 'exclusive' => true]);
    addAction($ex, 'discount_amount', 30000);
    $other = promoV2(['type' => 'coupon', 'code' => 'OTHER']);
    addAction($other, 'discount_amount', 5000);

    $res = PromotionEngine::resolveAll(['EXCL', 'OTHER'], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1);
    expect($res['promotions'][0]['promotion']->id)->toBe($ex->id);
});

test('free_product: tra ve free_items', function () {
    $mi = posMenuItem(['price' => 20000]);
    $p = promoV2();
    addAction($p, 'free_product', $mi->id);

    $res = PromotionEngine::resolveAll([], linesV2(), 150000);

    expect($res['status'])->toBe('ok');
    expect($res['free_items'])->toContain(['menu_item_id' => $mi->id, 'name' => $mi->name]);
});

test('validate-promotion: condition min_quantity tinh tu quantity cua line', function () {
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $coupon = promoV2(['type' => 'coupon', 'code' => 'VQ2'.substr(uniqid(), -4)]);
    addCond($coupon, 'min_quantity', '2');
    addAction($coupon, 'discount_amount', 10000);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $coupon->code,
        'items' => [
            ['menu_item_id' => $item->id, 'quantity' => 2, 'unit_price' => 30000],
        ],
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 10000]);
});

test('checkout: condition min_quantity ap dung khi du so luong line', function () {
    $admin = posAdmin();
    $coupon = promoV2(['type' => 'coupon', 'code' => 'MINQTY2']);
    addCond($coupon, 'min_quantity', '2');
    addAction($coupon, 'discount_amount', 10000);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [
        ['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
        ['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 90000,
        'promotion_code' => 'MINQTY2',
    ])->assertOk()->assertJson(['success' => true]);

    // subtotal 100000, discount 10000 → total 90000
    $op = OrderPromotion::first();
    expect($op)->not->toBeNull();
    expect($op->promotion_id)->toBe($coupon->id);
    expect((float) $op->discount_applied)->toBe(10000.0);
    expect($coupon->fresh()->used_count)->toBe(1);
});

test('checkout: coupon ghi order_promotions + cap dung', function () {
    $admin = posAdmin();
    $coupon = promoV2(['type' => 'coupon', 'code' => 'CHECKOUT10']);
    addAction($coupon, 'discount_percent', 10, 20000);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'promotion_code' => 'CHECKOUT10',
    ])->assertOk()->assertJson(['success' => true]);

    // 10% của 50000 = 5000, cap 20000 → 5000
    $op = OrderPromotion::first();
    expect($op)->not->toBeNull();
    expect($op->promotion_id)->toBe($coupon->id);
    expect((float) $op->discount_applied)->toBe(5000.0);
    expect($coupon->fresh()->used_count)->toBe(1);

    // Discount phân bổ xuống line + order_item (cho báo cáo line-level)
    $line = InvoiceLine::first();
    expect((float) $line->discount_amount)->toBe(5000.0);
    expect((float) $order->items()->first()->fresh()->discount_amount)->toBe(5000.0);
});

test('checkout: free_product them line 0d', function () {
    $admin = posAdmin();
    $free = posMenuItem(['price' => 15000, 'vat_rate' => 0]);
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'free_product', $free->id);
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
    ])->assertOk();

    $freeLine = InvoiceLine::where('menu_item_id', $free->id)->first();
    expect($freeLine)->not->toBeNull();
    expect((float) $freeLine->subtotal)->toBe(0.0);
    expect((float) $freeLine->unit_price)->toBe(0.0);
});

test('race: 2 checkout dong thoi khong vuot max_usage', function () {
    $admin = posAdmin();
    $coupon = promoV2(['type' => 'coupon', 'code' => 'RACE1', 'max_usage' => 1]);
    addAction($coupon, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $table = posTable();
    $o1 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);
    $o2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'pending']);

    // Chạy 2 checkout tuần tự: request 1 dùng lock + increment (0→1), request 2 thấy used_count=1=max_usage → reject
    $r1 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o1->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => 'RACE1',
    ]);
    $r2 = $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $o2->id, 'payment_method' => 'cash', 'amount_received' => 20000, 'promotion_code' => 'RACE1',
    ]);

    // 1 thành công + 1 bị từ chối (hết quota) — quota không bao giờ vượt
    $r1->assertOk();
    $r2->assertStatus(422);
    expect($coupon->fresh()->used_count)->toBeLessThanOrEqual(1);
    expect(OrderPromotion::count())->toBeLessThanOrEqual(1);
});
