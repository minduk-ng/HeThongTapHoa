<?php

use App\Models\Promotion;
use App\Models\PromotionAction;
use App\Models\PromotionCondition;
use App\Services\Promotions\PromotionEngine;

function promoV2(array $attrs = []): Promotion
{
    return Promotion::create(array_merge([
        'name' => 'Promo '.uniqid(),
        'type' => 'promotion',
        'code' => null,
        'status' => true,
        'max_usage' => null,
        'used_count' => 0,
        'exclusive' => false,
        'stackable' => true,
    ], $attrs));
}

function addCond(Promotion $p, string $type, string $value): PromotionCondition
{
    return $p->conditions()->create(['cond_type' => $type, 'cond_value' => $value]);
}

function addAction(Promotion $p, string $type, float $value, ?float $max = null): PromotionAction
{
    return $p->actions()->create([
        'action_type' => $type, 'action_value' => $value, 'max_discount_amount' => $max,
    ]);
}

function linesV2(): \Illuminate\Support\Collection
{
    return collect([
        ['order_item_id' => 1, 'menu_item_id' => 10, 'quantity' => 2, 'subtotal' => 100000, 'category_id' => 3],
        ['order_item_id' => 2, 'menu_item_id' => 11, 'quantity' => 1, 'subtotal' => 50000, 'category_id' => 4],
    ]);
}

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
    $p1 = promoV2(); addAction($p1, 'discount_amount', 5000);
    $p2 = promoV2(); addAction($p2, 'discount_amount', 20000);
    $p3 = promoV2(); addAction($p3, 'discount_amount', 10000);

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

