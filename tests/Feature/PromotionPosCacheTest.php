<?php

use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia;

test('pos index cache danh sach promotions khi khong phai local', function () {
    $p = promoV2(['type' => 'promotion']);
    $staff = posStaff();
    $this->actingAs($staff);

    $this->get('/staff/pos')->assertOk();

    // Env testing (CACHE_STORE=array) → cachedPayload dùng cache thật
    expect(Cache::tags(['pos_promotions'])->has('pos_promotions_list'))->toBeTrue();

    $this->get('/staff/pos')
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('staff/pos/POSManager')
            ->has('promotions', 1));
});

test('store promotion moi invalidate cache pos_promotions', function () {
    Cache::tags(['pos_promotions'])->put('pos_promotions_list', ['stale'], 300);

    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Promo Test Cache', 'type' => 'promotion',
        'start_date' => null, 'end_date' => null,
        'status' => true,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 10000, 'max_discount_amount' => null]],
    ])->assertSessionHasNoErrors();

    expect(Cache::tags(['pos_promotions'])->has('pos_promotions_list'))->toBeFalse();
});

test('checkout flush cache pos_promotions sau khi thanh toan', function () {
    Cache::tags(['pos_promotions'])->put('pos_promotions_list', ['stale'], 300);

    $this->actingAs(posAdmin());
    $table = posTable(['table_number' => 'B31', 'status' => 'occupied']);
    $item = posMenuItem();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 20000, 'status' => 'completed']], ['status' => 'completed']);

    $this->post('/staff/pos/bulk-checkout', [
        'order_ids' => [$order->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 20000,
        'change_amount' => 0,
    ])->assertSessionHasNoErrors();

    expect(Cache::tags(['pos_promotions'])->has('pos_promotions_list'))->toBeFalse();
});
