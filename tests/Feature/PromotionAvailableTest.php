<?php

test('available-promotions tra danh sach promotion type=promotion khop dieu kien + estimated_discount', function () {
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'discount_percent', 10);
    $coupon = promoV2(['type' => 'coupon', 'code' => 'AV1'.substr(uniqid(), -4)]);
    addAction($coupon, 'discount_amount', 5000);

    $item = posMenuItem(['price' => 100000]);
    $res = $this->actingAs(posStaff())->postJson('/staff/pos/available-promotions', [
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ]);

    $res->assertOk();
    $data = $res->json();
    expect($data['ok'])->toBeTrue();
    $ids = array_column($data['promotions'], 'id');
    expect($ids)->toContain($p->id);
    expect($ids)->not->toContain($coupon->id); // coupon không nằm trong danh sách auto
});

test('available-promotions khong increment used_count', function () {
    $p = promoV2(['type' => 'promotion', 'max_usage' => 5]);
    addAction($p, 'discount_percent', 10);
    $item = posMenuItem(['price' => 100000]);

    $this->actingAs(posStaff())->postJson('/staff/pos/available-promotions', [
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ])->assertOk();

    expect($p->fresh()->used_count)->toBe(0);
});

test('validate-promotion nhan selected_promotion_id: tra discount dung promotion da chon', function () {
    $pBig = promoV2(['type' => 'promotion']);
    addAction($pBig, 'discount_amount', 20000);
    $pSmall = promoV2(['type' => 'promotion']);
    addAction($pSmall, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 100000]);

    $res = $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => null,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        'selected_promotion_id' => $pSmall->id,
    ])->assertOk();

    expect($res->json('discount_amount'))->toEqual(5000.0);
});

test('validate-promotion selected_promotion_id = 0: khong ap auto promotion, discount 0', function () {
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'discount_amount', 20000);
    $item = posMenuItem(['price' => 100000]);

    $res = $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => null,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        'selected_promotion_id' => 0,
    ])->assertOk();

    expect($res->json('discount_amount'))->toEqual(0);
    expect($res->json('promotions'))->toBeEmpty();
});
