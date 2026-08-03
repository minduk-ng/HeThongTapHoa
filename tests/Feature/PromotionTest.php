<?php

use App\Models\Promotion;

test('promotion model lưu đủ trường và cast đúng kiểu', function () {
    $promo = Promotion::create([
        'code' => 'KMA10',
        'name' => 'Khuyến mãi 10%',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'min_order_amount' => 100000,
        'max_discount_amount' => 50000,
        'max_uses' => 100,
        'is_active' => true,
    ]);

    $fresh = $promo->fresh();
    expect($fresh->code)->toBe('KMA10');
    expect($fresh->discount_value)->toBeFloat();
    expect((float) $fresh->min_order_amount)->toBe(100000.0);
    expect($fresh->is_active)->toBeTrue();
});
