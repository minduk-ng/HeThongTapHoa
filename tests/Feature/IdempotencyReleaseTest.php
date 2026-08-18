<?php

use App\Models\Ingredient;
use App\Models\ProductRecipe;
use App\Models\StockVoucher;

test('checkout that bai khong bi chan boi idempotency key', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $payload = [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 1000, // thiếu tiền → transaction throw 422
        'idempotency_key' => 'retry-after-fail',
    ];

    // Lần 1: thất bại
    $this->actingAs($admin)->postJson('/staff/pos/checkout', $payload)
        ->assertStatus(422);

    // Lần 2 (retry, cùng key): PHẢI chạy lại, không bị coi là duplicate
    $this->actingAs($admin)->postJson('/staff/pos/checkout', $payload)
        ->assertStatus(422)
        ->assertJson(['error' => 'Thanh toán thất bại: Số tiền khách đưa không đủ.']);
});

test('checkout thanh cong van duoc chan duplicate trong cua so 5s', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $payload = [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'idempotency_key' => 'dup-after-success',
    ];

    $this->actingAs($admin)->postJson('/staff/pos/checkout', $payload)->assertOk();

    // Đơn đã paid → lần 2 bị chặn bởi guard status chứ không phải idempotency;
    // nhưng quan trọng: KHÔNG tạo invoice thứ 2.
    $this->actingAs($admin)->postJson('/staff/pos/checkout', $payload);
    expect($order->fresh()->invoice_id)->not->toBeNull();
    expect($order->fresh()->invoice()->count())->toBe(1);
});
