<?php

use App\Models\DailyProductDemand;
use App\Models\ForecastRun;
use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\InventoryRecommendation;
use App\Models\ProductForecast;
use App\Models\ProductRecipe;
use App\Models\Supplier;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\InventoryRecommendationBuilder;
use App\Services\Forecasting\PlanningSnapshot;
use App\Services\Forecasting\RecommendationFreshness;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    config(['forecasting.synthetic_enabled' => true]);
    $this->seed(AuthorizationSeeder::class);
});

it('calculates lead demand as exact sum of daily forecast across lead time days', function () {
    $item = posMenuItem();

    $ingredient = Ingredient::create([
        'code' => 'ING-LEAD',
        'name' => 'Bột trà matcha',
        'unit' => 'g',
        'stock_quantity' => 10.0,
        'cost_price' => 100.0,
        'purchase_unit' => 'g',
        'unit_conversion' => 1.0,
    ]);

    ProductRecipe::create([
        'menu_item_id' => $item->id,
        'ingredient_id' => $ingredient->id,
        'amount' => 1.0,
        'unit' => 'g',
    ]);

    $supplier = Supplier::create(['name' => 'Supplier Matcha', 'phone' => '0912345678', 'is_active' => true]);

    IngredientSupplierPolicy::create([
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'lead_days' => 2, // 2 days lead time
        'is_preferred' => true,
        'is_primary' => true,
        'service_factor' => 1.65,
        'ordering_cost' => 50000,
        'annual_holding_cost' => 100,
    ]);

    $run = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => null,
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    // Daily forecasts: Day 1 = 10, Day 2 = 40, Day 3..7 = 5
    $dailyQuantities = [10.0, 40.0, 5.0, 5.0, 5.0, 5.0, 5.0];
    for ($d = 1; $d <= 7; $d++) {
        ProductForecast::create([
            'forecast_run_id' => $run->id,
            'menu_item_id' => $item->id,
            'forecast_date' => now()->addDays($d)->toDateString(),
            'forecast_quantity' => $dailyQuantities[$d - 1],
            'model_key' => 'sma_7',
            'status' => 'available',
            'data_quality' => 'sufficient',
            'data_cutoff' => now()->startOfDay(),
        ]);
    }

    $builder = app(InventoryRecommendationBuilder::class);
    $builder->build($run);

    $rec = InventoryRecommendation::where('forecast_run_id', $run->id)
        ->where('ingredient_id', $ingredient->id)
        ->first();

    expect($rec)->not->toBeNull()
        ->and($rec->explanation)->toBeArray()
        // Day 1 (10) + Day 2 (40) = exactly 50.0
        ->and((float) $rec->explanation['lead_demand'])->toBe(50.0);
});

it('ensures synthetic recommendations remain fresh despite live stock mutations in DB', function () {
    $item = posMenuItem();
    $ingredient = Ingredient::create([
        'code' => 'ING-SYNTH-SNAP',
        'name' => 'Cà phê hạt',
        'unit' => 'g',
        'stock_quantity' => 100.0,
        'cost_price' => 50.0,
        'purchase_unit' => 'g',
        'unit_conversion' => 1.0,
    ]);

    ProductRecipe::create([
        'menu_item_id' => $item->id,
        'ingredient_id' => $ingredient->id,
        'amount' => 15.0,
        'unit' => 'g',
    ]);

    $dataset = SyntheticDataset::create([
        'name' => 'Snapshot Replay Dataset',
        'seed' => 999,
        'configuration' => ['days' => 30],
        'configuration_hash' => 'h',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'dh',
        'status' => 'completed',
    ]);

    $snapshot = app(PlanningSnapshot::class)->capture();

    $run = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => $dataset->id,
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
        'configuration' => [
            'snapshot' => $snapshot,
        ],
    ]);

    for ($d = 1; $d <= 7; $d++) {
        ProductForecast::create([
            'forecast_run_id' => $run->id,
            'menu_item_id' => $item->id,
            'forecast_date' => now()->addDays($d)->toDateString(),
            'forecast_quantity' => 10.0,
            'model_key' => 'sma_7',
            'status' => 'available',
            'data_quality' => 'sufficient',
            'data_cutoff' => now()->startOfDay(),
        ]);
    }

    $builder = app(InventoryRecommendationBuilder::class);
    $builder->build($run);

    $rec = InventoryRecommendation::where('forecast_run_id', $run->id)
        ->where('ingredient_id', $ingredient->id)
        ->first();

    expect($rec)->not->toBeNull();
    // Recommendation is fresh initially
    RecommendationFreshness::assertFresh($rec);
    expect(true)->toBeTrue();

    // Mutate live DB stock
    $ingredient->update(['stock_quantity' => 9999.0]);

    // Recommendation MUST still be considered fresh because it is an immutable synthetic replay
    RecommendationFreshness::assertFresh($rec);
    expect($rec->fresh()->status)->toBe('pending');
});

