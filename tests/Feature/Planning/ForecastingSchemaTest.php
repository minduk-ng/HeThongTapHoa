<?php

use App\Models\DailyProductDemand;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\InventoryRecommendation;
use App\Models\Invoice;
use App\Models\ProcurementPlan;
use App\Models\ProcurementPlanItem;
use App\Models\ProductForecast;
use App\Models\Supplier;
use App\Models\SyntheticDataset;
use Illuminate\Database\QueryException;

it('stores real and synthetic forecast sources without mixing them', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'weekly-demo',
        'seed' => 42,
        'configuration' => ['days' => 120],
        'configuration_hash' => hash('sha256', '{"days":120}'),
        'generator_version' => '1',
        'dataset_hash' => str_repeat('a', 64),
    ]);

    $real = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'queued',
    ]);
    $synthetic = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'queued',
        'synthetic_dataset_id' => $dataset->id,
    ]);

    expect($real->sourceScope())->toBe(['synthetic_dataset_id' => null])
        ->and($synthetic->sourceScope())->toBe(['synthetic_dataset_id' => $dataset->id]);
});

it('enforces uniqueness on daily_product_demands for synthetic dataset item and date', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'demand-set',
        'seed' => 1,
        'configuration' => ['days' => 30],
        'configuration_hash' => hash('sha256', '30'),
        'generator_version' => '1',
        'dataset_hash' => str_repeat('b', 64),
    ]);
    $item = posMenuItem();
    $date = now()->toDateString();

    DailyProductDemand::create([
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'demand_date' => $date,
        'quantity' => 10,
    ]);

    expect(fn () => DailyProductDemand::create([
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'demand_date' => $date,
        'quantity' => 15,
    ]))->toThrow(QueryException::class);
});

it('enforces uniqueness on product_forecasts for run item and date', function () {
    $run = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'completed',
    ]);
    $item = posMenuItem();
    $date = now()->addDay()->toDateString();

    ProductForecast::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'forecast_date' => $date,
        'forecast_quantity' => 12.5,
        'model_key' => 'sma_7',
    ]);

    expect(fn () => ProductForecast::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'forecast_date' => $date,
        'forecast_quantity' => 14.0,
        'model_key' => 'sma_14',
    ]))->toThrow(QueryException::class);
});

it('enforces uniqueness on forecast_model_evaluations for run item and model_key', function () {
    $run = ForecastRun::create([
        'kind' => 'evaluate',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'completed',
    ]);
    $item = posMenuItem();

    ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'mae' => 1.25,
        'rmse' => 1.80,
        'wape' => 8.5,
    ]);

    expect(fn () => ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'mae' => 2.00,
        'rmse' => 2.50,
        'wape' => 10.0,
    ]))->toThrow(QueryException::class);
});

it('enforces uniqueness on inventory_recommendations for run and ingredient', function () {
    $run = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'completed',
    ]);
    $ingredient = Ingredient::create([
        'code' => 'ING-TEST-1',
        'name' => 'Nguyên liệu 1',
        'unit' => 'kg',
        'stock_quantity' => 10,
        'min_stock_alert' => 5,
        'cost_price' => 10000,
    ]);

    InventoryRecommendation::create([
        'forecast_run_id' => $run->id,
        'ingredient_id' => $ingredient->id,
        'demand_quantity' => 20,
        'stock_quantity' => 10,
        'reserved_quantity' => 0,
        'safety_stock' => 5,
        'reorder_point' => 15,
        'raw_quantity' => 20,
        'after_moq_quantity' => 20,
        'final_quantity' => 20,
        'suggested_quantity' => 20,
        'method' => 'eoq',
        'unit' => 'kg',
        'purchase_unit' => 'kg',
        'bom_hash' => hash('sha256', 'bom'),
        'policy_hash' => hash('sha256', 'policy'),
    ]);

    expect(fn () => InventoryRecommendation::create([
        'forecast_run_id' => $run->id,
        'ingredient_id' => $ingredient->id,
        'demand_quantity' => 25,
        'stock_quantity' => 10,
        'reserved_quantity' => 0,
        'safety_stock' => 5,
        'reorder_point' => 15,
        'raw_quantity' => 25,
        'after_moq_quantity' => 25,
        'final_quantity' => 25,
        'suggested_quantity' => 25,
        'method' => 'eoq',
        'unit' => 'kg',
        'purchase_unit' => 'kg',
        'bom_hash' => hash('sha256', 'bom'),
        'policy_hash' => hash('sha256', 'policy'),
    ]))->toThrow(QueryException::class);
});

it('enforces one recommendation per procurement plan', function () {
    $ingredient = Ingredient::create([
        'code' => 'ING-TEST-2',
        'name' => 'Nguyên liệu 2',
        'unit' => 'kg',
        'stock_quantity' => 10,
        'min_stock_alert' => 5,
        'cost_price' => 10000,
    ]);
    $recommendation = planningRecommendation($ingredient, suggestedQuantity: 30);
    $plan = ProcurementPlan::create([
        'plan_code' => 'PLAN-001',
        'status' => 'draft',
    ]);

    ProcurementPlanItem::create([
        'procurement_plan_id' => $plan->id,
        'inventory_recommendation_id' => $recommendation->id,
        'ingredient_id' => $ingredient->id,
        'suggested_quantity' => 30,
        'final_quantity' => 30,
        'unit' => 'kg',
    ]);

    expect(fn () => ProcurementPlanItem::create([
        'procurement_plan_id' => $plan->id,
        'inventory_recommendation_id' => $recommendation->id,
        'ingredient_id' => $ingredient->id,
        'suggested_quantity' => 30,
        'final_quantity' => 30,
        'unit' => 'kg',
    ]))->toThrow(QueryException::class);
});

