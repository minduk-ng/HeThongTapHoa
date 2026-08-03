<?php

use App\Models\Promotion;

test('index trả danh sách khuyến mãi cho người có quyền', function () {
    Promotion::create(['code' => 'A1', 'name' => 'KM A', 'discount_type' => 'fixed_amount', 'discount_value' => 10000]);
    $this->actingAs(posAdmin())->get('/manager/promotions')->assertOk();
});

test('store tạo và chặn mã khuyến mãi trùng', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => 'KM20',
        'name' => 'Giảm 20%',
        'discount_type' => 'percentage',
        'discount_value' => 20,
        'min_order_amount' => 0,
        'is_active' => true,
    ])->assertSessionHasNoErrors();

    expect(Promotion::where('code', 'KM20')->exists())->toBeTrue();

    $this->post('/manager/promotions', [
        'code' => 'KM20',
        'name' => 'Mới',
        'discount_type' => 'fixed_amount',
        'discount_value' => 2000,
    ])->assertSessionHasErrors(['code']);
});

test('update chỉnh sửa và destroy xóa khuyến mãi sau khi xác nhận mật khẩu', function () {
    $admin = posAdmin();
    $promo = Promotion::create(['code' => 'E1', 'name' => 'Cũ', 'discount_type' => 'fixed_amount', 'discount_value' => 1000]);

    $this->actingAs($admin)->post("/manager/promotions/{$promo->id}", [
        'code' => 'E1',
        'name' => 'Mới',
        'discount_type' => 'fixed_amount',
        'discount_value' => 2000,
        'is_active' => true,
    ])->assertSessionHasNoErrors();
    expect($promo->fresh()->name)->toBe('Mới');

    $this->delete("/manager/promotions/{$promo->id}", ['password' => 'password123'])
        ->assertSessionHasNoErrors();
    expect(Promotion::find($promo->id))->toBeNull();
});

test('store chuan hoa code hoa and expires_at ve cuoi ngay', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => '  km99  ',
        'name' => 'KM 99',
        'discount_type' => 'percentage',
        'discount_value' => 9,
        'min_order_amount' => 0,
        'starts_at' => '2026-08-01',
        'expires_at' => '2026-08-03',
        'is_active' => true,
    ])->assertSessionHasNoErrors();

    $promo = Promotion::where('code', 'KM99')->first();
    expect($promo)->not->toBeNull();
    expect($promo->starts_at->toDateTimeString())->toBe('2026-08-01 00:00:00');
    expect($promo->expires_at->toDateTimeString())->toBe('2026-08-03 23:59:59');
});

test('store chan ma trung khong phan biet hoa thuong', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => 'THUONG',
        'name' => 'KM',
        'discount_type' => 'fixed_amount',
        'discount_value' => 100,
        'min_order_amount' => 0,
    ])->assertSessionHasNoErrors();

    $this->post('/manager/promotions', [
        'code' => 'thuong',
        'name' => 'Trung',
        'discount_type' => 'fixed_amount',
        'discount_value' => 100,
    ])->assertSessionHasErrors(['code']);
});
