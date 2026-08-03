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

test('store tra loi loi validation khi starts_at khong hop le', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => 'BADDATE',
        'name' => 'Sai ngay',
        'discount_type' => 'fixed_amount',
        'discount_value' => 100,
        'starts_at' => 'garbage',
    ])->assertSessionHasErrors(['starts_at']);
});

test('store chap nhan target item/category va chuan hoa target_value ve null khi order', function () {
    $cat = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    $item = \App\Models\MenuItem::create(['category_id' => $cat->id, 'name' => 'Mon '.uniqid(), 'price' => 20000, 'vat_rate' => 0, 'is_available' => true]);

    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => 'KMITEM',
        'name' => 'KM mon',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'target_type' => 'item',
        'target_value' => $item->id,
    ])->assertSessionHasNoErrors();

    $promo = \App\Models\Promotion::where('code', 'KMITEM')->first();
    expect($promo->target_type)->toBe('item');
    expect((int) $promo->target_value)->toBe($item->id);

    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => 'KMCAT',
        'name' => 'KM danh muc',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'target_type' => 'category',
        'target_value' => $cat->id,
    ])->assertSessionHasNoErrors();

    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => 'KMFREE',
        'name' => 'KM toan don',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'target_type' => 'order',
        'target_value' => $item->id, // phải bị normalize về null
    ])->assertSessionHasNoErrors();

    expect(\App\Models\Promotion::where('code', 'KMFREE')->first()->target_value)->toBeNull();
});

test('store chặn target_value thiếu hoặc không tồn tại', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'code' => 'BADITEM',
        'name' => 'Sai mon',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'target_type' => 'item', // thiếu target_value
    ])->assertSessionHasErrors(['target_value']);

    $this->post('/manager/promotions', [
        'code' => 'BADCAT',
        'name' => 'Sai cat',
        'discount_type' => 'percentage',
        'discount_value' => 10,
        'target_type' => 'category',
        'target_value' => 999999, // không tồn tại
    ])->assertSessionHasErrors(['target_value']);
});

test('index truyền menu_items và menu_categories cho form', function () {
    $cat = \App\Models\MenuCategory::create(['name' => 'Cat '.uniqid(), 'sort_order' => 1]);
    \App\Models\MenuItem::create(['category_id' => $cat->id, 'name' => 'Mon '.uniqid(), 'price' => 10000, 'vat_rate' => 0, 'is_available' => true]);

    $this->actingAs(posAdmin())
        ->get('/manager/promotions')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('manager/promotions/PromotionsManager')
            ->has('menu_categories')
            ->has('menu_items'));
});
