<?php

use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\ProductRecipe;
use App\Models\User;

test('report consumption tinh dung luong tieu thu va chi phi', function () {
    $this->actingAs(posAdmin());
    $ing = Ingredient::create(['name' => 'Trà '.uniqid(), 'code' => 'tra'.uniqid(), 'unit' => 'g', 'stock_quantity' => 1000, 'min_stock_alert' => 100, 'cost_price' => 50]);
    $item = posMenuItem();
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ing->id, 'amount' => 20, 'unit' => 'g']);

    $invoice = Invoice::create([
        'invoice_code' => 'HD-'.uniqid(), 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 60000, 'change_amount' => 0, 'total_amount' => 60000,
    ]);
    $invoice->lines()->create(['menu_item_id' => $item->id, 'name_snapshot' => $item->name, 'quantity' => 3, 'unit_price' => 20000, 'subtotal' => 60000]);

    $res = $this->get('/reports/consumption');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page
        ->component('reports/ConsumptionReport', false)
        ->where('rows.0.name', $ing->name)
        ->where('rows.0.quantity', 60)
        ->where('rows.0.cost', 3000)
    );
});

test('report consumption khong tinh hoa don ngoai ky', function () {
    $this->actingAs(posAdmin());
    $ing = Ingredient::create(['name' => 'Sữa '.uniqid(), 'code' => 'sua'.uniqid(), 'unit' => 'ml', 'stock_quantity' => 1000, 'min_stock_alert' => 100, 'cost_price' => 10]);
    $item = posMenuItem();
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ing->id, 'amount' => 30, 'unit' => 'ml']);

    $invoice = Invoice::create([
        'invoice_code' => 'HD-'.uniqid(), 'table_name' => 'B01', 'payment_method' => 'cash',
        'amount_received' => 40000, 'change_amount' => 0, 'total_amount' => 40000,
    ]);
    $line = $invoice->lines()->create(['menu_item_id' => $item->id, 'name_snapshot' => $item->name, 'quantity' => 2, 'unit_price' => 20000, 'subtotal' => 40000]);
    $line->forceFill(['created_at' => '2026-06-01 10:00:00'])->save();

    $res = $this->get('/reports/consumption?from=2026-07-01&to=2026-07-31');
    $res->assertOk();
    $res->assertInertia(fn ($page) => $page->where('rows', []));
});

test('report consumption nguoi dung khong co quyen bi tu choi', function () {
    $this->actingAs(User::factory()->create())->get('/reports/consumption')->assertStatus(403);
});
