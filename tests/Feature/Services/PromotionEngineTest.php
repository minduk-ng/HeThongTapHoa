<?php

use App\Models\Promotion;
use App\Services\Promotions\PromotionEngine;

function engineLines(float $subtotal = 100000): \Illuminate\Support\Collection
{
    return collect([['order_item_id' => null, 'menu_item_id' => null, 'subtotal' => $subtotal, 'category_id' => null]]);
}

test('resolveAll stack 2 ma: ma sau tinh tren phan con lai', function () {
    $p1 = Promotion::create(['code' => 'STK1'.substr(uniqid(),-4), 'name' => '10%', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true]);
    $p2 = Promotion::create(['code' => 'STK2'.substr(uniqid(),-4), 'name' => '20k', 'discount_type' => 'fixed_amount', 'discount_value' => 20000, 'is_active' => true]);

    $r = PromotionEngine::resolveAll([$p1->code, $p2->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toHaveCount(2);
    // ma 1: 100k * 10% = 10k -> con 90k; ma 2: min(20k, 90k) = 20k
    expect($r['promotions'][0]['amount'])->toBe(10000.0);
    expect($r['promotions'][1]['amount'])->toBe(20000.0);
    expect($r['total_discount'])->toBe(30000.0);
});

test('resolveAll cap tong discount khong vuot subtotal', function () {
    $p1 = Promotion::create(['code' => 'STK3'.substr(uniqid(),-4), 'name' => '90%', 'discount_type' => 'percentage', 'discount_value' => 90, 'is_active' => true]);
    $p2 = Promotion::create(['code' => 'STK4'.substr(uniqid(),-4), 'name' => '50k', 'discount_type' => 'fixed_amount', 'discount_value' => 50000, 'is_active' => true]);

    $r = PromotionEngine::resolveAll([$p1->code, $p2->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(100000.0); // 90k + min(50k,10k)=10k
});

test('resolveAll ma reject tra rejected, khong pha stack', function () {
    $p1 = Promotion::create(['code' => 'STK5'.substr(uniqid(),-4), 'name' => 'x', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true, 'max_uses' => 1, 'used_count' => 1]);

    $r = PromotionEngine::resolveAll([$p1->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('out_of_uses');
    expect($r['code'])->toBe($p1->code);
});

test('resolveAll ma khong ton tai', function () {
    $r = PromotionEngine::resolveAll(['NOEXIST'.substr(uniqid(),-4)], engineLines(), 100000);
    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('not_found');
});

test('resolveAll 1 ma dung (compat voi prom single)', function () {
    $p = Promotion::create(['code' => 'STK6'.substr(uniqid(),-4), 'name' => '10%', 'discount_type' => 'percentage', 'discount_value' => 10, 'is_active' => true]);
    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);
    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(10000.0);
});
