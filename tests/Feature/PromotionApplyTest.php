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

test('validate-promotion item scope tinh discount theo subtotal cua mon do', function () {
    $cat = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'price' => 300000]);
    $promo = makePromotion(['discount_value' => 10, 'target_type' => 'item', 'target_value' => $itemA->id]);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 400000,
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 100000],
            ['menu_item_id' => $itemB->id, 'quantity' => 1, 'unit_price' => 300000],
        ],
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 10000, 'total' => 390000]);
});

test('validate-promotion category scope tinh discount theo tong subtotal cua danh muc', function () {
    $cat1 = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $cat2 = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 2]);
    $itemA = posMenuItem(['category_id' => $cat1->id, 'price' => 100000]);
    $itemB = posMenuItem(['category_id' => $cat1->id, 'price' => 300000]);
    $itemC = posMenuItem(['category_id' => $cat2->id, 'price' => 500000]);
    $promo = makePromotion(['discount_value' => 10, 'target_type' => 'category', 'target_value' => $cat1->id]);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 900000,
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 100000],
            ['menu_item_id' => $itemB->id, 'quantity' => 1, 'unit_price' => 300000],
            ['menu_item_id' => $itemC->id, 'quantity' => 1, 'unit_price' => 500000],
        ],
    ])->assertOk()->assertJson(['ok' => true, 'discount_amount' => 40000, 'total' => 860000]);
});

test('validate-promotion tu choi khi item/category scope khong co dong khop trong gio', function () {
    $cat = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $promo = makePromotion(['discount_value' => 10, 'target_type' => 'item', 'target_value' => 999999]);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 100000,
        'items' => [['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 100000]],
    ])->assertStatus(422)->assertJson(['ok' => false]);
});

test('validate-promotion min_order_amount kiem tra tong don khong phai subtotal muc tieu', function () {
    $cat = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $cat->id, 'price' => 100000]);
    $itemB = posMenuItem(['category_id' => $cat->id, 'price' => 300000]);
    $promo = makePromotion(['discount_value' => 10, 'min_order_amount' => 300000, 'target_type' => 'item', 'target_value' => $itemA->id]);

    $this->actingAs(posStaff())->postJson('/staff/pos/validate-promotion', [
        'code' => $promo->code,
        'subtotal' => 400000,
        'items' => [
            ['menu_item_id' => $itemA->id, 'quantity' => 1, 'unit_price' => 100000],
            ['menu_item_id' => $itemB->id, 'quantity' => 1, 'unit_price' => 300000],
        ],
    ])->assertOk()->assertJson(['discount_amount' => 10000]);
});
