<?php

test('validate-promotion tính đúng percentage, cap và fixed amount', function () {
    $this->actingAs(posStaff());

    $percentage = promoV2(['type' => 'coupon', 'code' => 'VLD'.substr(uniqid(), -6)]);
    addAction($percentage, 'discount_percent', 10);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $percentage->code,
        'subtotal' => 200000,
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 20000, 'total' => 180000]);

    $capped = promoV2(['type' => 'coupon', 'code' => 'VLD'.substr(uniqid(), -6)]);
    addAction($capped, 'discount_percent', 10, 15000);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $capped->code,
        'subtotal' => 200000,
    ])->assertOk()->assertJson(['discount_amount' => 15000, 'total' => 185000]);

    $fixed = promoV2(['type' => 'coupon', 'code' => 'VLD'.substr(uniqid(), -6)]);
    addAction($fixed, 'discount_amount', 300000);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $fixed->code,
        'subtotal' => 200000,
    ])->assertOk()->assertJson(['discount_amount' => 200000, 'total' => 0]);
});

test('validate-promotion từ chối mã không tồn tại, hết hạn, chưa tới hạn, hết lượt, dưới min hoặc vô hiệu', function () {
    $this->actingAs(posStaff());

    // không tồn tại
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => 'KHONGCO'.substr(uniqid(), -4),
        'subtotal' => 200000,
    ])->assertStatus(422)->assertJson(['ok' => false]);

    // hết hạn / chưa tới hạn / hết lượt / vô hiệu
    foreach ([
        ['end_date' => now()->subDay()],
        ['start_date' => now()->addDay()],
        ['max_usage' => 1, 'used_count' => 1],
        ['status' => false],
    ] as $attrs) {
        $promo = promoV2(['type' => 'coupon'] + $attrs);
        addAction($promo, 'discount_percent', 10);
        $this->postJson('/staff/pos/validate-promotion', [
            'code' => $promo->code,
            'subtotal' => 200000,
        ])->assertStatus(422)->assertJson(['ok' => false]);
    }

    // dưới min (condition_not_met)
    $min = promoV2(['type' => 'coupon']);
    addCond($min, 'min_order_value', '500000');
    addAction($min, 'discount_percent', 10);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $min->code,
        'subtotal' => 200000,
    ])->assertStatus(422)->assertJson(['ok' => false]);
});

test('validate-promotion specific_product chi ap dung khi mon do co trong don', function () {
    $this->actingAs(posStaff());
    $itemA = posMenuItem(['price' => 100000]);
    $itemB = posMenuItem(['price' => 300000]);

    $promo = promoV2(['type' => 'coupon']);
    addCond($promo, 'specific_product', (string) $itemA->id);
    addAction($promo, 'discount_percent', 10);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 400000,
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 100000],
            ['menu_item_id' => $itemB->id, 'quantity' => 1, 'unit_price' => 300000],
        ],
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 40000, 'total' => 360000]);

    $bad = promoV2(['type' => 'coupon']);
    addCond($bad, 'specific_product', '999999');
    addAction($bad, 'discount_percent', 10);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $bad->code,
        'subtotal' => 400000,
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 100000],
        ],
    ])->assertStatus(422)->assertJson(['ok' => false]);
});

test('validate-promotion stack nhieu ma', function () {
    $p1 = promoV2(['type' => 'coupon', 'code' => 'ST1'.substr(uniqid(), -4)]);
    addAction($p1, 'discount_percent', 10);
    $p2 = promoV2(['type' => 'coupon', 'code' => 'ST2'.substr(uniqid(), -4)]);
    addAction($p2, 'discount_amount', 20000);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'codes' => [$p1->code, $p2->code],
        'subtotal' => 100000,
    ])->assertOk()->assertJson([
        'ok' => true,
        'discount_amount' => 30000,
        'total' => 70000,
    ]);
});

test('validate-promotion mot ma trong codes van tra promotion don', function () {
    $p = promoV2(['type' => 'coupon', 'code' => 'ST3'.substr(uniqid(), -4)]);
    addAction($p, 'discount_percent', 10);
    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'codes' => [$p->code],
        'subtotal' => 100000,
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 10000]);
});

test('validate-promotion min_order_value kiem tra tong don', function () {
    $this->actingAs(posStaff());
    $itemA = posMenuItem(['price' => 100000]);
    $itemB = posMenuItem(['price' => 300000]);

    $promo = promoV2(['type' => 'coupon']);
    addCond($promo, 'min_order_value', '300000');
    addAction($promo, 'discount_percent', 10);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 400000,
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 100000],
            ['menu_item_id' => $itemB->id, 'quantity' => 1, 'unit_price' => 300000],
        ],
    ])->assertOk()->assertJson(['discount_amount' => 40000]);
});
