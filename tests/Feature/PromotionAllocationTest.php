<?php

use App\Models\Promotion;

function promoLine(int $orderItemId, int $menuItemId, float $subtotal, ?int $categoryId = null): array
{
    return [
        'order_item_id' => $orderItemId,
        'menu_item_id' => $menuItemId,
        'subtotal' => $subtotal,
        'category_id' => $categoryId,
    ];
}

test('order scope phan bo theo ty trong, mon cuoi nhan phan du, tong khop 100%', function () {
    $promo = Promotion::create([
        'code' => 'ORD', 'name' => 'Toan don', 'discount_type' => 'percentage',
        'discount_value' => 10, 'target_type' => 'order',
    ]);
    $lines = collect([
        promoLine(1, 101, 100000, 1),
        promoLine(2, 102, 300000, 1),
    ]);
    $alloc = Promotion::allocateLineDiscounts($promo, $lines, 40000);

    expect($alloc[1])->toBe(10000.0);
    expect($alloc[2])->toBe(30000.0);
    expect(array_sum($alloc))->toBe(40000.0);
});

test('order scope lam tron truoc, mon cuoi nhan phan du de tong khop', function () {
    $promo = Promotion::create([
        'code' => 'ORD2', 'name' => 'Toan don 2', 'discount_type' => 'fixed_amount',
        'discount_value' => 100, 'target_type' => 'order',
    ]);
    $lines = collect([
        promoLine(1, 101, 100000, 1),
        promoLine(2, 102, 100000, 1),
        promoLine(3, 103, 100000, 1),
    ]);
    $alloc = Promotion::allocateLineDiscounts($promo, $lines, 50000);

    expect(array_sum($alloc))->toBe(50000.0);
    expect($alloc[1])->toBe(16666.0);
    expect($alloc[2])->toBe(16666.0);
    expect($alloc[3])->toBe((float) (50000 - 16666 - 16666));
});

test('item scope do het discount vao dong khop, cap theo subtotal', function () {
    $promo = Promotion::create([
        'code' => 'ITEM', 'name' => '1 mon', 'discount_type' => 'fixed_amount',
        'discount_value' => 20000, 'target_type' => 'item', 'target_value' => 102,
    ]);
    $lines = collect([
        promoLine(1, 101, 100000, 1),
        promoLine(2, 102, 30000, 1),
    ]);
    $alloc = Promotion::allocateLineDiscounts($promo, $lines, 20000);

    expect($alloc[1])->toBe(0.0);
    expect($alloc[2])->toBe(20000.0);
});

test('item scope khong co dong khop thi khong ai nhan', function () {
    $promo = Promotion::create([
        'code' => 'ITEM2', 'name' => '1 mon xa', 'discount_type' => 'percentage',
        'discount_value' => 10, 'target_type' => 'item', 'target_value' => 999,
    ]);
    $lines = collect([promoLine(1, 101, 100000, 1)]);
    $alloc = Promotion::allocateLineDiscounts($promo, $lines, 10000);

    expect($alloc[1])->toBe(0.0);
});

test('category scope chi phan bo cho cac dong thuoc category, phan du roi vao dong cuoi', function () {
    $promo = Promotion::create([
        'code' => 'CAT', 'name' => 'Danh muc', 'discount_type' => 'fixed_amount',
        'discount_value' => 100, 'target_type' => 'category', 'target_value' => 1,
    ]);
    $lines = collect([
        promoLine(1, 101, 100000, 1),
        promoLine(2, 102, 300000, 1),
        promoLine(3, 103, 500000, 2),
    ]);
    $alloc = Promotion::allocateLineDiscounts($promo, $lines, 40000);

    expect($alloc[1])->toBe(10000.0);
    expect($alloc[2])->toBe(30000.0);
    expect($alloc[3])->toBe(0.0);
    expect(array_sum($alloc))->toBe(40000.0);
});

test('discount_amount bang 0 tra ve toan 0', function () {
    $promo = Promotion::create([
        'code' => 'ZERO', 'name' => 'Khong giam', 'discount_type' => 'percentage',
        'discount_value' => 0, 'target_type' => 'order',
    ]);
    $alloc = Promotion::allocateLineDiscounts($promo, collect([promoLine(1, 101, 100000, 1)]), 0);
    expect($alloc[1])->toBe(0.0);
});

test('target_subtotal tinh dung theo scope', function () {
    $orderPromo = Promotion::create(['code' => 'TSO', 'name' => 'T', 'discount_type' => 'percentage', 'discount_value' => 10, 'target_type' => 'order']);
    $catPromo = Promotion::create(['code' => 'TSC', 'name' => 'T', 'discount_type' => 'percentage', 'discount_value' => 10, 'target_type' => 'category', 'target_value' => 2]);
    $lines = collect([
        promoLine(1, 101, 100000, 1),
        promoLine(2, 102, 300000, 2),
    ]);

    expect(Promotion::targetSubtotal($orderPromo, $lines))->toBe(400000.0);
    expect(Promotion::targetSubtotal($catPromo, $lines))->toBe(300000.0);
});
