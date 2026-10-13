<?php

use App\Models\ForecastEvaluationPoint;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
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

it('persists point-by-point validation and holdout evidence during model evaluation', function () {
    $item = posMenuItem();
    $dataset = SyntheticDataset::create([
        'name' => '100-day dataset for evidence test',
        'seed' => 42,
        'configuration' => [
            'days' => 100,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
        ],
        'configuration_hash' => hash('sha256', 'cfg'),
        'generator_version' => '2.0.0',
        'dataset_hash' => hash('sha256', 'dh'),
        'status' => 'completed',
    ]);

    $obs = [];
    for ($i = 0; $i < 100; $i++) {
        $obs[] = [
            'synthetic_dataset_id' => $dataset->id,
            'menu_item_id' => $item->id,
            'date' => Carbon::parse('2026-01-01')->addDays($i)->toDateString(),
            'latent_demand' => 20.0 + ($i % 7),
            'observed_sales' => 20.0 + ($i % 7),
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
    SyntheticObservation::insert($obs);

    $cutoff = Carbon::parse('2026-01-01')->addDays(99);

    $run = ForecastRun::create([
        'kind' => 'evaluate',
        'synthetic_dataset_id' => $dataset->id,
        'horizon_days' => 7,
        'data_cutoff' => $cutoff,
        'status' => 'queued',
        'is_active' => false,
    ]);

    app(ForecastOrchestrator::class)->run($run);

    $run->refresh();
    expect($run->status)->toBe('completed')
        ->and($run->is_active)->toBeTrue();

    // Verify evaluation records
    $evals = ForecastModelEvaluation::where('forecast_run_id', $run->id)->get();
    expect($evals)->not->toBeEmpty();

    $selectedEval = $evals->firstWhere('is_selected', true);
    expect($selectedEval)->not->toBeNull()
        ->and($selectedEval->origins_evaluated)->toBeGreaterThanOrEqual(3)
        ->and($selectedEval->validation_sums)->not->toBeNull()
        ->and($selectedEval->validation_sums['scored_count'])->toBeGreaterThan(0);

    // Verify evaluation points
    $points = ForecastEvaluationPoint::where('forecast_run_id', $run->id)->get();
    expect($points)->not->toBeEmpty();

    $valPoints = $points->where('stage', 'validation');
    $holdoutPoints = $points->where('stage', 'holdout');

    expect($valPoints->count())->toBeGreaterThan(0)
        ->and($holdoutPoints->count())->toBeGreaterThan(0);

    // Check holdout origin date is right before holdout slice
    $sampleHoldout = $holdoutPoints->first();
    expect($sampleHoldout->origin_date->toDateString())->toBe(Carbon::parse('2026-01-01')->addDays(92)->toDateString());
});
