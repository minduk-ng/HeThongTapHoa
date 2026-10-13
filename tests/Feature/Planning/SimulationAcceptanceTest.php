<?php

use App\Jobs\Planning\RunForecastExperiment;
use App\Models\ForecastExperiment;
use App\Models\ForecastRun;
use App\Services\Forecasting\ForecastEvidenceExporter;
use App\Services\Forecasting\ForecastOrchestrator;
use App\Services\Forecasting\ForecastRunFactory;
use App\Services\Forecasting\PlanningSnapshot;
use App\Services\Forecasting\SyntheticDatasetBuilder;
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

it('runs simulation acceptance matrix across presets, seeds and horizons with evidence', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $presets = ['stable', 'weekly_seasonal', 'trend_seasonal', 'intermittent', 'level_shift', 'data_stress'];
    $seeds = [1, 2];
    $horizons = [7, 30];

    $experiment = ForecastExperiment::create([
        'configuration' => [
            'presets' => $presets,
            'seeds' => $seeds,
            'horizons' => $horizons,
            'days' => 150,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
            'summary' => ['total' => 24, 'completed' => 0, 'failed' => 0],
        ],
        'status' => 'queued',
        'created_by' => $admin->id,
    ]);

    $started = microtime(true);
    $job = new RunForecastExperiment($experiment);
    $job->handle(
        app(SyntheticDatasetBuilder::class),
        app(ForecastRunFactory::class),
        app(ForecastOrchestrator::class),
        app(PlanningSnapshot::class)
    );
    $elapsed = round(microtime(true) - $started, 2);

    $experiment->refresh();
    $summary = $experiment->configuration['summary'];

    expect($summary['completed'])->toBe(24)
        ->and($summary['failed'])->toBe(0)
        ->and($experiment->status)->toBe('completed');

    expect(ForecastRun::where('experiment_id', $experiment->id)->where('status', 'completed')->count())->toBe(48);

    $exporter = app(ForecastEvidenceExporter::class);
    $sampleRun = ForecastRun::where('experiment_id', $experiment->id)->where('kind', 'evaluate')->firstOrFail();
    $manifest = $exporter->manifest($sampleRun);
    expect($manifest['versions']['generator_version'])->not->toBe('unknown-legacy')
        ->and($manifest['protocol']['target'])->toBe('observed_sales');

    fwrite(STDERR, "\n[acceptance-matrix] 24 cells completed in {$elapsed}s\n");
})->group('acceptance');
