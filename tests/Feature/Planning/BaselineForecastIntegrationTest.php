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
    $this->seed(AuthorizationSeeder::class);
});

it('forecasts successfully when naive baseline was selected', function () {
    $item = posMenuItem();
    $dataset = SyntheticDataset::create([
        'name' => 'Baseline Win', 'seed' => 7, 'configuration' => ['days' => 30, 'start_date' => '2026-01-01'],
        'configuration_hash' => 'h', 'generator_version' => '2.0.0', 'dataset_hash' => 'd', 'status' => 'completed',
        'start_date' => '2026-01-01', 'end_date' => '2026-01-30',
    ]);
    $rows = [];
    for ($i = 0; $i < 30; $i++) {
        $rows[] = [
            'synthetic_dataset_id' => $dataset->id, 'menu_item_id' => $item->id,
            'date' => Carbon::parse('2026-01-01')->addDays($i)->toDateString(),
            'latent_demand' => 12.0, 'observed_sales' => 12.0,
            'is_open' => true, 'is_missing' => false, 'is_stockout' => false,
            'created_at' => now(), 'updated_at' => now(),
        ];
    }
    SyntheticObservation::insert($rows);

    $evalRun = ForecastRun::create([
        'kind' => 'evaluate', 'synthetic_dataset_id' => $dataset->id, 'horizon_days' => 7,
        'data_cutoff' => '2026-01-30', 'status' => 'completed', 'is_active' => true,
    ]);
    ForecastModelEvaluation::create([
        'forecast_run_id' => $evalRun->id, 'menu_item_id' => $item->id, 'model_key' => 'naive',
        'parameters' => [], 'mae' => 0.5, 'rmse' => 0.6, 'wape' => 4.0, 'origins_evaluated' => 3,
        'is_selected' => true, 'status' => 'evaluated',
    ]);

    $fcRun = ForecastRun::create([
        'kind' => 'forecast', 'synthetic_dataset_id' => $dataset->id, 'horizon_days' => 7,
        'data_cutoff' => '2026-01-30', 'status' => 'queued', 'is_active' => false,
    ]);

    app(ForecastOrchestrator::class)->run($fcRun);

    expect($fcRun->fresh()->status)->toBe('completed');
    $forecasts = ProductForecast::where('forecast_run_id', $fcRun->id)->where('menu_item_id', $item->id)->orderBy('forecast_date')->get();
    expect($forecasts)->toHaveCount(7);
    foreach ($forecasts as $f) {
        expect($f->model_key)->toBe('naive')
            ->and((float) $f->forecast_quantity)->toBe(12.0)
            ->and($f->status)->toBe('available');
    }
});
