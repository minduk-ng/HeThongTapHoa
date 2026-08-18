<?php

use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;
use App\Services\Inventory\LotService;

test('invariant: stock_quantity bang SUM(quantity_remaining) sau import, kiem ke, sua tay', function () {
    $admin = posAdmin();

    // 1. Tạo nguyên liệu có tồn đầu kỳ qua API → phải có lô
    $this->actingAs($admin)->post('/manager/inventory/ingredients', [
        'name' => 'Reconcile '.uniqid(),
        'unit' => 'g',
        'stock_quantity' => 100,
        'min_stock_alert' => 10,
        'cost_price' => 1000,
    ])->assertSessionHasNoErrors();

    $ing = Ingredient::latest('id')->first();
    expect((float) $ing->stock_quantity)->toBe(100.0);
    expect(LotService::totalRemaining($ing->id))->toBe(100.0);

    // 2. Kiểm kê tăng → lô phải khớp
    $this->actingAs($admin)->post('/manager/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 120]],
    ])->assertSessionHasNoErrors();
    expect(LotService::totalRemaining($ing->id))->toBe(120.0);

    // 3. Kiểm kê giảm → lô phải khớp
    $this->actingAs($admin)->post('/manager/inventory/stocktake', [
        'items' => [['ingredient_id' => $ing->id, 'actual_qty' => 80]],
    ])->assertSessionHasNoErrors();
    expect(LotService::totalRemaining($ing->id))->toBe(80.0);

    // 4. Sửa thủ công stock_quantity → lô phải khớp
    $this->actingAs($admin)->post('/manager/inventory/ingredients/'.$ing->id, [
        'name' => $ing->name,
        'unit' => 'g',
        'stock_quantity' => 65,
        'min_stock_alert' => 10,
        'cost_price' => 1000,
    ])->assertSessionHasNoErrors();
    expect(LotService::totalRemaining($ing->id))->toBe(65.0);
});

test('stock:init-lots tao lo ton dau ky cho nguyen lieu chi co stock_quantity', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['code' => 'bf'.uniqid(), 'name' => 'Backfill '.uniqid(), 'unit' => 'g', 'stock_quantity' => 250, 'min_stock_alert' => 5, 'cost_price' => 100]);

    $this->artisan('stock:init-lots')->assertSuccessful();

    expect(LotService::totalRemaining($ing->id))->toBe(250.0);
    $v = StockVoucher::where('note', 'Tồn đầu kỳ (backfill)')->first();
    expect($v)->not->toBeNull();
    expect(StockVoucherItem::where('ingredient_id', $ing->id)->where('quantity_remaining', 250)->exists())->toBeTrue();
});
