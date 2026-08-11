<?php

test('promotion model lưu đủ trường v2 và cast đúng kiểu', function () {
    $promo = promoV2([
        'type' => 'coupon',
        'code' => 'KMA10',
        'start_date' => '2026-08-01 08:00:00',
        'end_date' => '2026-08-10 22:00:00',
        'status' => true,
        'max_usage' => 100,
        'exclusive' => true,
        'stackable' => false,
    ]);

    $fresh = $promo->fresh();
    expect($fresh->code)->toBe('KMA10');
    expect($fresh->type)->toBe('coupon');
    expect($fresh->status)->toBeTrue();
    expect($fresh->exclusive)->toBeTrue();
    expect($fresh->stackable)->toBeFalse();
    expect($fresh->max_usage)->toBe(100);
    expect($fresh->used_count)->toBe(0);
    expect($fresh->start_date->toDateTimeString())->toBe('2026-08-01 08:00:00');
});

test('promotion relations conditions va actions', function () {
    $promo = promoV2(['type' => 'coupon', 'code' => 'REL'.substr(uniqid(), -4)]);
    $cond = addCond($promo, 'min_order_value', '100000');
    $action = addAction($promo, 'discount_percent', 10, 50000);

    expect($promo->conditions->pluck('id'))->toContain($cond->id);
    expect($promo->actions->pluck('id'))->toContain($action->id);
    expect($cond->promotion->is($promo))->toBeTrue();
    expect($action->promotion->is($promo))->toBeTrue();
});
