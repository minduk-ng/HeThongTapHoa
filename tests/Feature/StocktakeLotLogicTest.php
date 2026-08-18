<?php

use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;

test('sanity: kiem ke duong tao 1 dong adjustment, cong vao lo co san, report khong double count', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['name' => 'KkP '.uniqid(), 'code' => 'kkp'.uniqid(), 'unit' => 'g', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 100]);
    // Lô tồn đầu kỳ tháng trước (ngoài cửa sổ report) → giữ begin_qty = 10.
    $v = StockVoucher::create(['voucher_code' => 'PN-BEG-'.uniqid(), 'type' => 'import', 'transacted_at' => now()->subMonth()]);
    $v->items()->create(['ingredient_id' => $ing->id, 'quantity' => 10, 'unit_price' => 10, 'expiry_date' => '2026-12-01', 'quantity_remaining' => 10]);

    $this->actingAs($admin)->post('/manager/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 14]],
    ])->assertSessionHasNoErrors();

    expect((float) $ing->fresh()->stock_quantity)->toBe(14.0);
    $v = StockVoucher::where('type', 'adjustment')->first();
    expect($v->items()->count())->toBe(1);
    $adj = $v->items()->first();
    expect((float) $adj->quantity)->toBe(4.0);
    // residual = 14 - tổng lô (10) = 4 → đã cộng vào lô sẵn có, dòng adjustment không kiêm lô.
    expect($adj->quantity_remaining)->toBeNull();

    // StockMovementReport: adj phai = 4 (khong double count vi chi 1 dong quantity=4)
    $res = $this->actingAs($admin)->get('/reports/stock-movement');
    $res->assertInertia(fn ($page) => $page
        ->where('rows.0.adjust_qty', 4)
        ->where('rows.0.begin_qty', 10)
        ->where('rows.0.end_qty', 14));
});

test('sanity: kiem ke duong cong vao lo co san khong tao dong moi', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['name' => 'KkL '.uniqid(), 'code' => 'kkl'.uniqid(), 'unit' => 'g', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 100]);
    $v = StockVoucher::create(['voucher_code' => 'PN-SANITY-'.uniqid(), 'type' => 'import', 'transacted_at' => now()]);
    $v->items()->create(['ingredient_id' => $ing->id, 'quantity' => 10, 'unit_price' => 10, 'expiry_date' => '2026-12-01', 'quantity_remaining' => 10]);

    $this->actingAs($admin)->post('/manager/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 15]],
    ])->assertSessionHasNoErrors();

    $adj = StockVoucher::where('type', 'adjustment')->first();
    expect($adj->items()->count())->toBe(1);
    expect((float) $adj->items()->first()->quantity)->toBe(5.0);
    $lot = StockVoucherItem::where('ingredient_id', $ing->id)->where('quantity_remaining', '>', 0)->first();
    expect((float) $lot->quantity_remaining)->toBe(15.0);
});

test('sanity: kiem ke giam tru FIFO theo HSD', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['name' => 'KkF '.uniqid(), 'code' => 'kkf'.uniqid(), 'unit' => 'g', 'stock_quantity' => 20, 'min_stock_alert' => 5, 'cost_price' => 100]);
    $v1 = StockVoucher::create(['voucher_code' => 'PN-F1-'.uniqid(), 'type' => 'import', 'transacted_at' => now()]);
    $v1->items()->create(['ingredient_id' => $ing->id, 'quantity' => 10, 'unit_price' => 10, 'expiry_date' => '2026-11-01', 'quantity_remaining' => 10]);
    $v2 = StockVoucher::create(['voucher_code' => 'PN-F2-'.uniqid(), 'type' => 'import', 'transacted_at' => now()]);
    $v2->items()->create(['ingredient_id' => $ing->id, 'quantity' => 10, 'unit_price' => 10, 'expiry_date' => '2026-12-01', 'quantity_remaining' => 10]);

    $this->actingAs($admin)->post('/manager/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 12]],
    ])->assertSessionHasNoErrors();

    $old = StockVoucherItem::where('ingredient_id', $ing->id)->where('expiry_date', '2026-11-01 00:00:00')->first();
    $new = StockVoucherItem::where('ingredient_id', $ing->id)->where('expiry_date', '2026-12-01 00:00:00')->first();
    expect((float) $old->fresh()->quantity_remaining)->toBe(2.0);
    expect((float) $new->fresh()->quantity_remaining)->toBe(10.0);
    expect((float) $ing->fresh()->stock_quantity)->toBe(12.0);
});
