<?php

use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Collection;

function engineLines(float $subtotal = 100000): Collection
{
    return collect([['order_item_id' => null, 'menu_item_id' => null, 'quantity' => 1, 'subtotal' => $subtotal, 'category_id' => null]]);
}

test('resolveAll stack 2 ma: ma sau tinh tren phan con lai', function () {
    $p1 = promoV2(['type' => 'coupon', 'code' => 'STK1'.substr(uniqid(), -4)]);
    addAction($p1, 'discount_percent', 10);
    $p2 = promoV2(['type' => 'coupon', 'code' => 'STK2'.substr(uniqid(), -4)]);
    addAction($p2, 'discount_amount', 20000);

    $r = PromotionEngine::resolveAll([$p1->code, $p2->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toHaveCount(2);
    // ma 1: 100k * 10% = 10k -> con 90k; ma 2: min(20k, 90k) = 20k
    expect($r['promotions'][0]['amount'])->toBe(10000.0);
    expect($r['promotions'][1]['amount'])->toBe(20000.0);
    expect($r['total_discount'])->toBe(30000.0);
});

test('resolveAll cap tong discount khong vuot subtotal', function () {
    $p1 = promoV2(['type' => 'coupon', 'code' => 'STK3'.substr(uniqid(), -4)]);
    addAction($p1, 'discount_percent', 90);
    $p2 = promoV2(['type' => 'coupon', 'code' => 'STK4'.substr(uniqid(), -4)]);
    addAction($p2, 'discount_amount', 50000);

    $r = PromotionEngine::resolveAll([$p1->code, $p2->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(100000.0); // 90k + min(50k,10k)=10k
});

test('resolveAll ma reject tra rejected, khong pha stack', function () {
    $p1 = promoV2(['type' => 'coupon', 'max_usage' => 1, 'used_count' => 1]);
    addAction($p1, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([$p1->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('out_of_uses');
    expect($r['code'])->toBe($p1->code);
});

test('resolveAll ma khong ton tai', function () {
    $r = PromotionEngine::resolveAll(['NOEXIST'.substr(uniqid(), -4)], engineLines(), 100000);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('not_found');
});

test('resolveAll 1 ma dung (compat voi prom single)', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(10000.0);
});

test('resolveAll dieu kien khong tho tra condition_not_met', function () {
    $p = promoV2(['type' => 'coupon']);
    addCond($p, 'min_order_value', '200000');
    addAction($p, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('condition_not_met');
});

test('resolveAll voi preferredAutoId: chon dung promotion chi dinh, khong chon tot nhat', function () {
    $pSmall = promoV2();
    addAction($pSmall, 'discount_amount', 5000);
    $pBig = promoV2();
    addAction($pBig, 'discount_amount', 20000);

    // Không truyền preferred → chọn tốt nhất (pBig)
    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000);
    expect($r['promotions'])->toHaveCount(1);
    expect($r['promotions'][0]['promotion']->id)->toBe($pBig->id);

    // Truyền pSmall → chọn pSmall dù discount thấp hơn
    $r2 = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, $pSmall->id);
    expect($r2['promotions'])->toHaveCount(1);
    expect($r2['promotions'][0]['promotion']->id)->toBe($pSmall->id);
    expect($r2['total_discount'])->toBe(5000.0);
});

test('resolveAll voi preferredAutoId khong thoa dieu kien: khong ap auto, khong reject', function () {
    $p = promoV2();
    addCond($p, 'min_order_value', '999999');
    addAction($p, 'discount_amount', 20000);

    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, $p->id);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toBeEmpty();
    expect($r['total_discount'])->toBe(0.0);
});
