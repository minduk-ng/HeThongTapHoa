<?php

use App\Models\Promotion;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Carbon;

test('index trả danh sách khuyến mãi cho người có quyền', function () {
    $p = promoV2(['type' => 'coupon', 'code' => 'IDX'.substr(uniqid(), -4)]);
    addAction($p, 'discount_amount', 10000);

    $this->actingAs(posAdmin())->get('/manager/promotions')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('manager/promotions/PromotionsManager')
            ->has('promotions', 1)
            ->has('promotions.0.actions')
            ->has('menu_items')
            ->has('menu_categories'));
});

test('store tạo promotion + conditions + actions và chuẩn hoá code hoa', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Giảm 20%',
        'code' => '  km20  ',
        'start_date' => '2026-08-01',
        'end_date' => '2026-08-03',
        'status' => true,
        'max_usage' => 100,
        'exclusive' => false,
        'stackable' => true,
        'conditions' => [
            ['cond_type' => 'min_order_value', 'cond_value' => '100000'],
        ],
        'actions' => [
            ['action_type' => 'discount_percent', 'action_value' => 20, 'max_discount_amount' => 50000],
        ],
    ])->assertSessionHasNoErrors();

    $promo = Promotion::where('code', 'KM20')->first();
    expect($promo)->not->toBeNull();
    expect($promo->name)->toBe('Giảm 20%');
    expect($promo->type)->toBe('coupon');
    expect($promo->status)->toBeTrue();
    expect($promo->max_usage)->toBe(100);
    expect($promo->stackable)->toBeTrue();
    expect($promo->start_date->toDateTimeString())->toBe('2026-08-01 00:00:00');
    expect($promo->end_date->toDateTimeString())->toBe('2026-08-03 23:59:59');

    expect($promo->conditions)->toHaveCount(1);
    expect($promo->conditions[0]->cond_type)->toBe('min_order_value');
    expect($promo->conditions[0]->cond_value)->toBe('100000');

    expect($promo->actions)->toHaveCount(1);
    expect($promo->actions[0]->action_type)->toBe('discount_percent');
    expect((float) $promo->actions[0]->action_value)->toBe(20.0);
    expect((float) $promo->actions[0]->max_discount_amount)->toBe(50000.0);
});

test('store type promotion luu code null', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'promotion',
        'name' => 'KM tu dong',
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();

    $promo = Promotion::where('name', 'KM tu dong')->first();
    expect($promo->type)->toBe('promotion');
    expect($promo->code)->toBeNull();
});

test('update chỉnh sửa và tạo lại conditions/actions', function () {
    $admin = posAdmin();
    $promo = promoV2(['type' => 'coupon', 'code' => 'UP'.substr(uniqid(), -4), 'name' => 'Cũ']);
    addAction($promo, 'discount_amount', 1000);
    $oldActionId = $promo->actions->first()->id;

    $this->actingAs($admin)->post("/manager/promotions/{$promo->id}", [
        'type' => 'coupon',
        'name' => 'Mới',
        'code' => $promo->code,
        'conditions' => [
            ['cond_type' => 'min_quantity', 'cond_value' => '3'],
        ],
        'actions' => [
            ['action_type' => 'discount_percent', 'action_value' => 10, 'max_discount_amount' => 20000],
        ],
    ])->assertSessionHasNoErrors();

    $promo = $promo->fresh();
    expect($promo->name)->toBe('Mới');
    expect($promo->conditions)->toHaveCount(1);
    expect($promo->conditions[0]->cond_type)->toBe('min_quantity');
    expect($promo->actions)->toHaveCount(1);
    expect($promo->actions[0]->id)->not->toBe($oldActionId);
    expect((float) $promo->actions[0]->max_discount_amount)->toBe(20000.0);

    $this->delete("/manager/promotions/{$promo->id}", ['password' => 'password123'])
        ->assertSessionHasNoErrors();
    expect(Promotion::find($promo->id))->toBeNull();
});

test('store tra loi loi validation khi ngay hoac action khong hop le', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Sai ngay',
        'start_date' => 'garbage',
        'actions' => [['action_type' => 'discount_percent', 'action_value' => 10]],
    ])->assertSessionHasErrors(['start_date']);

    $this->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Cap am',
        'actions' => [['action_type' => 'discount_percent', 'action_value' => 10, 'max_discount_amount' => -5]],
    ])->assertSessionHasErrors(['actions.0.max_discount_amount']);

    $this->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Thieu action',
    ])->assertSessionHasErrors(['actions']);

    $this->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Action sai',
        'actions' => [['action_type' => 'buy1get1', 'action_value' => 10]],
    ])->assertSessionHasErrors(['actions.0.action_type']);
});

test('store coupon/voucher khong code thi loi validation', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Coupon khong code',
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasErrors(['code']);

    $this->post('/manager/promotions', [
        'type' => 'voucher',
        'name' => 'Voucher khong code',
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasErrors(['code']);

    // type=promotion không cần code
    $this->post('/manager/promotions', [
        'type' => 'promotion',
        'name' => 'Promotion khong code',
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();
});

test('store code trung lap bi tu choi 422/redirect (khong phai 500)', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Dup 1',
        'code' => 'DUPX',
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();

    $this->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Dup 2',
        'code' => 'DUPX',
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasErrors(['code']);
    expect(Promotion::where('code', 'DUPX')->count())->toBe(1);
});

test('end_date chuan hoa cuoi ngay: coupon con ap dung trong ngay cuoi', function () {
    Carbon::setTestNow('2026-08-03 12:00:00');
    try {
        $this->actingAs(posAdmin())->post('/manager/promotions', [
            'type' => 'coupon',
            'name' => 'Het ngay 3/8',
            'code' => 'EOD'.substr(uniqid(), -4),
            'start_date' => '2026-08-01',
            'end_date' => '2026-08-03',
            'actions' => [['action_type' => 'discount_amount', 'action_value' => 10000]],
        ])->assertSessionHasNoErrors();

        $promo = Promotion::where('name', 'Het ngay 3/8')->first();
        expect($promo->start_date->toDateTimeString())->toBe('2026-08-01 00:00:00');
        expect($promo->end_date->toDateTimeString())->toBe('2026-08-03 23:59:59');

        // 12h trưa 03/08: end_date=23:59:59 nên promo vẫn còn hiệu lực
        $res = PromotionEngine::resolveAll([$promo->code], linesV2(), 150000);
        expect($res['status'])->toBe('ok');
        expect($res['total_discount'])->toBe(10000.0);
    } finally {
        Carbon::setTestNow();
    }
});
