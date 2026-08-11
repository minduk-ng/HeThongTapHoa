<?php

use App\Models\Promotion;

test('delete qua destroy la soft delete, ban ghi con trong DB', function () {
    $admin = posAdmin();
    $promo = promoV2(['type' => 'coupon', 'code' => 'SD'.substr(uniqid(), -6)]);
    addAction($promo, 'discount_amount', 1000);

    $this->actingAs($admin)->delete("/manager/promotions/{$promo->id}", ['password' => 'password123'])
        ->assertSessionHasNoErrors();

    expect(Promotion::find($promo->id))->toBeNull();
    expect(Promotion::withTrashed()->find($promo->id)->deleted_at)->not->toBeNull();
});

test('resolvePromotion khong tra ve promotion da soft delete', function () {
    $promo = promoV2(['type' => 'coupon', 'code' => 'GONE'.substr(uniqid(), -6)]);
    addAction($promo, 'discount_percent', 10);
    $promo->delete();

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 100000])
        ->assertStatus(422)->assertJson(['ok' => false, 'error' => 'Mã khuyến mãi không tồn tại.']);
});
