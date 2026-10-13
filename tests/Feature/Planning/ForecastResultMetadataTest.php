<?php

use App\Models\ForecastModelEvaluation;
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

it('does not invent metrics or origins without evaluation', function () {
    $this->actingAs(posAdmin())->get('/planning/evaluation')
        ->assertInertia(fn ($page) => $page
            ->where('modelComparison.0.avg_mae', null)
            ->where('modelComparison.0.avg_rmse', null)
            ->where('modelComparison.0.avg_wape', null)
            ->where('modelComparison.0.origins_count', 0)
        );
});

it('supports nullable error metrics and status on forecast model evaluations', function () {
    $category = MenuCategory::create(['name' => 'Trà', 'description' => 'Trà']);
    $item = MenuItem::create([
        'category_id' => $category->id,
        'name' => 'Trà sen',
        'price' => 30000,
        'vat_rate' => 0.0,
        'is_available' => true,
    ]);

    $run = ForecastRun::create([
        'kind' => 'evaluate',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    $evaluation = ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'parameters' => ['window' => 7],
        'mae' => null,
        'rmse' => null,
        'wape' => null,
        'origins_evaluated' => 0,
        'is_selected' => false,
        'status' => 'skipped',
        'reason' => 'Chuỗi dữ liệu quá ngắn',
    ]);

    expect($evaluation->mae)->toBeNull()
        ->and($evaluation->rmse)->toBeNull()
        ->and($evaluation->wape)->toBeNull()
        ->and($evaluation->status)->toBe('skipped')
        ->and($evaluation->reason)->toBe('Chuỗi dữ liệu quá ngắn');
});

it('supports nullable forecast quantity and status metadata on product forecasts', function () {
    $category = MenuCategory::create(['name' => 'Bánh', 'description' => 'Bánh']);
    $item = MenuItem::create([
        'category_id' => $category->id,
        'name' => 'Bánh mì pate',
        'price' => 20000,
        'vat_rate' => 0.0,
        'is_available' => true,
    ]);

    $run = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    $forecast = ProductForecast::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'forecast_date' => now()->addDay()->toDateString(),
        'forecast_quantity' => null,
        'lower_bound' => null,
        'upper_bound' => null,
        'model_key' => null,
        'status' => 'unavailable',
        'bound_method' => null,
        'bound_percentage' => null,
        'data_quality' => 'insufficient',
        'data_cutoff' => now()->startOfDay(),
    ]);

    expect($forecast->forecast_quantity)->toBeNull()
        ->and($forecast->status)->toBe('unavailable')
        ->and($forecast->model_key)->toBeNull();
});
