<?php

use App\Models\Deposit;
use App\Models\Invoice;

test('checkout w/ promotion + deposit held → total net, payable tru deposit', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'PD'.substr(uniqid(), -6)]);
    addAction($promo, 'discount_percent', 10);
    $table = posTable(['status' => 'occupied']);
    $item = posMenuItem(['price' => 60000]);
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 60000, 'status' => 'completed']], ['status' => 'completed']);
    Deposit::create(['order_id' => $order->id, 'amount' => 30000, 'method' => 'cash', 'status' => 'held']);

    $this->post('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 78000,
        'change_amount' => 0,
        'promotion_code' => $promo->code,
    ])->assertSessionHasNoErrors();

    $order->refresh();
    // subtotal 120000, discount 10% = 12000, total 108000, payable 108000-30000=78000
    expect((float) $order->total)->toBe(108000.0);
    expect((float) $order->discount_amount)->toBe(12000.0);
    expect((float) Invoice::firstOrFail()->total_amount)->toBe(108000.0);
    expect((float) Invoice::firstOrFail()->deposit_amount)->toBe(30000.0);
    expect(Deposit::where('order_id', $order->id)->where('status', 'applied')->exists())->toBeTrue();
    expect($promo->fresh()->used_count)->toBe(1);
});
