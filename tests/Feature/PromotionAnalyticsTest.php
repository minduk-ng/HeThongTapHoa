<?php

use App\Models\DailyPromotionStat;
use App\Models\Invoice;
use App\Models\OrderPromotion;
use App\Models\Promotion;

function promoStat(array $attrs = []): Promotion
{
    return Promotion::create(array_merge([
        'name' => 'Promo '.uniqid(), 'type' => 'coupon', 'code' => 'STAT'.uniqid(),
        'status' => true, 'max_usage' => null, 'used_count' => 0,
        'exclusive' => false, 'stackable' => true,
    ], $attrs));
}

test('checkout upsert daily_promotion_stats', function () {
    $admin = posAdmin();
    $coupon = promoStat();
    $coupon->actions()->create(['action_type' => 'discount_amount', 'action_value' => 10000, 'max_discount_amount' => null]);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'promotion_code' => $coupon->code,
    ])->assertOk();

    $stat = DailyPromotionStat::where('promotion_id', $coupon->id)->where('stat_date', now()->toDateString())->first();
    expect($stat)->not->toBeNull();
    expect($stat->order_count)->toBe(1);
    expect((float) $stat->revenue)->toBe(40000.0);      // tổng tiền hoá đơn = invoices.total_amount (sau giảm: 50000 - 10000)
    expect((float) $stat->discount_total)->toBe(10000.0); // tiền giảm thực tế
});

test('command rebuild daily stats cho hom qua', function () {
    $admin = posAdmin();
    $coupon = promoStat();
    $coupon->actions()->create(['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]);
    $item = posMenuItem(['price' => 40000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 40000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 40000,
        'promotion_code' => $coupon->code,
    ])->assertOk();

    $op = OrderPromotion::where('promotion_id', $coupon->id)->first();
    $op->forceFill(['created_at' => now()->subDay()])->save();

    $this->artisan('promotions:aggregate-daily')->assertSuccessful();

    $stat = DailyPromotionStat::where('promotion_id', $coupon->id)->where('stat_date', now()->subDay()->toDateString())->first();
    expect($stat)->not->toBeNull();
    expect((float) $stat->revenue)->toBe(35000.0);       // tổng tiền hoá đơn = invoices.total_amount (sau giảm: 40000 - 5000)
    expect((float) $stat->discount_total)->toBe(5000.0); // tiền giảm thực tế
});

test('command rebuild bulk: revenue tinh 1 lan moi invoice (khong nhan N), order_count = distinct invoice', function () {
    $admin = posAdmin();
    $coupon = promoV2(['type' => 'coupon', 'code' => 'BULKREV'.substr(uniqid(), -4)]);
    addAction($coupon, 'discount_amount', 10000);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable(['status' => 'occupied']);
    $order1 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'completed']);

    $this->actingAs($admin)->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id, $order2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 90000,
        'change_amount' => 0,
        'promotion_code' => $coupon->code,
    ])->assertSessionHasNoErrors();

    $invoice = Invoice::firstOrFail();
    expect((float) $invoice->total_amount)->toBe(90000.0);

    // Backdate order_promotions về hôm qua (created_at guarded → forceFill)
    OrderPromotion::where('invoice_id', $invoice->id)->get()->each(function ($op) {
        $op->forceFill(['created_at' => now()->subDay()])->save();
    });

    $this->artisan('promotions:aggregate-daily')->assertSuccessful();

    $stat = DailyPromotionStat::where('promotion_id', $coupon->id)->where('stat_date', now()->subDay()->toDateString())->first();
    expect($stat)->not->toBeNull();
    expect((float) $stat->revenue)->toBe(90000.0); // invoice tính 1 lần, không nhân N (2 order → 180000 là sai)
    expect((int) $stat->order_count)->toBe(1);     // 1 invoice distinct
    expect((int) $stat->unique_orders)->toBe(2);   // 2 order distinct
});
