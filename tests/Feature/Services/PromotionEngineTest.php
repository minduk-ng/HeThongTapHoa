<?php

use App\Models\PromotionTimeSlot;
use App\Services\Promotions\PromotionCodeService;
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

test('resolveAll voi preferredAutoId = 0: chủ động không áp dụng auto promotion dù có promotion khop', function () {
    $p = promoV2();
    addAction($p, 'discount_amount', 20000);

    // Có auto promotion khớp nhưng preferredAutoId = 0 → bỏ qua auto
    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, 0);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toBeEmpty();
    expect($r['total_discount'])->toBe(0.0);
});

test('resolveAll preferredAutoId la numeric-string: van chon dung promotion (cast int)', function () {
    $p = promoV2();
    addAction($p, 'discount_amount', 5000);

    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, (string) $p->id);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toHaveCount(1);
    expect($r['promotions'][0]['promotion']->id)->toBe($p->id);
});

test('resolveAll preferredAutoId la promotion het luot: khong ap auto, khong reject', function () {
    $p = promoV2(['max_usage' => 1, 'used_count' => 1]);
    addAction($p, 'discount_amount', 20000);

    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, $p->id);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toBeEmpty();
    expect($r['total_discount'])->toBe(0.0);
});

test('resolveAll preferredAutoId la promotion het han: khong ap auto, khong reject', function () {
    $p = promoV2();
    addAction($p, 'discount_amount', 20000);
    $p->update(['end_date' => now()->subDay()]);

    $r = PromotionEngine::resolveAll([], engineLines(100000), 100000, false, $p->id);
    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toBeEmpty();
    expect($r['total_discount'])->toBe(0.0);
});

test('resolveAll: ma con chua dung thi ok', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'ENG1', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    PromotionCodeService::generate($p);
    $code = $p->codes()->first()->code;

    $r = PromotionEngine::resolveAll([$code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});

test('resolveAll: ma con da dung tra already_used', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'ENG2', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    PromotionCodeService::generate($p);
    $pc = $p->codes()->first();
    $pc->update(['status' => 'used', 'used_at' => now()]);

    $r = PromotionEngine::resolveAll([$pc->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('already_used');
});

test('resolveAll: 2 ma con cung campaign chi ap 1 lan, chi tieu 1 ma', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'DEDUPE', 'code_quantity' => 2, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    PromotionCodeService::generate($p);
    $codes = $p->codes()->pluck('code')->all();
    expect(count($codes))->toBe(2);

    $r = PromotionEngine::resolveAll($codes, engineLines(100000), 100000, true);

    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toHaveCount(1); // không double discount
    expect($r['promotions'][0]['promotion']->id)->toBe($p->id);
    expect($r['promotions'][0]['code'])->toBe($codes[0]);
    expect($r['total_discount'])->toBe(5000.0);

    // Chỉ 1 mã con được đánh dấu used, mã còn lại vẫn unused
    expect($p->codes()->where('status', 'used')->count())->toBe(1);
    expect($p->codes()->where('status', 'unused')->count())->toBe(1);
    $p->refresh();
    expect($p->used_count)->toBe(1);
});

test('resolveAll: ma le cu van hoạt động (backward compat)', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});

test('resolveAll lockForUpdate: ma con duoc danh dau used khi checkout', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'ENG3', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    PromotionCodeService::generate($p);
    $pc = $p->codes()->first();

    $r = PromotionEngine::resolveAll([$pc->code], engineLines(100000), 100000, true);

    expect($r['status'])->toBe('ok');
    $pc->refresh();
    expect($pc->status)->toBe('used');
    expect($pc->used_at)->not->toBeNull();

    // Dùng lại → already_used
    $r2 = PromotionEngine::resolveAll([$pc->code], engineLines(100000), 100000);
    expect($r2['status'])->toBe('rejected');
    expect($r2['reason'])->toBe('already_used');
});

test('resolveAll: khong trong khung gio vang thi khong ap dung', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);
    // Slot ở NGÀY KHÁC (ngày hôm nay + 3) → luôn không khớp thứ
    $otherDow = (((int) now()->dayOfWeek) + 3) % 7;
    PromotionTimeSlot::create([
        'promotion_id' => $p->id,
        'day_of_week' => $otherDow,
        'start_time' => '00:00',
        'end_time' => '23:59',
    ]);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('rejected');
    expect($r['reason'])->toBe('out_of_slot');
});

test('resolveAll: trong khung gio vang thi ap dung', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);
    // Slot ngày hôm nay, khung rất rộng 00:00–23:59 → luôn khớp
    $dow = (int) now()->dayOfWeek;
    PromotionTimeSlot::create([
        'promotion_id' => $p->id,
        'day_of_week' => $dow,
        'start_time' => '00:00',
        'end_time' => '23:59',
    ]);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});

test('resolveAll: campaign khong co time slot van ap dung binh thuong (backward compat)', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});
