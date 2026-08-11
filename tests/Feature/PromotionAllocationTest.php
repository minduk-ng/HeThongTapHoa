<?php

use App\Models\InvoiceLine;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Collection;

function promoAllocLines(): Collection
{
    return collect([
        ['order_item_id' => 1, 'menu_item_id' => 101, 'quantity' => 1, 'subtotal' => 100000.0, 'category_id' => 1],
        ['order_item_id' => 2, 'menu_item_id' => 102, 'quantity' => 1, 'subtotal' => 300000.0, 'category_id' => 1],
    ]);
}

test('order scope tinh tong discount theo ty trong subtotal', function () {
    $promo = promoV2();
    addAction($promo, 'discount_percent', 10);

    $r = PromotionEngine::resolveAll([], promoAllocLines(), 400000.0);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(40000.0);
});

test('checkout phan bo discount xuong line theo ty trong, tong khop', function () {
    $admin = posAdmin();
    $promo = promoV2();
    addAction($promo, 'discount_percent', 10);
    $itemA = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $itemB = posMenuItem(['price' => 300000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [
        ['item' => $itemA, 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
        ['item' => $itemB, 'qty' => 1, 'price' => 300000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 360000,
    ])->assertOk();

    // 10% của 400000 = 40000, phân bổ 10000/30000, tổng khop
    $lines = InvoiceLine::orderBy('id')->get();
    expect($lines)->toHaveCount(2);
    expect((float) $lines[0]->discount_amount)->toBe(10000.0);
    expect((float) $lines[1]->discount_amount)->toBe(30000.0);
    expect((float) $lines->sum('discount_amount'))->toBe(40000.0);
    expect((float) $order->fresh()->discount_amount)->toBe(40000.0);
});

test('fixed amount vuot subtotal thi cap tong discount o subtotal', function () {
    $promo = promoV2();
    addAction($promo, 'discount_amount', 500000);

    $r = PromotionEngine::resolveAll([], promoAllocLines(), 400000.0);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(400000.0);
});
