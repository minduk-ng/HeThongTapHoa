<?php

use App\Models\PromotionCode;
use App\Services\Promotions\PromotionEngine;

test('dat ban tinh VAT included', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 110000, 'vat_rate' => 10]);
    $table = posTable();

    $res = $this->actingAs($admin)->postJson('/staff/pos/reserve', [
        'table_id' => $table->id,
        'reservation_name' => 'Anh Vu',
        'reservation_phone' => '0900000000',
        'reservation_time' => now()->addHour()->toDateTimeString(),
        'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
    ])->assertOk();

    $order = $res->json('order');
    // Giá đã gồm VAT: VAT = 110000 - floor(110000/1.1) = 110000 - 100000 = 10000; total = 110000
    expect((float) $order['vat_amount'])->toBe(10000.0);
    expect((float) $order['total'])->toBe(110000.0);
});

test('bulk checkout bat buoc cac don cung mot ban', function () {
    $admin = posAdmin();
    $tableA = posTable();
    $tableB = posTable();
    $item = posMenuItem(['price' => 20000, 'vat_rate' => 0]);
    $orderA = posOrder($tableA, [['item' => $item, 'qty' => 1, 'price' => 20000]], ['status' => 'pending']);
    $orderB = posOrder($tableB, [['item' => $item, 'qty' => 1, 'price' => 20000]], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/bulk-checkout', [
        'order_ids' => [$orderA->id, $orderB->id],
        'payment_method' => 'cash',
        'amount_received' => 40000,
    ])->assertStatus(422);
});

test('cac ma con cung campaign deu duoc danh dau used khi checkout', function () {
    $p = promoV2(['type' => 'coupon', 'code' => 'PARENT-'.uniqid()]);
    addAction($p, 'discount_amount', 10000);
    $code1 = PromotionCode::create(['promotion_id' => $p->id, 'code' => 'CHILD-'.strtoupper(substr(uniqid(), -6))]);
    $code2 = PromotionCode::create(['promotion_id' => $p->id, 'code' => 'CHILD-'.strtoupper(substr(uniqid(), -6))]);

    $lines = linesV2();
    $res = PromotionEngine::resolveAll(
        [$code1->code, $code2->code],
        $lines,
        (float) $lines->sum('subtotal'),
        true, // lockForUpdate → tiêu thụ mã
    );

    expect($res['status'])->toBe('ok');
    expect(count($res['promotions']))->toBe(1); // dedupe: không discount kép
    expect($code1->fresh()->status)->toBe('used');
    expect($code2->fresh()->status)->toBe('used');
});
