<?php

use App\Services\Promotions\PromotionCodeService;

test('coupon sinh ma so thu tu dung format prefix-001...', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'GIAM30', 'code_quantity' => 3, 'code_random' => false]);

    PromotionCodeService::generate($p);

    $codes = $p->codes()->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['GIAM30-001', 'GIAM30-002', 'GIAM30-003']);
});

test('voucher sinh ma ngau nhien khong trung, dung so luong, dung bang chu cai', function () {
    $p = promoV2(['type' => 'voucher', 'code' => null, 'code_prefix' => 'DK', 'code_quantity' => 200, 'code_random' => true]);

    PromotionCodeService::generate($p);

    $codes = $p->codes()->pluck('code')->all();
    expect(count($codes))->toBe(200);
    expect(count(array_unique($codes)))->toBe(200);
    foreach ($codes as $c) {
        expect(str_starts_with($c, 'DK'))->toBeTrue();
        expect(strlen($c))->toBe(8); // 'DK' + 6 ký tự random
    }
});

test('prefix da dung thi nem InvalidArgumentException', function () {
    $p1 = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'DUPX', 'code_quantity' => 1, 'code_random' => false]);
    PromotionCodeService::generate($p1);

    $p2 = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'DUPX', 'code_quantity' => 1, 'code_random' => false]);

    expect(fn () => PromotionCodeService::generate($p2))->toThrow(InvalidArgumentException::class);
});
