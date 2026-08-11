<?php

test('validate-promotion tra the thong bao rieng do ly do khac nhau', function (array $attrs, string $message) {
    $promo = promoV2(['type' => 'coupon'] + $attrs);
    addAction($promo, 'discount_percent', 10);

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 50000])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => $message]);
})->with([
    'tat ngung' => [['status' => false], 'Mã khuyến mãi đang tạm ngưng.'],
    'chua toi han' => [['start_date' => now()->addDay()], 'Mã khuyến mãi chưa tới hạn áp dụng.'],
    'het han' => [['end_date' => now()->subDay()], 'Mã khuyến mãi đã hết hạn.'],
    'het luot' => [['max_usage' => 1, 'used_count' => 1], 'Mã khuyến mãi đã hết lượt sử dụng.'],
]);

test('validate-promotion dieu kien khong tho tra loi ro rang', function () {
    $promo = promoV2(['type' => 'coupon']);
    addCond($promo, 'min_order_value', '200000');
    addAction($promo, 'discount_percent', 10);

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 50000])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => 'Đơn hàng chưa đáp ứng điều kiện khuyến mãi.']);
});

test('validate-promotion ma khong ton tai tra loi ro rang', function () {
    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => 'NOEXIST'.substr(uniqid(), -5), 'subtotal' => 50000])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => 'Mã khuyến mãi không tồn tại.']);
});

test('validate-promotion specific_product khong co trong don tra loi ro rang', function () {
    $item = posMenuItem(['price' => 50000]);
    $promo = promoV2(['type' => 'coupon']);
    addCond($promo, 'specific_product', '999999');
    addAction($promo, 'discount_percent', 10);

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', [
            'code' => $promo->code,
            'subtotal' => 50000,
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1, 'unit_price' => 50000]],
        ])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => 'Đơn hàng chưa đáp ứng điều kiện khuyến mãi.']);
});

test('validate-promotion ma hop le giam 0 dong van ok true (phuc vu frontend)', function () {
    $promo = promoV2(['type' => 'coupon']);
    addAction($promo, 'discount_amount', 0);

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 50000])
        ->assertOk()->assertJson(['ok' => true, 'discount_amount' => 0]);
});
