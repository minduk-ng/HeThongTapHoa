<?php

use App\Models\ForecastCheck;
use App\Services\Forecasting\ForecastCheckService;
use Tests\TestCase;

uses(TestCase::class);

it('calculates single origin forecast check strictly leak-free and mathematically exact', function () {
    $service = app(ForecastCheckService::class);

    // 14 days of history (Jan 1 to Jan 14), target week Jan 15 to Jan 21 (cutoff Jan 14)
    $observations = [];
    for ($d = 1; $d <= 14; $d++) {
        $date = sprintf('2026-01-%02d', $d);
        $observations[] = [
            'date' => $date,
            'observed_sales' => 10.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    // Target 7 days (Jan 15 to Jan 21):
    // Day 15: actual 10.0
    // Day 16: actual 0.0 (open day with 0 sales)
    // Day 17..21: missing observations (should not be scored)
    $targetActuals = [
        ['date' => '2026-01-15', 'observed_sales' => 10.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
        ['date' => '2026-01-16', 'observed_sales' => 0.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
        ['date' => '2026-01-17', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
        ['date' => '2026-01-18', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
        ['date' => '2026-01-19', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
        ['date' => '2026-01-20', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
        ['date' => '2026-01-21', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
    ];

    $snapshot = [
        'dataset' => ['id' => 1, 'name' => 'Demo DS'],
        'item' => ['id' => 5, 'name' => 'Tea'],
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'timezone' => 'Asia/Ho_Chi_Minh',
        'versions' => ForecastCheck::VERSIONS,
        'observations' => array_merge($observations, $targetActuals),
    ];

    $result = $service->calculate($snapshot);

    expect($result)->toHaveKeys(['history', 'actuals', 'training', 'candidates', 'default_model_key', 'best_model_keys', 'scored_count'])
        ->and($result['scored_count'])->toBe(2)
        ->and($result['candidates'])->toHaveCount(7);

    // Naive model forecast on constant 10.0 history produces [10.0, 10.0, ...]
    $naive = collect($result['candidates'])->firstWhere('model_key', 'naive');
    expect($naive)->not->toBeNull()
        ->and($naive['status'])->toBe('evaluated')
        ->and($naive['scored_count'])->toBe(2)
        // Day 15: actual 10, pred 10, error 0
        // Day 16: actual 0, pred 10, error 10
        // MAE = (0 + 10) / 2 = 5.0
        ->and($naive['mae'])->toBe(5.0)
        // RMSE = sqrt((0^2 + 10^2)/2) = sqrt(50) = 7.0711
        ->and($naive['rmse'])->toEqualWithDelta(sqrt(50), 1e-4)
        // WAPE = (0 + 10) / (10 + 0) * 100 = 100.0%
        ->and($naive['wape'])->toBe(100.0)
        ->and($naive['observed_total'])->toBe(10.0)
        ->and($naive['predicted_scored_total'])->toBe(20.0)
        ->and($naive['predicted_seven_day_total'])->toBe(70.0);

    // Verify points
    expect($naive['points'])->toHaveCount(7)
        ->and($naive['points'][0]['signed_error'])->toBe(0.0)
        ->and($naive['points'][1]['signed_error'])->toBe(10.0) // pred 10 - actual 0 = +10 (over-predicted)
        ->and($naive['points'][2]['scored'])->toBeFalse()
        ->and($naive['points'][2]['signed_error'])->toBeNull();

    // Leak-free check: mutating target actuals must NOT alter predictions
    $snapshotMutated = $snapshot;
    $snapshotMutated['observations'][14]['observed_sales'] = 999.0;
    $resultMutated = $service->calculate($snapshotMutated);
    $naiveMutated = collect($resultMutated['candidates'])->firstWhere('model_key', 'naive');
    expect($naiveMutated['predictions'])->toBe($naive['predictions']);
});

it('sets wape to null when sum of actuals is zero while keeping mae and rmse', function () {
    $service = app(ForecastCheckService::class);

    $observations = [];
    for ($d = 1; $d <= 14; $d++) {
        $observations[] = [
            'date' => sprintf('2026-01-%02d', $d),
            'observed_sales' => 5.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $targetZeroActuals = [];
    for ($d = 15; $d <= 21; $d++) {
        $targetZeroActuals[] = [
            'date' => sprintf('2026-01-%02d', $d),
            'observed_sales' => 0.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $snapshot = [
        'dataset' => ['id' => 1, 'name' => 'Demo DS'],
        'item' => ['id' => 5, 'name' => 'Tea'],
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'timezone' => 'Asia/Ho_Chi_Minh',
        'versions' => ForecastCheck::VERSIONS,
        'observations' => array_merge($observations, $targetZeroActuals),
    ];

    $result = $service->calculate($snapshot);
    $naive = collect($result['candidates'])->firstWhere('model_key', 'naive');

    expect($naive['wape'])->toBeNull()
        ->and($naive['mae'])->toBe(5.0)
        ->and($naive['rmse'])->toBe(5.0)
        ->and($result['ranking_metric'])->toBe('mae');
});

it('identifies tied best models within 1e-9 tolerance', function () {
    $service = app(ForecastCheckService::class);

    // Constant series: naive, seasonal_naive_7, and sma_7 all predict 10.0
    $observations = [];
    for ($d = 1; $d <= 21; $d++) {
        $observations[] = [
            'date' => sprintf('2026-01-%02d', $d),
            'observed_sales' => 10.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $snapshot = [
        'dataset' => ['id' => 1, 'name' => 'Demo DS'],
        'item' => ['id' => 5, 'name' => 'Tea'],
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'timezone' => 'Asia/Ho_Chi_Minh',
        'versions' => ForecastCheck::VERSIONS,
        'observations' => $observations,
    ];

    $result = $service->calculate($snapshot);

    // naive, seasonal_naive_7, sma_7, sma_14 all produce 0 error on constant series
    expect($result['best_model_keys'])->toContain('naive', 'seasonal_naive_7', 'sma_7', 'sma_14')
        ->and($result['default_model_key'])->toBe('seasonal_naive_7');
});
