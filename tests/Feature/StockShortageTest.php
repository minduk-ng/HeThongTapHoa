<?php

use App\Models\Ingredient;
use App\Models\ProductRecipe;
use App\Models\StockVoucher;

test('checkout thieu nguyen lieu tra 422 va khong ghi gi', function () {
    $admin = posAdmin();
    $coffee = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 10000]);
    $v = StockVoucher::create(['voucher_code' => 'PN-SH-'.uniqid(), 'type' => 'import', 'transacted_at' => now()]);
    $v->items()->create(['ingredient_id' => $coffee->id, 'quantity' => 30, 'unit_price' => 10000, 'quantity_remaining' => 30]);

    $item = posMenuItem(['price' => 50000, 'vat_rate' => 0]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $coffee->id, 'amount' => 25, 'unit' => 'g']);
    $table = posTable();
    $order = posOrder($table, [['item' => $item, 'qty' => 2, 'price' => 50000, 'status' => 'completed']], ['status' => 'pending']);

    $this->actingAs($admin)->postJson('/staff/pos/checkout', [
        'order_id' => $order->id,
        'payment_method' => 'cash',
        'amount_received' => 100000,
    ])->assertStatus(422);

    expect((float) $coffee->fresh()->stock_quantity)->toBe(0.0);
    expect(StockVoucher::where('type', 'export')->count())->toBe(0);
    expect($order->fresh()->status)->toBe('pending');
});
