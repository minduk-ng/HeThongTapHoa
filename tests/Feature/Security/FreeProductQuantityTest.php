<?php

use App\Models\InvoiceLine;
use App\Services\Promotions\PromotionEngine;

test('engine: free_product action discounts only 1 unit even when quantity is 5', function () {
    $giftItem = posMenuItem(['price' => 20000]);
    $paidItem = posMenuItem(['price' => 50000]);

    $p = promoV2(['type' => 'coupon', 'code' => 'FREE1UNIT']);
    addAction($p, 'free_product', $giftItem->id);

    $lines = collect([
        ['order_item_id' => 1, 'menu_item_id' => $giftItem->id, 'quantity' => 5, 'subtotal' => 100000, 'category_id' => null],
        ['order_item_id' => 2, 'menu_item_id' => $paidItem->id, 'quantity' => 1, 'subtotal' => 50000, 'category_id' => null],
    ]);

    $res = PromotionEngine::resolveAll(['FREE1UNIT'], $lines, 150000);

    expect($res['status'])->toBe('ok');
    expect($res['total_discount'])->toBe(20000.0);
    expect($res['free_items'])->toBe([
        ['menu_item_id' => $giftItem->id, 'quantity' => 1],
    ]);
    expect($res['promotions'][0]['amount'])->toBe(20000.0);
});

test('checkout: cart with qty 5 gift item discounts only 1 unit and keeps invoice line totals consistent', function () {
    $admin = posAdmin();
    $giftItem = posMenuItem(['price' => 20000, 'vat_rate' => 10]);
    $paidItem = posMenuItem(['price' => 50000, 'vat_rate' => 10]);

    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'free_product', (float) $giftItem->id);

    $table = posTable();
    $order = posOrder($table, [
        ['item' => $giftItem, 'qty' => 5, 'price' => 20000, 'status' => 'completed'],
        ['item' => $paidItem, 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 130000,
    ])->assertOk();

    $order->refresh();
    $invoice = $order->invoice;

    expect((float) $invoice->subtotal_amount)->toBe(150000.0);
    expect((float) $invoice->discount_amount)->toBe(20000.0);
    expect((float) $invoice->total_amount)->toBe(130000.0);

    $giftLine = InvoiceLine::where('invoice_id', $invoice->id)->where('menu_item_id', $giftItem->id)->first();
    expect($giftLine)->not->toBeNull();
    expect((int) $giftLine->quantity)->toBe(5);
    expect((float) $giftLine->unit_price)->toBe(20000.0);
    expect((float) $giftLine->subtotal)->toBe(100000.0);
    expect((float) $giftLine->discount_amount)->toBe(20000.0);

    $paidLine = InvoiceLine::where('invoice_id', $invoice->id)->where('menu_item_id', $paidItem->id)->first();
    expect($paidLine)->not->toBeNull();
    expect((int) $paidLine->quantity)->toBe(1);
    expect((float) $paidLine->unit_price)->toBe(50000.0);
    expect((float) $paidLine->subtotal)->toBe(50000.0);
    expect((float) $paidLine->discount_amount)->toBe(0.0);

    $lineVatSum = (float) InvoiceLine::where('invoice_id', $invoice->id)->sum('vat_amount');
    $lineDiscountSum = (float) InvoiceLine::where('invoice_id', $invoice->id)->sum('discount_amount');

    expect((float) $order->vat_amount)->toBe($lineVatSum);
    expect((float) $order->discount_amount)->toBe($lineDiscountSum);
    expect((float) $order->discount_amount)->toBe(20000.0);
    expect((float) $order->total)->toBe(130000.0);
    expect((float) $order->total)->toBe(round((float) $order->subtotal - (float) $order->discount_amount, 2));
});

test('checkout: multiple free_product actions clamp to line remaining subtotal', function () {
    $admin = posAdmin();
    $giftItem = posMenuItem(['price' => 20000, 'vat_rate' => 0]);

    // Promotion tự động có 2 action free_product cùng tặng giftItem, nhưng giỏ hàng chỉ có qty=1 (subtotal 20k)
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'free_product', (float) $giftItem->id);
    addAction($p, 'free_product', (float) $giftItem->id);

    $table = posTable();
    $order = posOrder($table, [
        ['item' => $giftItem, 'qty' => 1, 'price' => 20000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 0,
    ])->assertOk();

    $order->refresh();
    $giftLine = InvoiceLine::where('invoice_id', $order->invoice_id)->where('menu_item_id', $giftItem->id)->first();
    expect($giftLine)->not->toBeNull();
    // discount_amount không thể vượt quá subtotal (20,000)
    expect((float) $giftLine->discount_amount)->toBe(20000.0);
    expect((float) $giftLine->subtotal)->toBe(20000.0);
    expect((float) $order->discount_amount)->toBe(20000.0);
    expect((float) $order->total)->toBe(0.0);
});
