<?php

use App\Models\Customer;
use App\Models\Invoice;

/*
|--------------------------------------------------------------------------
| POS — Gắn khách hàng vào đơn/hóa đơn khi thanh toán
|--------------------------------------------------------------------------
| Bao phủ:
| - checkout đơn lẻ nhận customer_id → lưu lên orders + invoices
*/

test('checkout gan customer_id len order va invoice', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 50000]], ['status' => 'pending']);
    $customer = Customer::create(['full_name' => 'Khach A', 'phone' => '0909999999']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'customer_id' => $customer->id,
    ])->assertOk();

    expect($order->fresh()->customer_id)->toBe($customer->id);
    expect((int) Invoice::firstOrFail()->customer_id)->toBe($customer->id);
});

test('pos tim khach theo so dien thoai', function () {
    $admin = posAdmin();
    Customer::create(['full_name' => 'Khach B', 'phone' => '0912345678']);

    $this->actingAs($admin)->postJson('/staff/pos/customers/search', ['q' => '0912345678'])
        ->assertOk()
        ->assertJsonPath('customers.0.full_name', 'Khach B');
});

test('pos tao khach moi va tra ve khach', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->postJson('/staff/pos/customers', [
        'full_name' => 'Khach C',
        'phone' => '0909876543',
    ])->assertOk()->assertJsonPath('customer.id', Customer::where('phone', '0909876543')->firstOrFail()->id);

    // SĐT trùng bị chặn
    $this->actingAs($admin)->postJson('/staff/pos/customers', [
        'full_name' => 'Khach C2',
        'phone' => '0909876543',
    ])->assertStatus(422);
});
