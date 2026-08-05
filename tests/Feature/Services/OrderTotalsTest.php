<?php

use App\Services\Checkout\OrderTotals;

test('vatInPrice tinh phan vat chua trong gia, net + vat = subtotal', function (float $subtotal, float $rate, float $expectNet, float $expectVat) {
    $net = OrderTotals::netOf($subtotal, $rate);
    $vat = OrderTotals::vatInPrice($subtotal, $rate);
    expect($net)->toBe($expectNet);
    expect($vat)->toBe($expectVat);
    expect($net + $vat)->toBe($subtotal);
})->with([
    [50000.0, 10.0, 45454.0, 4546.0],
    [100000.0, 0.0, 100000.0, 0.0],
    [33000.0, 8.0, 30555.0, 2445.0],
]);

test('preview gom subtotal va vat tu items', function () {
    $category = \App\Models\MenuCategory::firstOrCreate(['name' => 'Cat T'], ['sort_order' => 1]);
    $itemA = posMenuItem(['category_id' => $category->id, 'price' => 50000, 'vat_rate' => 10]);
    $itemB = posMenuItem(['category_id' => $category->id, 'price' => 33000, 'vat_rate' => 0]);
    $order = posOrder(posTable(), [
        ['item' => $itemA, 'qty' => 2, 'price' => 50000],
        ['item' => $itemB, 'qty' => 1, 'price' => 33000],
    ]);

    $p = OrderTotals::preview($order->items()->where('status', '!=', 'cancelled')->get());
    expect($p['subtotal'])->toBe(133000.0);
    // vat chi tu itemA: 2 * 50000, net=floor(100000/1.1)=90909, vat=9091
    expect($p['vat_amount'])->toBe(9091.0);
});

test('preview bo qua mon da huy', function () {
    $itemA = posMenuItem(['price' => 50000, 'vat_rate' => 10]);
    $order = posOrder(posTable(), [
        ['item' => $itemA, 'qty' => 1, 'price' => 50000],
        ['item' => $itemA, 'qty' => 3, 'price' => 50000, 'status' => 'cancelled'],
    ]);
    $p = OrderTotals::preview($order->items()->where('status', '!=', 'cancelled')->get());
    expect($p['subtotal'])->toBe(50000.0);
});
