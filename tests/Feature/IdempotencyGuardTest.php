<?php

use App\Models\Deposit;
use Illuminate\Support\Facades\Cache;

// Tạo đơn để đặt cọc.
function idemDepositOrder(): \App\Models\Order
{
    $item = posMenuItem(['price' => 100000]);
    return posOrder(posTable(), [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']]);
}

test('deposit double-submit cung order/amount/method chi tao 1 coc', function () {
    $this->actingAs(posAdmin());
    $order = idemDepositOrder();

    // Request 1 (không idempotency_key — giả lập client cũ double-click)
    $r1 = $this->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 100000, 'method' => 'cash',
    ]);
    $r1->assertOk();

    // Request 2 cùng fingerprint trong 5s — phải bị chặn (success ngầm, không tạo cọc mới)
    $r2 = $this->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 100000, 'method' => 'cash',
    ]);
    $r2->assertOk();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(1);
});

test('deposit khac amount tao duoc 2 coc (khong bi chan)', function () {
    $this->actingAs(posAdmin());
    $order = idemDepositOrder();

    $this->postJson('/staff/pos/deposit', ['order_id' => $order->id, 'amount' => 100000, 'method' => 'cash'])->assertOk();
    $this->postJson('/staff/pos/deposit', ['order_id' => $order->id, 'amount' => 50000, 'method' => 'cash'])->assertOk();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(2);
});

test('deposit 2 request cung fingerprint nhung khac idempotency_key chi tao 1 coc', function () {
    $this->actingAs(posAdmin());
    $order = idemDepositOrder();

    $this->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 100000, 'method' => 'cash',
        'idempotency_key' => 'client_a_'.uniqid(),
    ])->assertOk();
    $this->postJson('/staff/pos/deposit', [
        'order_id' => $order->id, 'amount' => 100000, 'method' => 'cash',
        'idempotency_key' => 'client_b_'.uniqid(),
    ])->assertOk();

    expect(Deposit::where('order_id', $order->id)->count())->toBe(1);
});
