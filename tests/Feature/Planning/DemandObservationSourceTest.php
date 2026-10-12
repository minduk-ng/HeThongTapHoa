<?php

use App\Models\SyntheticDataset;
use App\Models\SyntheticObservation;
use App\Services\Forecasting\DemandSeriesBuilder;
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

it('extracts canonical observation rows for synthetic dataset without arbitrary limit', function () {
    $item = posMenuItem();
    $dataset = SyntheticDataset::create([
        'name' => '150-day dataset',
        'seed' => 42,
        'configuration' => ['days' => 150, 'start_date' => '2026-01-01'],
        'configuration_hash' => hash('sha256', 'cfg'),
        'generator_version' => '2.0.0',
        'dataset_hash' => hash('sha256', 'dh'),
        'status' => 'completed',
    ]);

    $obsData = [];
    for ($i = 0; $i < 150; $i++) {
        $obsData[] = [
            'synthetic_dataset_id' => $dataset->id,
            'menu_item_id' => $item->id,
            'date' => Carbon::parse('2026-01-01')->addDays($i)->toDateString(),
            'latent_demand' => 20.0,
            'observed_sales' => 20.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
    SyntheticObservation::insert($obsData);

    $builder = app(DemandSeriesBuilder::class);
    $rows = $builder->observations($item->id, $dataset->id, '2026-01-01', '2026-05-30');

    expect($rows)->toHaveCount(150)
        ->and($rows[0]['observed_sales'])->toBe(20.0);
});
