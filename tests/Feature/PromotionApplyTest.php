<?php

use App\Models\Promotion;

function makePromotion(array $attrs = []): Promotion
{
    return Promotion::create(array_merge([
        'code' => 'VLD'.substr(uniqid(), -6),
        'name' => 'Test KM',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'is_active' => true,
    ], $attrs));
}

test('validate-promotion tính đúng percentage, cap và fixed amount', function () {
    $percentage = makePromotion(['discount_value' => 10]);
    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $percentage->code,
        'subtotal' => 200000,
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 20000, 'total' => 180000]);

    $capped = makePromotion(['discount_value' => 10, 'max_discount_amount' => 15000]);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $capped->code,
        'subtotal' => 200000,
    ])->assertOk()->assertJson(['discount_amount' => 15000, 'total' => 185000]);

    $fixed = makePromotion(['discount_type' => 'fixed_amount', 'discount_value' => 300000]);
    $this->postJson('/staff/pos/validate-promotion', [
        'code' => $fixed->code,
        'subtotal' => 200000,
    ])->assertOk()->assertJson(['discount_amount' => 200000, 'total' => 0]);
});

test('validate-promotion từ chối mã không tồn tại, hết hạn, chưa tới hạn, hết lượt, dưới min hoặc vô hiệu', function (array $attrs, ?string $code = null) {
    $promo = $code ? null : makePromotion($attrs);
    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $code ?? $promo->code,
        'subtotal' => 200000,
    ])->assertStatus(422)->assertJson(['ok' => false]);
})->with([
    'không tồn tại' => [[], 'KHONGCO'],
    'hết hạn' => [['expires_at' => now()->subDay()]],
    'chưa tới hạn' => [['starts_at' => now()->addDay()]],
    'hết lượt' => [['max_uses' => 1, 'used_count' => 1]],
    'dưới min' => [['min_order_amount' => 500000]],
    'vô hiệu' => [['is_active' => false]],
]);
