<?php

use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Collection;

function posRejectReasonLines(): Collection
{
    return collect([[
        'order_item_id' => 1,
        'menu_item_id' => null,
        'subtotal' => 100000.0,
        'category_id' => null,
    ]]);
}

test('promotion engine tra cac ly do tu choi rieng biet', function (array $attrs, string $expectReason) {
    $promo = promoV2(['type' => 'coupon'] + $attrs);
    addAction($promo, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);

    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe($expectReason);
})->with([
    'khong hoat dong' => [['status' => false], 'inactive'],
    'chua toi han' => [['start_date' => now()->addDay()], 'not_started'],
    'het han' => [['end_date' => now()->subDay()], 'expired'],
    'het luot' => [['max_usage' => 1, 'used_count' => 1], 'out_of_uses'],
]);

test('promotion engine dieu kien khong tho tra condition_not_met', function () {
    $promo = promoV2(['type' => 'coupon']);
    addCond($promo, 'min_order_value', '200000');
    addAction($promo, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('condition_not_met');
});

test('promotion engine khong tim thay ma tra not_found', function () {
    $r = PromotionEngine::resolveAll(['NOEXIST'.substr(uniqid(), -5)], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('not_found');
});

test('promotion engine specific_product khong khop tra condition_not_met', function () {
    $promo = promoV2(['type' => 'coupon']);
    addCond($promo, 'specific_product', '99999');
    addAction($promo, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('condition_not_met');
});

test('promotion engine ok tra promotions va total_discount', function () {
    $promo = promoV2(['type' => 'coupon']);
    addAction($promo, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'][0]['promotion']->id)->toBe($promo->id);
    expect($r['total_discount'])->toBe(10000.0);
});
