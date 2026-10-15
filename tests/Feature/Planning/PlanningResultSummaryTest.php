<?php

use App\Models\ForecastRun;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ProductForecast;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);
});

it('does not claim sufficient stock for a completed run with no evidence', function () {
    ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(), 'status' => 'completed', 'is_active' => true,
    ]);
    $this->actingAs(posAdmin())->get('/planning/procurement')
        ->assertInertia(fn ($page) => $page
            ->where('resultSummary.empty_reason', 'missing_forecasts')
            ->where('resultSummary.recommendation_count', 0));
});

it('keeps original counts through filters and pagination', function () {
    $category = MenuCategory::create(['name' => 'Coffee']);
    $item = MenuItem::create(['category_id' => $category->id, 'name' => 'Coffee', 'price' => 25, 'is_available' => true]);
    $run = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(), 'status' => 'completed', 'is_active' => true,
    ]);
    ProductForecast::create([
        'forecast_run_id' => $run->id, 'menu_item_id' => $item->id,
        'forecast_date' => now()->addDay(), 'forecast_quantity' => 15,
        'model_key' => 'sma_7', 'data_quality' => 'sufficient', 'data_cutoff' => now(),
    ]);
    $this->actingAs(posAdmin())->get('/planning/products?search=unmatched')
        ->assertInertia(fn ($page) => $page
            ->where('resultSummary.unfiltered_product_count', 1)
            ->where('resultSummary.available_product_count', 1)
            ->where('resultSummary.empty_reason', 'no_recommendation_evidence')
            ->where('products.total', 0));
    $this->get('/planning/products?page=99&search=Coffee&horizon_days=7')
        ->assertInertia(fn ($page) => $page
            ->where('resultSummary.unfiltered_product_count', 1)
            ->where('products.total', 1)->has('products.data', 0)
            ->where('products.first_page_url', fn ($url) => str_contains($url, 'search=Coffee') && str_contains($url, 'horizon_days=7')));
});

it('reports missing and attempted runs without making attempts active', function ($path, $status, $reason) {
    if ($status !== null) {
        ForecastRun::create([
            'kind' => 'forecast', 'horizon_days' => 7, 'data_cutoff' => now(),
            'status' => $status, 'is_active' => false,
        ]);
    }
    $this->actingAs(posAdmin())->get($path)
        ->assertInertia(fn ($page) => $page
            ->where('activeRun', null)
            ->where('resultSummary.latest_run_status', $status)
            ->where('resultSummary.empty_reason', $reason));
})->with(['/planning', '/planning/products', '/planning/procurement'])
    ->with([[null, 'no_run'], ['queued', 'running'], ['running', 'running'], ['failed', 'failed']]);

it('isolates source kind and requested horizon while preserving completed results', function ($path) {
    $dataset = \App\Models\SyntheticDataset::create([
        'name' => 'Summary fixture', 'seed' => 1, 'configuration' => [],
        'configuration_hash' => 'fixture', 'generator_version' => 'test', 'dataset_hash' => 'fixture',
    ]);
    $run = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7, 'data_cutoff' => now(),
        'status' => 'completed', 'is_active' => true,
    ]);
    ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7, 'data_cutoff' => now(),
        'status' => 'failed', 'is_active' => false,
    ]);
    ForecastRun::create([
        'kind' => 'evaluate', 'horizon_days' => 7, 'data_cutoff' => now(),
        'status' => 'running', 'is_active' => false,
    ]);
    ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 30, 'data_cutoff' => now(),
        'status' => 'queued', 'is_active' => false,
    ]);
    $syntheticRun = ForecastRun::create([
        'synthetic_dataset_id' => $dataset->id,
        'kind' => 'forecast', 'horizon_days' => 7, 'data_cutoff' => now(),
        'status' => 'stale', 'is_active' => true,
    ]);
    $this->actingAs(posAdmin())->get($path.'?horizon_days=7')
        ->assertInertia(fn ($page) => $page
            ->where('activeRun.id', $run->id)
            ->where('resultSummary.latest_run_status', 'failed')
            ->where('resultSummary.empty_reason', 'missing_forecasts'));
    $this->get($path.'?horizon_days=30')
        ->assertInertia(fn ($page) => $page
            ->where('activeRun.id', $run->id)
            ->where('resultSummary.latest_run_status', 'queued')
            ->where('resultSummary.matching_horizon', false)
            ->where('resultSummary.empty_reason', 'horizon_mismatch'));
    $this->get($path.'?horizon_days=7&synthetic_dataset_id='.$dataset->id)
        ->assertInertia(fn ($page) => $page
            ->where('activeRun.id', $syntheticRun->id)
            ->where('resultSummary.latest_run_status', 'stale'));
})->with(['/planning', '/planning/products', '/planning/procurement']);

