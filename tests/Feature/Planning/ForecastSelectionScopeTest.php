<?php

use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\ProductForecast;
use App\Models\SyntheticDataset;
use App\Models\SyntheticObservation;
use App\Services\Forecasting\ForecastOrchestrator;
use Carbon\Carbon;
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

it('maintains independent active runs per horizon and source scope', function () {
    $runH7 = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => null,
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'queued',
        'is_active' => false,
    ]);

    $runH30 = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => null,
        'horizon_days' => 30,
        'data_cutoff' => now()->subDay(),
        'status' => 'queued',
        'is_active' => false,
    ]);

    $orchestrator = app(ForecastOrchestrator::class);
    $orchestrator->run($runH7);
    $orchestrator->run($runH30);

    // Both runs must remain active because their horizons differ
    expect($runH7->fresh()->is_active)->toBeTrue()
        ->and($runH30->fresh()->is_active)->toBeTrue();
});

it('scopes model evaluation selection by horizon and source dataset', function () {
    $item = posMenuItem();

    // Dataset A
    $datasetA = SyntheticDataset::create([
        'name' => 'Dataset A',
        'seed' => 1,
        'configuration' => ['days' => 60, 'start_date' => '2026-01-01'],
        'configuration_hash' => 'h1',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'd1',
    ]);

    // Dataset B
    $datasetB = SyntheticDataset::create([
        'name' => 'Dataset B',
        'seed' => 2,
        'configuration' => ['days' => 60, 'start_date' => '2026-01-01'],
        'configuration_hash' => 'h2',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'd2',
    ]);

    $evalRunA = ForecastRun::create([
        'kind' => 'evaluate',
        'synthetic_dataset_id' => $datasetA->id,
        'horizon_days' => 7,
        'data_cutoff' => Carbon::parse('2026-02-01'),
        'status' => 'completed',
        'is_active' => true,
    ]);

    ForecastModelEvaluation::create([
        'forecast_run_id' => $evalRunA->id,
        'menu_item_id' => $item->id,
        'model_key' => 'holt_winters_additive',
        'parameters' => ['period' => 7],
        'mae' => 1.2,
        'rmse' => 1.5,
        'wape' => 5.0,
        'origins_evaluated' => 4,
        'is_selected' => true,
        'status' => 'evaluated',
    ]);

    // Populate dataset B observations
    $obsB = [];
    for ($i = 0; $i < 60; $i++) {
        $obsB[] = [
            'synthetic_dataset_id' => $datasetB->id,
            'menu_item_id' => $item->id,
            'date' => Carbon::parse('2026-01-01')->addDays($i)->toDateString(),
            'latent_demand' => 15.0,
            'observed_sales' => 15.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
    SyntheticObservation::insert($obsB);

    // Run forecast for dataset B with horizon 7. Must NOT pick dataset A's evaluation!
    $forecastRunB = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => $datasetB->id,
        'horizon_days' => 7,
        'data_cutoff' => Carbon::parse('2026-02-01'),
        'status' => 'queued',
        'is_active' => false,
    ]);

    app(ForecastOrchestrator::class)->run($forecastRunB);

    $forecastB = ProductForecast::where('forecast_run_id', $forecastRunB->id)->first();
    expect($forecastB)->not->toBeNull()
        // Dataset B has no prior evaluation, so it should not pick dataset A's holt_winters_additive
        ->and($forecastB->model_key)->not->toBe('holt_winters_additive');
});
