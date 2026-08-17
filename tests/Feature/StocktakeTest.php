<?php

test('kiem ke: nhap actual khac ly thuyet tao phiếu adjustment + cap nhat stock', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create(['name' => 'Kk '.uniqid(), 'code' => 'kk'.uniqid(), 'unit' => 'g', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 100]);

    $this->actingAs($admin)->post('/manager/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 7]],
    ])->assertSessionHasNoErrors();

    expect($ing->fresh()->stock_quantity)->toBe(7.0);
    $v = \App\Models\StockVoucher::where('type', 'adjustment')->first();
    expect($v)->not->toBeNull();
    expect((float) $v->items()->first()->quantity)->toBe(-3.0);
});

test('kiem ke: actual bang ly thuyet khong tao phieu', function () {
    $admin = posAdmin();
    $ing = \App\Models\Ingredient::create(['name' => 'Kk0 '.uniqid(), 'code' => 'kk0'.uniqid(), 'unit' => 'g', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 100]);
    $this->actingAs($admin)->post('/manager/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 10]],
    ])->assertSessionHasNoErrors();
    expect(\App\Models\StockVoucher::where('type', 'adjustment')->count())->toBe(0);
});
