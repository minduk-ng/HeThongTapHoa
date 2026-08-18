<?php

use App\Models\InvoiceLine;

test('order vat_amount bang SUM(invoice_lines.vat_amount) khi co mon tang', function () {
    $admin = posAdmin();
    $paidItem = posMenuItem(['price' => 100000, 'vat_rate' => 10]);
    $giftItem = posMenuItem(['price' => 50000, 'vat_rate' => 10]);

    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'free_product', (float) $giftItem->id);

    $table = posTable();
    $order = posOrder($table, [
        ['item' => $paidItem, 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
        ['item' => $giftItem, 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
    ])->assertOk();

    $order->refresh();
    $lineVatSum = (float) InvoiceLine::where('invoice_id', $order->invoice_id)->sum('vat_amount');
    $lineDiscountSum = (float) InvoiceLine::where('invoice_id', $order->invoice_id)->sum('discount_amount');

    expect((float) $order->vat_amount)->toBe($lineVatSum);
    expect((float) $order->discount_amount)->toBe($lineDiscountSum);
    expect((float) $order->total)->toBe(round((float) $order->subtotal - (float) $order->discount_amount, 2));
});

test('bulk: moi order vat/discount bang tong invoice_lines cua chinh no khi co mon tang', function () {
    $admin = posAdmin();
    $paidItem = posMenuItem(['price' => 100000, 'vat_rate' => 10]);
    $giftItem = posMenuItem(['price' => 50000, 'vat_rate' => 10]);
    $plainItem = posMenuItem(['price' => 30000, 'vat_rate' => 10]);

    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'free_product', (float) $giftItem->id);

    $table = posTable();
    $o1 = posOrder($table, [
        ['item' => $paidItem, 'qty' => 1, 'price' => 100000, 'status' => 'completed'],
        ['item' => $giftItem, 'qty' => 1, 'price' => 50000, 'status' => 'completed'],
    ], ['status' => 'pending']);
    $o2 = posOrder($table, [
        ['item' => $plainItem, 'qty' => 1, 'price' => 30000, 'status' => 'completed'],
    ], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/bulk-checkout', [
        'order_ids' => [$o1->id, $o2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 130000,
    ])->assertOk();

    foreach ([$o1, $o2] as $o) {
        $o->refresh();
        $itemIds = $o->items()->where('status', '!=', 'cancelled')->pluck('id');
        $lineVatSum = (float) InvoiceLine::where('invoice_id', $o->invoice_id)->whereIn('order_item_id', $itemIds)->sum('vat_amount');
        $lineDiscountSum = (float) InvoiceLine::where('invoice_id', $o->invoice_id)->whereIn('order_item_id', $itemIds)->sum('discount_amount');

        expect((float) $o->vat_amount)->toBe($lineVatSum);
        expect((float) $o->discount_amount)->toBe($lineDiscountSum);
        expect((float) $o->total)->toBe(round((float) $o->subtotal - (float) $o->discount_amount, 2));
    }
});
