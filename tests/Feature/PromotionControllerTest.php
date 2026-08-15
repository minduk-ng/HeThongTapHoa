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

test('store luu target_usage cho promotion', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'promotion',
        'name' => 'KM co muc tieu',
        'target_usage' => 100,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();

    $promo = Promotion::where('name', 'KM co muc tieu')->first();
    expect($promo->target_usage)->toBe(100);
});

test('index tra target_usage trong campaign payload', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'promotion', 'target_usage' => 50]);
    addAction($promo, 'discount_amount', 5000);

    $this->get('/manager/promotions')->assertInertia(fn ($page) => $page->component('manager/promotions/PromotionsManager')
        ->where('promotions.0.id', $promo->id)
        ->where('promotions.0.target_usage', 50));
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

test('index tra revenue + discount_total cho tung campaign', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'promotion']);
    addAction($p, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);
    $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 95000,
    ])->assertOk();

    $this->get('/manager/promotions')->assertInertia(fn ($page) => $page->component('manager/promotions/PromotionsManager')
        ->where('promotions.0.id', $p->id)
        ->where('promotions.0.revenue', 95000)
        ->where('promotions.0.discount_total', 5000));
});

test('promotion invoices endpoint tra danh sach hoa don da dung ma', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'coupon', 'code' => 'INVX'.substr(uniqid(), -4)]);
    addAction($p, 'discount_amount', 5000);
    $item = posMenuItem(['price' => 100000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 100000, 'status' => 'completed']], ['status' => 'pending']);
    $this->postJson('/staff/pos/checkout', [
        'order_id' => $order->id, 'payment_method' => 'cash', 'amount_received' => 95000, 'promotion_code' => $p->code,
    ])->assertOk();

    $res = $this->getJson("/manager/promotions/{$p->id}/invoices")->assertOk();
    expect($res->json('invoices'))->toHaveCount(1);
    expect((float) $res->json('invoices.0.discount_amount'))->toBe(5000.0);
});

test('store voucher voi code_prefix + quantity tao du ma con', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'voucher',
        'name' => 'Batch coupon',
        'code_prefix' => 'BC01',
        'code_quantity' => 3,
        'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();

    $promo = Promotion::where('name', 'Batch coupon')->first();
    expect($promo->codes)->toHaveCount(3);
    expect($promo->code_random)->toBeTrue();
    expect($promo->codes()->pluck('code')->map(fn ($c) => str_starts_with($c, 'BC01'))->every(fn ($b) => $b))->toBeTrue();
});

test('store voucher batch khong can code rieng (chi prefix + quantity)', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'voucher',
        'name' => 'Batch no code',
        'code_prefix' => 'BNC',
        'code_quantity' => 2,
        'code_random' => false,
        'max_usage' => 50, // bị bỏ qua vì batch
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();

    $promo = Promotion::where('name', 'Batch no code')->first();
    expect($promo->code)->toBeNull();
    expect($promo->max_usage)->toBeNull(); // batch: mỗi mã con 1 lần, không giới hạn tổng
    expect($promo->codes)->toHaveCount(2);
    expect($promo->codes()->pluck('code')->map(fn ($c) => str_starts_with($c, 'BNC'))->every(fn ($b) => $b))->toBeTrue();
});

test('store voucher gui ca code va batch: bi chan 422 (khong duoc code don)', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'voucher',
        'name' => 'Batch mutual',
        'code' => 'MUTUAL', // voucher không được dùng mã đơn
        'code_prefix' => 'MUT',
        'code_quantity' => 2,
        'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasErrors('code');
});

test('store gui batch nhung code_prefix null: khong phai batch, code le giu lai', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Single code',
        'code' => 'SINGLE1',
        'code_prefix' => null,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasNoErrors();

    $promo = Promotion::where('name', 'Single code')->first();
    expect($promo->code)->toBe('SINGLE1');
    expect($promo->codes)->toHaveCount(0);
});

test('store prefix trung bi 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'voucher', 'name' => 'A',
        'code_prefix' => 'DUPB', 'code_quantity' => 1, 'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 1000]],
    ])->assertSessionHasNoErrors();

    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'voucher', 'name' => 'B',
        'code_prefix' => 'DUPB', 'code_quantity' => 1, 'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 1000]],
    ])->assertSessionHasErrors('code_prefix');
});

test('index tra batch fields + codes_count/codes_used', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'IDXB'.substr(uniqid(), -4), 'code_prefix' => 'IDXB', 'code_quantity' => 2, 'code_random' => false]);
    addAction($promo, 'discount_amount', 5000);
    $promo->codes()->createMany([
        ['code' => 'IDXB-001', 'status' => 'unused'],
        ['code' => 'IDXB-002', 'status' => 'used'],
    ]);

    $this->get('/manager/promotions')->assertInertia(fn ($page) => $page->component('manager/promotions/PromotionsManager')
        ->where('promotions.0.id', $promo->id)
        ->where('promotions.0.code_prefix', 'IDXB')
        ->where('promotions.0.code_quantity', 2)
        ->where('promotions.0.code_random', false)
        ->where('promotions.0.codes_count', 2)
        ->where('promotions.0.codes_used', 1));
});

