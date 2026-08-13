<?php

use App\Models\PromotionTimeSlot;
use App\Services\Promotions\PromotionCodeService;

test('available-promotions tra danh sach promotion type=promotion khop dieu kien + estimated_discount', function () {
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'discount_percent', 10);
    $coupon = promoV2(['type' => 'coupon', 'code' => 'AV1'.substr(uniqid(), -4)]);
    addAction($coupon, 'discount_amount', 5000);

    $item = posMenuItem(['price' => 100000]);
    $res = $this->actingAs(posStaff())->postJson('/staff/pos/available-promotions', [
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ]);

    $res->assertOk();
    $data = $res->json();
    expect($data['ok'])->toBeTrue();
    $ids = array_column($data['promotions'], 'id');
    expect($ids)->toContain($p->id);
    expect($ids)->not->toContain($coupon->id); // coupon không nằm trong danh sách auto
});

test('available-promotions khong increment used_count', function () {
    $p = promoV2(['type' => 'promotion', 'max_usage' => 5]);
    addAction($p, 'discount_percent', 10);
    $item = posMenuItem(['price' => 100000]);

    $this->actingAs(posStaff())->postJson('/staff/pos/available-promotions', [
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ])->assertOk();

    expect($p->fresh()->used_count)->toBe(0);
});

test('validate-promotion nhan selected_promotion_id: tra discount dung promotion da chon', function () {
    $pBig = promoV2(['type' => 'promotion']);
    addAction($pBig, 'discount_amount', 20000);
    $pSmall = promoV2(['type' => 'promotion']);
    addAction($pSmall, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 100000]);

    $res = $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => null,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        'selected_promotion_id' => $pSmall->id,
    ])->assertOk();

    expect($res->json('discount_amount'))->toEqual(5000.0);
});

test('validate-promotion tra child code cho ma con', function () {
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'VP1', 'code_quantity' => 1, 'code_random' => false]);
    addAction($p, 'discount_amount', 5000);
    PromotionCodeService::generate($p);
    $code = $p->codes()->first()->code;

    $item = posMenuItem(['price' => 100000]);
    $res = $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $code,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ])->assertOk();

    $promotions = $res->json('promotions');
    expect($promotions)->toHaveCount(1);
    expect($promotions[0]['code'])->toBe($code);
    expect($res->json('discount_amount'))->toEqual(5000.0);
});

test('validate-promotion selected_promotion_id = 0: khong ap auto promotion, discount 0', function () {
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'discount_amount', 20000);
    $item = posMenuItem(['price' => 100000]);

    $res = $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => null,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
        'selected_promotion_id' => 0,
    ])->assertOk();

    expect($res->json('discount_amount'))->toEqual(0);
    expect($res->json('promotions'))->toBeEmpty();
});

test('validate-promotion code ngoai khung gio vang tra 422 out_of_slot', function () {
    $p = promoV2(['type' => 'coupon', 'code' => 'SLOT'.substr(uniqid(), -4)]);
    addAction($p, 'discount_amount', 5000);
    // Slot ở NGÀY KHÁC (ngày hôm nay + 3) → luôn không khớp thứ
    $otherDow = (((int) now()->dayOfWeek) + 3) % 7;
    PromotionTimeSlot::create([
        'promotion_id' => $p->id,
        'day_of_week' => $otherDow,
        'start_time' => '00:00',
        'end_time' => '23:59',
    ]);
    $item = posMenuItem(['price' => 100000]);

    $res = $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $p->code,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ]);

    $res->assertStatus(422);
    expect($res->json('error'))->toBe('Mã chỉ áp dụng trong khung giờ đã đăng ký.');
});
