<?php

use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\SyntheticDataset;
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

it('exports manifest JSON and evidence CSV files from stored run artifacts', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $dataset = SyntheticDataset::create([
        'name' => 'Evidence Export Dataset',
        'seed' => 123,
        'configuration' => ['days' => 30],
        'configuration_hash' => 'h',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'dh',
        'status' => 'completed',
    ]);

    $run = ForecastRun::create([
        'kind' => 'evaluate',
        'synthetic_dataset_id' => $dataset->id,
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'parameters' => ['window' => 7],
        'mae' => 1.5,
        'rmse' => 2.0,
        'wape' => 8.5,
        'origins_evaluated' => 4,
        'is_selected' => true,
        'status' => 'evaluated',
        'validation_sums' => [
            'sum_abs_error' => 15.0,
            'sum_sq_error' => 30.0,
            'sum_actual' => 176.0,
            'scored_count' => 10,
        ],
    ]);

    // Test manifest JSON endpoint
    $manifestRes = $this->actingAs($admin)->get("/planning/runs/{$run->id}/exports/manifest.json");
    $manifestRes->assertOk()
        ->assertJsonPath('horizon_days', 7)
        ->assertJsonPath('kind', 'evaluate');

    // Test model metrics CSV endpoint
    $metricsRes = $this->actingAs($admin)->get("/planning/runs/{$run->id}/exports/model_metrics.csv");
    $metricsRes->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

    expect($metricsRes->streamedContent())->toContain('model_key')
        ->and($metricsRes->streamedContent())->toContain('sma_7');

    // Test 404 on disallowed export key
    $badRes = $this->actingAs($admin)->get("/planning/runs/{$run->id}/exports/passwords.txt");
    $badRes->assertNotFound();
});
