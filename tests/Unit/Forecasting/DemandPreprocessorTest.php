<?php

use App\Services\Forecasting\DemandPreprocessor;
use Tests\TestCase;

uses(TestCase::class);

it('imputes missing observations causally from past calendar weeks', function () {
    $preprocessor = new DemandPreprocessor;

    // Day 1 (Monday): 10
    // Day 2 (Tuesday): null (missing)
    // Day 3 (Wednesday): 20
    $rows = [
        ['date' => '2026-01-05', 'observed_sales' => 10.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
        ['date' => '2026-01-06', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
        ['date' => '2026-01-07', 'observed_sales' => 20.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
    ];

    $res1 = $preprocessor->prepare($rows, '2026-01-07');

    expect($res1['values'])->toHaveCount(3)
        ->and($res1['values'][0])->toBe(10.0)
        ->and($res1['values'][1])->toBe(10.0) // Imputed from Day 1 (preceding 7-day average)
        ->and($res1['values'][2])->toBe(20.0);

    // Changing Day 3 (future relative to Day 2) must NOT change Day 2 imputed value (strictly causal)
    $rowsMutatedFuture = [
        ['date' => '2026-01-05', 'observed_sales' => 10.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
        ['date' => '2026-01-06', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
        ['date' => '2026-01-07', 'observed_sales' => 999.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
    ];

    $res2 = $preprocessor->prepare($rowsMutatedFuture, '2026-01-07');
    expect($res2['values'][1])->toBe($res1['values'][1]);
});

it('prefers same weekday observations within past 28 days for imputation', function () {
    $preprocessor = new DemandPreprocessor;

    // 2026-01-05: Monday, sales 30
    // 2026-01-06 to 2026-01-11: sales 10
    // 2026-01-12: Monday, missing
    $rows = [];
    $rows[] = ['date' => '2026-01-05', 'observed_sales' => 30.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false];
    for ($d = 6; $d <= 11; $d++) {
        $rows[] = ['date' => sprintf('2026-01-%02d', $d), 'observed_sales' => 10.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false];
    }
    $rows[] = ['date' => '2026-01-12', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false];

    $res = $preprocessor->prepare($rows, '2026-01-12');

    // On 2026-01-12 (Monday, index 7), same weekday within 28 days is 2026-01-05 (Monday, 30.0), not the immediate preceding days (10.0)
    expect($res['values'][7])->toBe(30.0)
        ->and($res['counts']['imputed'])->toBe(1);
});

it('drops leading unfillable missing days and flags counts correctly', function () {
    $preprocessor = new DemandPreprocessor;

    $rows = [
        ['date' => '2026-01-01', 'observed_sales' => null, 'is_open' => true, 'is_missing' => true, 'is_stockout' => false],
        ['date' => '2026-01-02', 'observed_sales' => 15.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
        ['date' => '2026-01-03', 'observed_sales' => 20.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
    ];

    $res = $preprocessor->prepare($rows, '2026-01-03');

    expect($res['values'])->toBe([15.0, 20.0])
        ->and($res['counts']['dropped_leading'])->toBe(1);
});
