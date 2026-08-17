<?php

use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\User;

test('report stock-movement tinh dung begin/import/export/end', function () {
    $this->actingAs(posAdmin());
    $ing = Ingredient::create(['name' => 'Bá»™t '.uniqid(), 'code' => 'bt'.uniqid(), 'unit' => 'kg', 'stock_quantity' => 8, 'min_stock_alert' => 2, 'cost_price' => 100]);

    $import = StockVoucher::create(['voucher_code' => 'PN-'.uniqid(), 'type' => 'import', 'transacted_at' => now()]);
    $import->items()->create(['ingredient_id' => $ing->id, 'quantity' => 5, 'unit_price' => 100]);

    $export = StockVoucher::create(['voucher_code' => 'PX-'.uniqid(), 'type' => 'export', 'transacted_at' => now()]);
    $export->items()->create(['ingredient_id' => $ing->id, 'quantity' => -3, 'unit_price' => null]);

    $res = $this->get('/reports/stock-movement');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page
        ->component('reports/StockMovementReport', false)
        ->where('rows.0.import_qty', 5)
        ->where('rows.0.export_qty', 3)
        ->where('rows.0.adjust_qty', 0)
        ->where('rows.0.end_qty', 8)
        ->where('rows.0.begin_qty', 6)
    );
});

test('report stock-movement loc theo from/to', function () {
    $this->actingAs(posAdmin());
    $ing = Ingredient::create(['name' => 'CÃ  '.uniqid(), 'code' => 'ca'.uniqid(), 'unit' => 'g', 'stock_quantity' => 10, 'min_stock_alert' => 2, 'cost_price' => 100]);

    $old = StockVoucher::create(['voucher_code' => 'PN-'.uniqid(), 'type' => 'import', 'transacted_at' => '2026-06-01 10:00:00']);
    $old->items()->create(['ingredient_id' => $ing->id, 'quantity' => 4, 'unit_price' => 100]);

    $new = StockVoucher::create(['voucher_code' => 'PN-'.uniqid(), 'type' => 'import', 'transacted_at' => '2026-07-15 10:00:00']);
    $new->items()->create(['ingredient_id' => $ing->id, 'quantity' => 6, 'unit_price' => 100]);

    $res = $this->get('/reports/stock-movement?start_date=2026-07-01&end_date=2026-07-31');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->where('rows.0.import_qty', 6));
});

test('report stock-movement nguoi dung khong co quyen bi tu choi', function () {
    $this->actingAs(User::factory()->create())->get('/reports/stock-movement')->assertStatus(403);
});

