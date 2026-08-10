<?php

use App\Models\Ingredient;
use App\Models\ProductRecipe;
use App\Models\StockVoucher;

test('checkout tao phieu xuat tu dong voi luong am aggregate', function () {
    $admin = posAdmin();
    $coffee = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000, 'cost_price' => 10000]);
    $sugar = Ingredient::create(['code' => 'duong', 'name' => 'Đường '.uniqid(), 'unit' => 'g', 'stock_quantity' => 500, 'cost_price' => 5000]);
    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $coffee->id, 'amount' => 25, 'unit' => 'g']);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $sugar->id, 'amount' => 10, 'unit' => 'g']);

    // 2 order cùng bàn, mỗi order 2 ly cà phê → tổng 4 ly
    $table = posTable();
    $order1 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);
    $order2 = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/bulk-checkout', [
        'order_ids' => [$order1->id, $order2->id],
        'table_id' => $table->id,
        'payment_method' => 'cash',
        'amount_received' => 400000,
    ])->assertOk()->assertJson(['success' => true]);

    $voucher = StockVoucher::where('type', 'export')->first();
    expect($voucher)->not->toBeNull();
    expect(str_starts_with($voucher->voucher_code, 'PX-'))->toBeTrue();
    expect($voucher->note)->toContain('Hoá đơn');

    // coffee: 4 ly × 25g = 100g → -100
    expect((float) $coffee->fresh()->stock_quantity)->toBe(900.0);
    // sugar: 4 ly × 10g = 40g → -40
    expect((float) $sugar->fresh()->stock_quantity)->toBe(460.0);

    $coffeeItem = $voucher->items()->where('ingredient_id', $coffee->id)->first();
    expect((float) $coffeeItem->quantity)->toBe(-100.0);
    expect($coffeeItem->unit_price)->toBeNull();
});

test('checkout khong tao phieu xuat khi don khong co recipe', function () {
    $admin = posAdmin();
    $item = posMenuItem(['price' => 30000, 'vat_rate' => 0]);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 1, 'price' => 30000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 30000,
    ])->assertOk();

    expect(StockVoucher::where('type', 'export')->count())->toBe(0);
});