it('counts distinct available products and persisted recommendations without writes', function () {
    $run = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7, 'data_cutoff' => now(),
        'status' => 'stale', 'is_active' => true,
    ]);
    $category = MenuCategory::create(['name' => 'Coffee']);
    $item = MenuItem::create(['category_id' => $category->id, 'name' => 'Coffee', 'price' => 25]);
    foreach ([null, 0, 5] as $day => $quantity) {
        ProductForecast::create([
            'forecast_run_id' => $run->id, 'menu_item_id' => $item->id,
            'forecast_date' => now()->addDays($day + 1), 'forecast_quantity' => $quantity,
            'status' => $quantity === null ? 'unavailable' : 'available',
            'model_key' => 'sma_7', 'data_quality' => 'limited', 'data_cutoff' => now(),
        ]);
    }
    $ingredient = \App\Models\Ingredient::create(['name' => 'Beans', 'code' => 'SUMMARY-BEANS', 'unit' => 'kg']);
    \App\Models\InventoryRecommendation::create([
        'forecast_run_id' => $run->id, 'ingredient_id' => $ingredient->id,
        'demand_quantity' => 1, 'stock_quantity' => 10, 'safety_stock' => 1,
        'reorder_point' => 2, 'final_quantity' => 0, 'suggested_quantity' => 0,
        'unit' => 'kg', 'purchase_unit' => 'kg', 'bom_hash' => 'fixture',
    ]);
    $queries = [];
    \Illuminate\Support\Facades\DB::listen(function ($query) use (&$queries) { $queries[] = $query->sql; });
    $summary = app(\App\Services\Forecasting\PlanningResultSummary::class)->forRun($run, $run, 7);
    expect($summary)->toMatchArray([
        'unfiltered_product_count' => 1, 'available_product_count' => 1,
        'recommendation_count' => 1, 'positive_recommendation_count' => 0, 'empty_reason' => null,
    ]);
    expect($queries)->not->toBeEmpty();
    foreach ($queries as $query) {
        expect(strtolower(ltrim($query)))->toStartWith('select');
    }
});

it('does not count unavailable or null quantities as usable forecasts', function ($quantity, $status) {
    $run = ForecastRun::create([
        'kind' => 'forecast', 'horizon_days' => 7, 'data_cutoff' => now(),
        'status' => 'completed', 'is_active' => true,
    ]);
    $category = MenuCategory::create(['name' => 'Coffee']);
    $item = MenuItem::create(['category_id' => $category->id, 'name' => 'Coffee', 'price' => 25]);
    ProductForecast::create([
        'forecast_run_id' => $run->id, 'menu_item_id' => $item->id,
        'forecast_date' => now()->addDay(), 'forecast_quantity' => $quantity, 'status' => $status,
        'model_key' => 'sma_7', 'data_quality' => 'insufficient', 'data_cutoff' => now(),
    ]);
    $this->actingAs(posAdmin())->get('/planning/procurement')
        ->assertInertia(fn ($page) => $page
            ->where('resultSummary.unfiltered_product_count', 1)
            ->where('resultSummary.available_product_count', 0)
            ->where('resultSummary.empty_reason', 'missing_forecasts'));
})->with([[null, 'available'], [10, 'unavailable']]);