it('converts historical demand to ingredient units before computing stddev', function () {
    $item = posMenuItem();
    $ingredient = Ingredient::create([
        'code' => 'ING-SIGMA', 'name' => 'Bột sigma', 'unit' => 'g', 'stock_quantity' => 5.0,
        'cost_price' => 10.0, 'purchase_unit' => 'g', 'unit_conversion' => 1.0,
    ]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 20.0, 'unit' => 'g']);
    $cutoff = now()->subDay()->startOfDay();
    DailyProductDemand::create([
        'synthetic_dataset_id' => null, 'menu_item_id' => $item->id, 'demand_date' => $cutoff->copy()->subDay()->toDateString(),
        'quantity' => 1.0, 'refunded_quantity' => 0.0, 'order_count' => 1,
    ]);
    DailyProductDemand::create([
        'synthetic_dataset_id' => null, 'menu_item_id' => $item->id, 'demand_date' => $cutoff->toDateString(),
        'quantity' => 3.0, 'refunded_quantity' => 0.0, 'order_count' => 1,
    ]);
    $run = ForecastRun::create([
        'kind' => 'forecast', 'synthetic_dataset_id' => null, 'horizon_days' => 7,
        'data_cutoff' => $cutoff, 'status' => 'completed', 'is_active' => true,
    ]);
    for ($d = 1; $d <= 7; $d++) {
        ProductForecast::create([
            'forecast_run_id' => $run->id, 'menu_item_id' => $item->id,
            'forecast_date' => $cutoff->copy()->addDays($d)->toDateString(),
            'forecast_quantity' => 10.0, 'model_key' => 'naive', 'status' => 'available',
            'data_quality' => 'sufficient', 'data_cutoff' => $cutoff,
        ]);
    }
    app(InventoryRecommendationBuilder::class)->build($run);
    $rec = InventoryRecommendation::where('forecast_run_id', $run->id)->where('ingredient_id', $ingredient->id)->firstOrFail();
    expect((float) $rec->explanation['daily_demand_stddev'])->toEqualWithDelta(sqrt(800.0), 1e-4)
        ->and($rec->explanation['stddev_unit'])->toBe('g');
});

it('blocks recommendations when lead time exceeds horizon or forecasts are unavailable', function () {
    $item = posMenuItem();
    $ingredient = Ingredient::create([
        'code' => 'ING-BLOCK', 'name' => 'Bột block', 'unit' => 'g', 'stock_quantity' => 5.0,
        'cost_price' => 10.0, 'purchase_unit' => 'g', 'unit_conversion' => 1.0,
    ]);
    ProductRecipe::create(['menu_item_id' => $item->id, 'ingredient_id' => $ingredient->id, 'amount' => 1.0, 'unit' => 'g']);
    $supplier = Supplier::create(['name' => 'NCC Block', 'phone' => '0900000001', 'is_active' => true]);
    IngredientSupplierPolicy::create([
        'ingredient_id' => $ingredient->id, 'supplier_id' => $supplier->id,
        'lead_days' => 10, 'is_primary' => true, 'service_factor' => 1.65,
    ]);
    $cutoff = now()->subDay()->startOfDay();
    $run = ForecastRun::create([
        'kind' => 'forecast', 'synthetic_dataset_id' => null, 'horizon_days' => 7,
        'data_cutoff' => $cutoff, 'status' => 'completed', 'is_active' => true,
    ]);
    for ($d = 1; $d <= 7; $d++) {
        ProductForecast::create([
            'forecast_run_id' => $run->id, 'menu_item_id' => $item->id,
            'forecast_date' => $cutoff->copy()->addDays($d)->toDateString(),
            'forecast_quantity' => $d === 3 ? null : 10.0,
            'model_key' => $d === 3 ? null : 'naive',
            'status' => $d === 3 ? 'unavailable' : 'available',
            'data_quality' => 'sufficient', 'data_cutoff' => $cutoff,
        ]);
    }
    app(InventoryRecommendationBuilder::class)->build($run);
    expect(InventoryRecommendation::where('forecast_run_id', $run->id)->where('ingredient_id', $ingredient->id)->count())->toBe(0);
});
