<?php

use App\Models\ForecastExperiment;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\ForecastEvidenceExporter;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;

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

it('exports experiment multi-seed summary CSV with mean and sample stddev without confidence interval labels', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $experiment = ForecastExperiment::create([
        'configuration' => [
            'presets' => ['stable'],
            'seeds' => [1, 2],
            'horizons' => [7],
        ],
        'status' => 'completed',
        'created_by' => $admin->id,
    ]);

    $run1 = ForecastRun::create([
        'experiment_id' => $experiment->id,
        'cell_key' => 'stable:1:7',
        'kind' => 'evaluate',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => false,
    ]);

    ForecastModelEvaluation::create([
        'forecast_run_id' => $run1->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'parameters' => ['window' => 7],
        'mae' => 2.0,
        'rmse' => 3.0,
        'wape' => 10.0,
        'origins_evaluated' => 3,
        'is_selected' => true,
        'status' => 'evaluated',
    ]);

    $run2 = ForecastRun::create([
        'experiment_id' => $experiment->id,
        'cell_key' => 'stable:2:7',
        'kind' => 'evaluate',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => false,
    ]);

    ForecastModelEvaluation::create([
        'forecast_run_id' => $run2->id,
        'menu_item_id' => $item->id,
        'model_key' => 'sma_7',
        'parameters' => ['window' => 7],
        'mae' => 4.0,
        'rmse' => 5.0,
        'wape' => 20.0,
        'origins_evaluated' => 3,
        'is_selected' => true,
        'status' => 'evaluated',
    ]);

    $res = $this->actingAs($admin)->get("/planning/experiments/{$experiment->id}/exports/summary.csv");
    $res->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

    $csv = $res->streamedContent();
    // Headers check: does not label as confidence interval
    expect($csv)->toContain('preset,horizon,model_key,stage,target,runs_count,mean_mae,stddev_mae,mean_rmse,stddev_rmse,mean_wape,stddev_wape')
        ->and($csv)->not->toContain('confidence_interval')
        ->and($csv)->toContain('stable')
        ->and($csv)->toContain('sma_7');

    // Values check: mean_mae = (2+4)/2 = 3.0, stddev_mae = sqrt(((2-3)^2 + (4-3)^2)/1) = sqrt(2) ≈ 1.414214
    expect($csv)->toContain('3')
        ->and($csv)->toContain('1.414214');
});

it('persists complete acceptance matrix artifacts to disk before teardown', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $experiment = ForecastExperiment::create([
        'configuration' => [
            'presets' => ['stable'],
            'seeds' => [1],
            'horizons' => [7],
        ],
        'status' => 'completed',
        'created_by' => $admin->id,
    ]);

    $run = ForecastRun::create([
        'experiment_id' => $experiment->id,
        'cell_key' => 'stable:1:7',
        'kind' => 'evaluate',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'completed',
        'is_active' => false,
    ]);

    ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id,
        'menu_item_id' => $item->id,
        'model_key' => 'naive',
        'mae' => 1.0,
        'rmse' => 1.5,
        'wape' => 5.0,
        'origins_evaluated' => 3,
        'is_selected' => true,
        'status' => 'evaluated',
    ]);

    $exporter = app(ForecastEvidenceExporter::class);
    $tempDir = storage_path("app/testing-forecasting-artifacts-{$experiment->id}");
    $savedDir = $exporter->persistExperimentArtifacts($experiment, $tempDir);

    expect(File::isDirectory($savedDir))->toBeTrue()
        ->and(File::exists("{$savedDir}/manifest.json"))->toBeTrue()
        ->and(File::exists("{$savedDir}/summary.csv"))->toBeTrue();

    // Clean up temp directory
    File::deleteDirectory($tempDir);
});
