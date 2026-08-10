<?php

use App\Models\Ingredient;

test('ingredient co cot purchase_unit va unit_conversion', function () {
    expect(\Illuminate\Support\Facades\Schema::hasColumns('ingredients', ['purchase_unit', 'unit_conversion']))->toBeTrue();
});

test('store ingredient luu purchase_unit va unit_conversion', function () {
    $admin = posAdmin();

    $this->actingAs($admin)->post('/manager/inventory/ingredients', [
        'name' => 'Cà phê hạt '.uniqid(),
        'unit' => 'g',
        'purchase_unit' => 'kg',
        'unit_conversion' => 1000,
        'stock_quantity' => 0,
        'min_stock_alert' => 50,
        'cost_price' => 0,
    ])->assertRedirect();

    $ing = Ingredient::latest()->first();
    expect($ing->purchase_unit)->toBe('kg');
    expect((float) $ing->unit_conversion)->toBe(1000.0);
});

test('update ingredient cap nhat purchase_unit va unit_conversion', function () {
    $admin = posAdmin();
    $ing = Ingredient::create(['code' => 'cafe', 'name' => 'Cà phê '.uniqid(), 'unit' => 'g', 'stock_quantity' => 0, 'cost_price' => 0]);

    $this->actingAs($admin)->post('/manager/inventory/ingredients/'.$ing->id, [
        'name' => $ing->name,
        'unit' => 'g',
        'purchase_unit' => 'l',
        'unit_conversion' => 1000,
        'stock_quantity' => 0,
        'min_stock_alert' => 50,
        'cost_price' => 0,
    ])->assertRedirect();

    expect($ing->fresh()->purchase_unit)->toBe('l');
    expect((float) $ing->fresh()->unit_conversion)->toBe(1000.0);
});
