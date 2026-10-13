<?php

use App\Models\SyntheticDataset;
use App\Models\SyntheticObservation;
use App\Services\Forecasting\SyntheticDatasetBuilder;
use App\Services\Forecasting\SyntheticDemandGenerator;
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

it('persists synthetic observations as canonical source of truth with data flags', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $config = [
        'start_date' => '2026-01-01',
        'days' => 14,
        'menu_item_ids' => [$item->id],
        'base' => 20,
        'noise' => 0.0,
        'missing_rate' => 0.2,
        'stockout_censor_rate' => 0.2,
    ];

    $dataset = SyntheticDataset::create([
        'name' => 'Observations Test Dataset',
        'seed' => 42,
        'configuration' => $config,
        'configuration_hash' => hash('sha256', 'cfg'),
        'generator_version' => SyntheticDemandGenerator::VERSION,
        'dataset_hash' => hash('sha256', 'init'),
        'status' => 'queued',
        'created_by' => $admin->id,
    ]);

    app(SyntheticDatasetBuilder::class)->build($dataset);

    $dataset->refresh();
    expect($dataset->status)->toBe('completed')
        ->and($dataset->start_date?->toDateString())->toBe('2026-01-01')
        ->and($dataset->end_date?->toDateString())->toBe('2026-01-14');

    $observations = SyntheticObservation::where('synthetic_dataset_id', $dataset->id)->get();
    expect($observations)->toHaveCount(14);

    foreach ($observations as $obs) {
        expect($obs->menu_item_id)->toBe($item->id)
            ->and($obs->latent_demand)->toBeGreaterThanOrEqual(0.0);

        if ($obs->is_missing) {
            expect($obs->observed_sales)->toBeNull();
        } else {
            expect($obs->observed_sales)->not->toBeNull();
            if ($obs->is_stockout) {
                expect((float) $obs->observed_sales)->toBeLessThanOrEqual((float) $obs->latent_demand);
            }
        }
    }
});

it('cascades deletion of synthetic observations when dataset is deleted', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $dataset = SyntheticDataset::create([
        'name' => 'Cascade Test Dataset',
        'seed' => 101,
        'configuration' => [
            'start_date' => '2026-01-01',
            'days' => 5,
            'menu_item_ids' => [$item->id],
        ],
        'configuration_hash' => hash('sha256', 'cfg2'),
        'generator_version' => SyntheticDemandGenerator::VERSION,
        'dataset_hash' => hash('sha256', 'init2'),
        'status' => 'queued',
        'created_by' => $admin->id,
    ]);

    app(SyntheticDatasetBuilder::class)->build($dataset);

    expect(SyntheticObservation::where('synthetic_dataset_id', $dataset->id)->count())->toBe(5);

    $dataset->delete();

    expect(SyntheticObservation::where('synthetic_dataset_id', $dataset->id)->count())->toBe(0);
});
