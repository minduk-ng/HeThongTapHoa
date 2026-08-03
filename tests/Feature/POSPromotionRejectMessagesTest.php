<?php

use App\Models\Promotion;

test('validate-promotion tra the thong bao rieng do ly do khac nhau', function (array $attrs, string $message) {
    $promo = Promotion::create(array_merge([
        'code' => 'VLD'.substr(uniqid(), -5), 'name' => 'TL', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ], $attrs));

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 50000])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => $message]);
})->with([
    'tat ngung' => [['is_active' => false], 'Mã khuyến mãi đang tạm ngưng.'],
    'chua toi han' => [['starts_at' => now()->addDay()], 'Mã khuyến mãi chưa tới hạn áp dụng.'],
    'het han' => [['expires_at' => now()->subDay()], 'Mã khuyến mãi đã hết hạn.'],
    'het luot' => [['max_uses' => 1, 'used_count' => 1], 'Mã khuyến mãi đã hết lượt sử dụng.'],
    'duoi min' => [['min_order_amount' => 200000], 'Đơn hàng chưa đạt giá trị tối thiểu.'],
]);

test('validate-promotion ma khong ton tai tra loi ro rang', function () {
    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => 'NOEXIST'.substr(uniqid(), -5), 'subtotal' => 50000])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => 'Mã khuyến mãi không tồn tại.']);
});

test('validate-promotion khong co dong khop target tra loi ro rang', function () {
    $cat = App\Models\MenuCategory::create(['name' => 'Cat N'.substr(uniqid(), -5), 'sort_order' => 1]);
    $promo = Promotion::create([
        'code' => 'CAT'.substr(uniqid(), -5), 'name' => 'Cat scope', 'discount_type' => 'percentage',
        'discount_value' => 10, 'target_type' => 'category', 'target_value' => $cat->id,
    ]);
    $other = posMenuItem(); // khac danh muc

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', [
            'code' => $promo->code, 'subtotal' => 50000,
            'items' => [['menu_item_id' => $other->id, 'quantity' => 1, 'unit_price' => 50000]],
        ])
        ->assertStatus(422)
        ->assertJson(['ok' => false, 'error' => 'Không có món trong đơn thuộc đối tượng áp dụng.']);
});

test('validate-promotion ma hop le giam 0 dong van ok true (phuc vu frontend)', function () {
    $promo = Promotion::create([
        'code' => 'ZERO'.substr(uniqid(), -5), 'name' => '0d', 'discount_type' => 'percentage',
        'discount_value' => 0, 'is_active' => true,
    ]);
    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 50000])
        ->assertOk()->assertJson(['ok' => true, 'discount_amount' => 0]);
});
