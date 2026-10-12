<?php

use App\Models\SyntheticDataset;
use App\Services\Forecasting\ForecastRunFactory;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    config()->set('services.admin.email', 'admin@example.com');
    config()->set('services.admin.default_password', 'password123');
    $this->seed(AuthorizationSeeder::class);
});

it('defaults real data cutoff to yesterday in Asia/Ho_Chi_Minh', function () {
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-12 00:15:00', 'Asia/Ho_Chi_Minh'));

    $factory = app(ForecastRunFactory::class);
    $run = $factory->create('forecast', null, 7);

    expect($run->data_cutoff->toDateString())->toBe('2026-10-11')
        ->and($run->horizon_days)->toBe(7)
        ->and($run->kind)->toBe('forecast')
        ->and($run->synthetic_dataset_id)->toBeNull();
});

it('rejects operational cutoff that includes incomplete current or future day', function () {
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-12 00:15:00', 'Asia/Ho_Chi_Minh'));

    $factory = app(ForecastRunFactory::class);
    $factory->create('forecast', null, 7, '2026-10-12');
})->throws(InvalidArgumentException::class);

it('defaults synthetic dataset cutoff to dataset end date regardless of system clock', function () {
    Carbon::setTestNow(CarbonImmutable::parse('2026-10-12 00:15:00', 'Asia/Ho_Chi_Minh'));

    $admin = posAdmin();
    $dataset = SyntheticDataset::create([
        'name' => 'Historical 84-day dataset',
        'description' => 'Test dataset',
        'seed' => 1234,
        'configuration' => [
            'start_date' => '2026-01-01',
            'days' => 84,
        ],
        'configuration_hash' => hash('sha256', 'cfg'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'data'),
        'created_by' => $admin->id,
    ]);

    $factory = app(ForecastRunFactory::class);
    $run = $factory->create('forecast', $dataset->id, 7);

    // 2026-01-01 + 83 days = 2026-03-25
    expect($run->data_cutoff->toDateString())->toBe('2026-03-25')
        ->and($run->synthetic_dataset_id)->toBe($dataset->id);
});

it('rejects synthetic cutoff outside dataset date range', function () {
    $admin = posAdmin();
    $dataset = SyntheticDataset::create([
        'name' => 'Dataset for range test',
        'description' => 'Test dataset',
        'seed' => 1234,
        'configuration' => [
            'start_date' => '2026-01-01',
            'days' => 84,
        ],
        'configuration_hash' => hash('sha256', 'cfg'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'data'),
        'created_by' => $admin->id,
    ]);

    $factory = app(ForecastRunFactory::class);
    $factory->create('forecast', $dataset->id, 7, '2026-04-01');
})->throws(InvalidArgumentException::class);

it('rejects unsupported horizon days', function (int $horizon) {
    $factory = app(ForecastRunFactory::class);
    $factory->create('forecast', null, $horizon);
})->with([0, 8, 14, 45])->throws(InvalidArgumentException::class);
