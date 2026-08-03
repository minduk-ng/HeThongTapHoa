<?php

use App\Models\MenuCategory;
use App\Models\Promotion;
use App\Http\Controllers\Staff\POSController;

function posRejectReasonLines(): \Illuminate\Support\Collection
{
    // danh mục mặc định: không thuộc target category → phục vụ case no_eligible_line
    return collect([[
        'order_item_id' => 1,
        'menu_item_id' => null,
        'subtotal' => 100000.0,
        'category_id' => null,
    ]]);
}

test('resolvePromotion tra cac ly do tu choi rieng biet', function (array $attrs, string $expectReason) {
    $promo = Promotion::create(array_merge([
        'code' => 'RRR'.substr(uniqid(), -5), 'name' => 'RR', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ], $attrs));

    $controller = resolve(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);

    $result = $reflection->invoke($controller, $promo->code, posRejectReasonLines(), 100000.0, false);

    expect($result['status'])->toBe('rejected');
    expect($result['reason'])->toBe($expectReason);
})->with([
    'khong hoat dong' => [['is_active' => false], 'inactive'],
    'chua toi han' => [['starts_at' => now()->addDay()], 'not_started'],
    'het han' => [['expires_at' => now()->subDay()], 'expired'],
    'het luot' => [['max_uses' => 1, 'used_count' => 1], 'out_of_uses'],
    'duoi min' => [['min_order_amount' => 200000], 'below_min'],
]);

test('resolve_promotion khong tim thay ma tra not_found', function () {
    $controller = app(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);

    $result = $reflection->invoke($controller, 'NOEXIST'.substr(uniqid(), -5), posRejectReasonLines(), 100000.0, false);

    expect($result['status'])->toBe('rejected');
    expect($result['reason'])->toBe('not_found');
});

test('resolve_promotion khong co dong khop target tra no_eligible_line', function () {
    $category = MenuCategory::create(['name' => 'Cat RRR '.uniqid(), 'sort_order' => 1]);
    $promo = Promotion::create([
        'code' => 'RRC'.substr(uniqid(), -5), 'name' => 'RRC', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
        'target_type' => 'category', 'target_value' => $category->id,
    ]);

    // lines không thuộc category target → targetSubtotal = 0
    $lines = collect([[
        'order_item_id' => 1, 'menu_item_id' => null, 'subtotal' => 100000.0, 'category_id' => 99999,
    ]]);

    $controller = app(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);
    $result = $reflection->invoke($controller, $promo->code, $lines, 100000.0, false);

    expect($result['status'])->toBe('rejected');
    expect($result['reason'])->toBe('no_eligible_line');
});

test('resolve_promotion ok tra status ok, promotion va discount_amount', function () {
    $promo = Promotion::create([
        'code' => 'OKR'.substr(uniqid(), -5), 'name' => 'OK', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ]);

    $controller = app(POSController::class);
    $reflection = new ReflectionMethod($controller, 'resolvePromotion');
    $reflection->setAccessible(true);
    $result = $reflection->invoke($controller, $promo->code, posRejectReasonLines(), 100000.0, false);

    expect($result['status'])->toBe('ok');
    expect($result['promotion']->id)->toBe($promo->id);
    expect($result['discount_amount'])->toBe(10000.0);
});
