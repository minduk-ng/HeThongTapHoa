<?php

use App\Models\Customer;

test('manager tao va tim khach hang', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->post('/manager/customers', [
        'full_name' => 'Nguyen Van A',
        'phone' => '0901234567',
        'note' => 'Khach quen',
    ])->assertSessionHasNoErrors();

    expect(Customer::where('phone', '0901234567')->exists())->toBeTrue();

    // Search theo số
    $res = $this->actingAs($admin)->get('/manager/customers?search=0901234567');
    $res->assertInertia(fn ($page) => $page
        ->where('customers.0.full_name', 'Nguyen Van A')
        ->where('customers.0.phone', '0901234567'));
});

test('khong tao trung so dien thoai', function () {
    $admin = posAdmin();
    Customer::create(['full_name' => 'A', 'phone' => '0901111111']);

    $this->actingAs($admin)->post('/manager/customers', [
        'full_name' => 'B', 'phone' => '0901111111',
    ])->assertSessionHasErrors('phone');
});
