<?php

use App\Models\Ingredient;

test('report inventory-value tra dung gia tri kho', function () {
    $this->actingAs(posAdmin());
    Ingredient::create(['name' => 'Nguyên liệu '.uniqid(), 'code' => 'nl'.uniqid(), 'unit' => 'kg', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 200]);

    $res = $this->get('/reports/inventory-value');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->component('reports/InventoryValueReport', false));
    $res->assertInertia(fn ($page) => $page->where('rows.0.value', 2000)->where('totalValue', 2000));
});

test('report low-stock chi lien nhung nguyen lieu thap', function () {
    $this->actingAs(posAdmin());
    Ingredient::create(['name' => 'Thấp '.uniqid(), 'code' => 'th'.uniqid(), 'unit' => 'g', 'stock_quantity' => 2, 'min_stock_alert' => 5, 'cost_price' => 100]);
    Ingredient::create(['name' => 'Đủ '.uniqid(), 'code' => 'du'.uniqid(), 'unit' => 'g', 'stock_quantity' => 50, 'min_stock_alert' => 5, 'cost_price' => 100]);

    $res = $this->get('/reports/low-stock');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->where('rows', fn ($rows) => count($rows) === 1));
    $res->assertInertia(fn ($page) => $page->where('rows.0.min_stock_alert', 5));
});

test('report expiring tra rows co id va days_left', function () {
    $this->actingAs(posAdmin());
    $ingredient = App\Models\Ingredient::create(['name' => 'HSD '.uniqid(), 'code' => 'hsd'.uniqid(), 'unit' => 'kg', 'stock_quantity' => 10, 'min_stock_alert' => 5, 'cost_price' => 100]);
    $voucher = App\Models\StockVoucher::create(['voucher_code' => 'PN-HSD-'.uniqid(), 'type' => 'import', 'transacted_at' => now()]);
    $voucher->items()->create(['ingredient_id' => $ingredient->id, 'quantity' => 10, 'quantity_remaining' => 8, 'expiry_date' => now()->addDays(30), 'unit_price' => 100]);

    $res = $this->get('/reports/expiring');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->where('rows.0.id', fn ($id) => is_int($id)));
    $res->assertInertia(fn ($page) => $page->where('rows.0.days_left', fn ($d) => is_int($d) && $d >= 28 && $d <= 30));
});
