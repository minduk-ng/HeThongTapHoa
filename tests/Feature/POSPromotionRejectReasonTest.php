<?php

use App\Models\MenuCategory;
use App\Models\Promotion;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Collection;

function posRejectReasonLines(): Collection
{
    // danh mục mặc định: không thuộc target category → phục vụ case no_eligible_line
    return collect([[
        'order_item_id' => 1,
        'menu_item_id' => null,
        'subtotal' => 100000.0,
        'category_id' => null,
    ]]);
}

test('promotion engine tra cac ly do tu choi rieng biet', function (array $attrs, string $expectReason) {
    $promo = Promotion::create(array_merge([
        'code' => 'RRR'.substr(uniqid(), -5), 'name' => 'RR', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ], $attrs));

    $r = PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);

    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe($expectReason);
})->with([
    'khong hoat dong' => [['is_active' => false], 'inactive'],
    'chua toi han' => [['starts_at' => now()->addDay()], 'not_started'],
    'het han' => [['expires_at' => now()->subDay()], 'expired'],
    'het luot' => [['max_uses' => 1, 'used_count' => 1], 'out_of_uses'],
    'duoi min' => [['min_order_amount' => 200000], 'below_min'],
]);

test('promotion engine khong tim thay ma tra not_found', function () {
    $r = PromotionEngine::resolveAll(['NOEXIST'.substr(uniqid(), -5)], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('not_found');
});

test('promotion engine khong co dong khop target tra no_eligible_line', function () {
    $category = MenuCategory::create(['name' => 'Cat RRR '.uniqid(), 'sort_order' => 1]);
    $promo = Promotion::create([
        'code' => 'RRC'.substr(uniqid(), -5), 'name' => 'RRC', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
        'target_type' => 'category', 'target_value' => $category->id,
    ]);
    $lines = collect([['order_item_id' => 1, 'menu_item_id' => null, 'subtotal' => 100000.0, 'category_id' => 99999]]);

    $r = PromotionEngine::resolveAll([$promo->code], $lines, 100000.0);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('no_eligible_line');
});

test('promotion engine ok tra promotions va total_discount', function () {
    $promo = Promotion::create([
        'code' => 'OKR'.substr(uniqid(), -5), 'name' => 'OK', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ]);
    $r = PromotionEngine::resolveAll([$promo->code], posRejectReasonLines(), 100000.0);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'][0]['promotion']->id)->toBe($promo->id);
    expect($r['total_discount'])->toBe(10000.0);
});
