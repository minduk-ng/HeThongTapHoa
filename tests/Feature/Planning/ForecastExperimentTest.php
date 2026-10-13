<?php

use App\Jobs\Planning\RunForecastExperiment;
use App\Models\ForecastExperiment;
use App\Models\ForecastRun;
use App\Services\Forecasting\ForecastOrchestrator;
use App\Services\Forecasting\ForecastRunFactory;
use App\Services\Forecasting\PlanningSnapshot;
use App\Services\Forecasting\SyntheticDatasetBuilder;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    config(['forecasting.synthetic_enabled' => true]);
    $this->seed(AuthorizationSeeder::class);
});

it('dispatches batch forecast experiment job when authorized', function () {
    Queue::fake();

    $admin = posAdmin();
    $item = posMenuItem();

    $response = $this->actingAs($admin)->post('/planning/experiments', [
        'presets' => ['stable'],
        'seeds' => [42, 43],
        'horizons' => [7],
        'days' => 90,
        'menu_item_ids' => [$item->id],
    ]);

    $response->assertCreated();

    Queue::assertPushed(RunForecastExperiment::class);

    $experiment = ForecastExperiment::first();
    expect($experiment)->not->toBeNull()
        ->and($experiment->status)->toBe('queued')
        ->and($experiment->configuration['summary']['total'])->toBe(2);
});

it('executes experiment cells and tracks completed progress', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $experiment = ForecastExperiment::create([
        'configuration' => [
            'presets' => ['stable'],
            'seeds' => [101, 102],
            'horizons' => [7],
            'days' => 90,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
            'summary' => [
                'total' => 2,
                'completed' => 0,
                'failed' => 0,
            ],
        ],
        'status' => 'queued',
        'created_by' => $admin->id,
    ]);

    $job = new RunForecastExperiment($experiment);
    $job->handle(
        app(SyntheticDatasetBuilder::class),
        app(ForecastRunFactory::class),
        app(ForecastOrchestrator::class),
        app(PlanningSnapshot::class)
    );

    $experiment->refresh();
    expect($experiment->status)->toBe('completed')
        ->and($experiment->configuration['summary']['completed'])->toBe(2);

    expect(ForecastRun::where('experiment_id', $experiment->id)->count())->toBe(4); // 2 eval + 2 forecast runs

    $countBefore = ForecastRun::where('experiment_id', $experiment->id)->count();
    $retryJob = new RunForecastExperiment($experiment->fresh());
    $retryJob->handle(
        app(SyntheticDatasetBuilder::class),
        app(ForecastRunFactory::class),
        app(ForecastOrchestrator::class),
        app(PlanningSnapshot::class)
    );
    expect(ForecastRun::where('experiment_id', $experiment->id)->count())->toBe($countBefore);
});

it('fails cells with clear reason when dataset is too short for 3 origins', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $experiment = ForecastExperiment::create([
        'configuration' => [
            'presets' => ['stable'],
            'seeds' => [201],
            'horizons' => [7],
            'days' => 60,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
            'summary' => ['total' => 1, 'completed' => 0, 'failed' => 0],
        ],
        'status' => 'queued',
        'created_by' => $admin->id,
    ]);

    $job = new RunForecastExperiment($experiment);
    $job->handle(
        app(SyntheticDatasetBuilder::class),
        app(ForecastRunFactory::class),
        app(ForecastOrchestrator::class),
        app(PlanningSnapshot::class)
    );

    $experiment->refresh();
    expect($experiment->configuration['summary']['failed'])->toBe(1)
        ->and($experiment->configuration['cells']['stable:201:7']['error'])->toContain('Dataset too short');
});