test('GET codes tra danh sach ma con + bo dem', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'CODES1', 'code_quantity' => 3, 'code_random' => false]);
    addAction($p, 'discount_amount', 1000);
    \App\Services\Promotions\PromotionCodeService::generate($p);
    $p->codes()->first()->update(['status' => 'used', 'used_at' => now()]);

    $res = $this->getJson("/manager/promotions/{$p->id}/codes")->assertOk();
    expect($res->json('codes'))->toHaveCount(3);
    expect($res->json('meta.per_page'))->toBe(50);
    $usedCount = collect($res->json('codes'))->where('status', 'used')->count();
    expect($usedCount)->toBe(1);
});

test('GET codes export=1 tra toan bo khong phan trang', function () {
    $this->actingAs(posAdmin());
    $p = promoV2(['type' => 'coupon', 'code' => null, 'code_prefix' => 'CODESX', 'code_quantity' => 5, 'code_random' => false]);
    addAction($p, 'discount_amount', 1000);
    \App\Services\Promotions\PromotionCodeService::generate($p);

    $res = $this->getJson("/manager/promotions/{$p->id}/codes?export=1")->assertOk();
    expect($res->json('codes'))->toHaveCount(5);
    expect($res->json('meta'))->toBeNull();
});

test('store luu time_slots: tao dung so dong promotion_time_slots', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Slot campaign',
        'code' => 'SLOT1',
        'time_slots' => [
            ['day_of_week' => 1, 'start_time' => '11:00', 'end_time' => '13:00'],
            ['day_of_week' => 2, 'start_time' => '11:00', 'end_time' => '13:00'],
            ['day_of_week' => 3, 'start_time' => '11:00', 'end_time' => '13:00'],
        ],
        'actions' => [['action_type' => 'discount_percent', 'action_value' => 30]],
    ])->assertSessionHasNoErrors();

    $promo = \App\Models\Promotion::where('name', 'Slot campaign')->first();
    expect($promo->timeSlots)->toHaveCount(3);
    expect($promo->timeSlots->pluck('day_of_week')->sort()->values()->all())->toBe([1, 2, 3]);
});

test('store end_time truoc start_time bi 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Bad slot',
        'code' => 'BADSLOT',
        'time_slots' => [
            ['day_of_week' => 1, 'start_time' => '13:00', 'end_time' => '11:00'],
        ],
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasErrors('time_slots.0.end_time');
});

test('index tra time_slots trong payload', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'SLOTIDX']);
    addAction($promo, 'discount_amount', 5000);
    \App\Models\PromotionTimeSlot::create([
        'promotion_id' => $promo->id,
        'day_of_week' => 5,
        'start_time' => '17:00',
        'end_time' => '20:00',
    ]);

    $this->get('/manager/promotions')->assertInertia(fn ($page) => $page->component('manager/promotions/PromotionsManager')
        ->where('promotions.0.id', $promo->id)
        ->where('promotions.0.time_slots.0.day_of_week', 5)
        ->where('promotions.0.time_slots.0.start_time', '17:00'));
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

test('coupon gui code_prefix bi chan 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Coupon sai', 'type' => 'coupon', 'code' => 'C1'.substr(uniqid(), -4),
        'code_prefix' => 'C1', 'code_quantity' => 5,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasErrors('code_prefix');
});

test('voucher thieu code_prefix/quantity bi chan 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Voucher sai', 'type' => 'voucher', 'code' => 'V1'.substr(uniqid(), -4),
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasErrors('code_prefix');
});

test('voucher gui code don bi chan 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Voucher sai code', 'type' => 'voucher',
        'code' => 'V2'.substr(uniqid(), -4), 'code_prefix' => 'V2', 'code_quantity' => 3,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasErrors('code');
});

test('voucher hop le duoc ep code_random=true', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Voucher dung', 'type' => 'voucher',
        'code_prefix' => 'VOK'.substr(uniqid(), -4), 'code_quantity' => 3, 'code_random' => false,
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasNoErrors();

    $p = \App\Models\Promotion::where('name', 'Voucher dung')->first();
    expect($p->code_random)->toBeTrue();
});

test('coupon hop le chi luu code don, khong prefix', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'name' => 'Coupon dung', 'type' => 'coupon', 'code' => 'COK'.substr(uniqid(), -4),
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000, 'max_discount_amount' => null]],
    ])->assertSessionHasNoErrors();

    $p = \App\Models\Promotion::where('name', 'Coupon dung')->first();
    expect($p->code)->not->toBeNull();
    expect($p->code_prefix)->toBeNull();
    expect($p->code_quantity)->toBeNull();
    expect($p->code_random)->toBeFalse();
});
