<?php

use App\Models\Promotion;

test('delete qua destroy la soft delete, ban ghi con trong DB', function () {
    $admin = posAdmin();
    $promo = Promotion::create([
        'code' => 'SD'.uniqid(), 'name' => 'Soft', 'discount_type' => 'fixed_amount', 'discount_value' => 1000,
    ]);

    $this->actingAs($admin)->delete("/manager/promotions/{$promo->id}", ['password' => 'password123'])
        ->assertSessionHasNoErrors();

    expect(Promotion::find($promo->id))->toBeNull();
    expect(Promotion::withTrashed()->find($promo->id)->deleted_at)->not->toBeNull();
});

test('resolvePromotion khong tra ve promotion da soft delete', function () {
    $promo = Promotion::create([
        'code' => 'GONE'.uniqid(), 'name' => 'Xoa', 'discount_type' => 'percentage',
        'discount_value' => 10, 'is_active' => true,
    ]);
    $promo->delete();

    $this->actingAs(posStaff())
        ->postJson('/staff/pos/validate-promotion', ['code' => $promo->code, 'subtotal' => 100000])
        ->assertStatus(422)->assertJson(['ok' => false, 'error' => 'Mã khuyến mãi không tồn tại.']);
});