it('links invoice to synthetic dataset via foreign key', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'invoice-set',
        'seed' => 10,
        'configuration' => ['days' => 7],
        'configuration_hash' => hash('sha256', '7'),
        'generator_version' => '1',
        'dataset_hash' => str_repeat('c', 64),
    ]);

    $invoice = Invoice::create([
        'invoice_code' => 'INV-SYN-001',
        'payment_method' => 'cash',
        'amount_received' => 50000,
        'total_amount' => 50000,
        'synthetic_dataset_id' => $dataset->id,
    ]);

    expect($invoice->fresh()->synthetic_dataset_id)->toBe($dataset->id)
        ->and($invoice->syntheticDataset?->id)->toBe($dataset->id);
});

it('establishes relations across forecasting and core models', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'rel-set',
        'seed' => 99,
        'configuration' => ['days' => 14],
        'configuration_hash' => hash('sha256', '14'),
        'generator_version' => '1',
        'dataset_hash' => str_repeat('d', 64),
    ]);

    $run = ForecastRun::create([
        'synthetic_dataset_id' => $dataset->id,
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    $item = posMenuItem();
    $supplier = Supplier::create([
        'name' => 'NCC Nông sản',
        'phone' => '0987654321',
        'is_active' => true,
    ]);
    $ingredient = Ingredient::create([
        'code' => 'ING-TEST-REL',
        'name' => 'Nguyên liệu Quan hệ',
        'unit' => 'hop',
        'stock_quantity' => 50,
        'min_stock_alert' => 10,
        'cost_price' => 20000,
    ]);

    $policy = IngredientSupplierPolicy::create([
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'is_primary' => true,
        'lead_days' => 3,
        'moq' => 10,
        'order_multiple' => 5,
        'pack_size' => 1,
        'ordering_cost' => 50000,
        'annual_holding_cost' => 5000,
    ]);

    $forecast = ProductForecast::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'forecast_date' => now()->addDay()->toDateString(),
        'forecast_quantity' => 20,
        'model_key' => 'sma_7',
    ]);

    $evaluation = ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'mae' => 1.5,
        'rmse' => 2.0,
        'wape' => 10.0,
        'is_selected' => true,
    ]);

    $recommendation = InventoryRecommendation::create([
        'forecast_run_id' => $run->id,
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'demand_quantity' => 40,
        'stock_quantity' => 50,
        'reserved_quantity' => 0,
        'safety_stock' => 10,
        'reorder_point' => 25,
        'raw_quantity' => 0,
        'after_moq_quantity' => 0,
        'final_quantity' => 0,
        'suggested_quantity' => 0,
        'method' => 'eoq',
        'unit' => 'hop',
        'purchase_unit' => 'hop',
        'bom_hash' => hash('sha256', 'bom'),
        'policy_hash' => hash('sha256', 'policy'),
    ]);

    $plan = ProcurementPlan::create([
        'plan_code' => 'PLAN-REL-01',
        'supplier_id' => $supplier->id,
        'forecast_run_id' => $run->id,
        'status' => 'draft',
    ]);

    $planItem = ProcurementPlanItem::create([
        'procurement_plan_id' => $plan->id,
        'inventory_recommendation_id' => $recommendation->id,
        'ingredient_id' => $ingredient->id,
        'supplier_id' => $supplier->id,
        'suggested_quantity' => 10,
        'final_quantity' => 10,
        'unit' => 'hop',
    ]);

    expect($run->syntheticDataset?->id)->toBe($dataset->id)
        ->and($run->productForecasts)->toHaveCount(1)
        ->and($run->modelEvaluations)->toHaveCount(1)
        ->and($run->recommendations)->toHaveCount(1)
        ->and($forecast->menuItem->id)->toBe($item->id)
        ->and($evaluation->menuItem->id)->toBe($item->id)
        ->and($ingredient->supplierPolicies)->toHaveCount(1)
        ->and($supplier->policies)->toHaveCount(1)
        ->and($recommendation->ingredient->id)->toBe($ingredient->id)
        ->and($recommendation->supplier?->id)->toBe($supplier->id)
        ->and($plan->items)->toHaveCount(1)
        ->and($planItem->recommendation?->id)->toBe($recommendation->id)
        ->and($item->forecasts)->toHaveCount(1)
        ->and($item->modelEvaluations)->toHaveCount(1);
});

it('verifies planning helper defaults', function () {
    $run = planningForecastRun();
    expect($run->kind)->toBe('forecast')
        ->and($run->horizon_days)->toBe(7)
        ->and($run->status)->toBe('completed')
        ->and($run->is_active)->toBeTrue();

    $ingredient = Ingredient::create([
        'code' => 'ING-HELPER',
        'name' => 'Nguyên liệu Helper',
        'unit' => 'g',
        'stock_quantity' => 100,
        'min_stock_alert' => 20,
        'cost_price' => 500,
    ]);

    $rec = planningRecommendation($ingredient, suggestedQuantity: 24);
    expect($rec->suggested_quantity)->toEqual(24.0)
        ->and($rec->final_quantity)->toEqual(24.0)
        ->and($rec->method)->toBe('eoq')
        ->and($rec->stock_quantity)->toEqual(100.0)
        ->and($rec->bom_hash)->toBeString()
        ->and($rec->policy_hash)->toBeString()
        ->and($rec->forecastRun->is_active)->toBeTrue();
});

it('loads forecasting configuration defaults', function () {
    expect(config('forecasting.synthetic_enabled'))->toBeFalse()
        ->and(config('forecasting.windows'))->toBe([7, 14, 28])
        ->and(config('forecasting.horizons.default'))->toBe(7);
});
