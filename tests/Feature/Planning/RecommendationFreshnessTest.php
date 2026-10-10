<?php

use App\Models\ForecastRun;
use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\Supplier;
use App\Services\Forecasting\RecommendationFreshness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;

uses(RefreshDatabase::class);

it('assertFresh passes for fresh recommendation with active run and unchanged stock and bom', function () {
    $ingredient = Ingredient::create([
        'code' => 'FRESH-1', 'name' => 'Nguyên liệu tươi', 'unit' => 'kg',
        'stock_quantity' => 50, 'min_stock_alert' => 10, 'cost_price' => 10000,
    ]);
    $rec = planningRecommendation($ingredient, suggestedQuantity: 20);

    expect(fn () => RecommendationFreshness::assertFresh($rec))->not->toThrow(ValidationException::class);
});

it('assertFresh throws ValidationException when forecast run is inactive', function () {
    $ingredient = Ingredient::create([
        'code' => 'FRESH-2', 'name' => 'Nguyên liệu 2', 'unit' => 'kg',
        'stock_quantity' => 50, 'min_stock_alert' => 10, 'cost_price' => 10000,
    ]);
    $run = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => false,
    ]);
    $rec = planningRecommendation($ingredient, 20, ['forecast_run_id' => $run->id]);

    expect(fn () => RecommendationFreshness::assertFresh($rec))->toThrow(ValidationException::class);
});

it('assertFresh throws ValidationException when ingredient stock changed since snapshot', function () {
    $ingredient = Ingredient::create([
        'code' => 'FRESH-3', 'name' => 'Nguyên liệu 3', 'unit' => 'kg',
        'stock_quantity' => 50, 'min_stock_alert' => 10, 'cost_price' => 10000,
    ]);
    $rec = planningRecommendation($ingredient, suggestedQuantity: 20);

    $ingredient->update(['stock_quantity' => 40]);

    expect(fn () => RecommendationFreshness::assertFresh($rec))->toThrow(ValidationException::class);
});

it('assertFresh throws ValidationException when recipe bom changed', function () {
    $ingredient = Ingredient::create([
        'code' => 'FRESH-4', 'name' => 'Nguyên liệu 4', 'unit' => 'g',
        'stock_quantity' => 100, 'min_stock_alert' => 10, 'cost_price' => 1000,
    ]);
    $rec = planningRecommendation($ingredient, 50, [
        'bom_hash' => hash('sha256', 'old-bom'),
    ]);

    expect(fn () => RecommendationFreshness::assertFresh($rec))->toThrow(ValidationException::class);
});

it('assertFresh throws ValidationException when supplier policy updated after snapshot', function () {
    $supplier = Supplier::create(['name' => 'NCC Rau', 'phone' => '0903333444']);
    $ingredient = Ingredient::create([
        'code' => 'FRESH-5', 'name' => 'Rau xanh', 'unit' => 'kg',
        'stock_quantity' => 30, 'min_stock_alert' => 5, 'cost_price' => 5000,
    ]);
    $policy = IngredientSupplierPolicy::create([
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'is_primary' => true,
        'lead_days' => 1,
        'moq' => 5,
        'order_multiple' => 1,
        'pack_size' => 1,
        'ordering_cost' => 10000,
        'annual_holding_cost' => 500,
        'policy_hash' => hash('sha256', 'policy-initial'),
    ]);

    $rec = planningRecommendation($ingredient, 10, [
        'supplier_id' => $supplier->id,
        'policy_hash' => hash('sha256', 'policy-initial'),
        'stock_snapshot_at' => now()->subHour(),
    ]);

    // Update policy after snapshot
    $policy->update([
        'policy_hash' => hash('sha256', 'policy-updated'),
        'updated_at' => now(),
    ]);

    expect(fn () => RecommendationFreshness::assertFresh($rec))->toThrow(ValidationException::class);
});
