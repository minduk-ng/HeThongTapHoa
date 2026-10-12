<?php

use App\Services\Forecasting\RollingOriginEvaluator;
use Carbon\Carbon;
use Tests\TestCase;

uses(TestCase::class);

it('enforces leak-free validation and holdout separation', function () {
    $evaluator = app(RollingOriginEvaluator::class);

    // 120 days of synthetic observations (56 init + origins + 7 holdout)
    $rows = [];
    for ($i = 0; $i < 120; $i++) {
        $rows[] = [
            'date' => Carbon::parse('2026-01-01')->addDays($i)->toDateString(),
            'observed_sales' => 20.0 + ($i % 7),
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $res1 = $evaluator->evaluateObservations($rows, 7);

    expect($res1['can_reselect'])->toBeTrue()
        ->and($res1['selected'])->not->toBeNull()
        ->and($res1['origins_count'])->toBeGreaterThanOrEqual(3);

    // Mutate the final holdout days (last 7 days, indices 113..119) with extreme values
    $rowsMutatedHoldout = $rows;
    for ($i = 113; $i < 120; $i++) {
        $rowsMutatedHoldout[$i]['observed_sales'] = 99999.0;
    }

    $res2 = $evaluator->evaluateObservations($rowsMutatedHoldout, 7);

    // Selected model from validation MUST be identical (strictly leak-free)
    expect($res2['selected']['model_key'])->toBe($res1['selected']['model_key'])
        ->and($res2['selected']['mae'])->toBe($res1['selected']['mae'])
        ->and($res2['selected']['wape'])->toBe($res1['selected']['wape']);
});

it('selects at most 8 nearest origins for validation', function () {
    $evaluator = app(RollingOriginEvaluator::class);

    // 365 days of observations
    $rows = [];
    for ($i = 0; $i < 365; $i++) {
        $rows[] = [
            'date' => Carbon::parse('2026-01-01')->addDays($i)->toDateString(),
            'observed_sales' => 25.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $res = $evaluator->evaluateObservations($rows, 7, 56, 7, 8);

    expect($res['origins_count'])->toBe(8);

    // With 365 days and H=7: pre-holdout has 358 days.
    // Cutoffs are multiples of 7 starting from 56 (56, 63, ..., 350).
    $lastOrigin = end($res['origins']);
    expect($lastOrigin['cutoff'])->toBe(350); // 350 + 7 = 357 <= 358 (pre-holdout end)
});

it('rejects automatic model reselection when fewer than 3 valid origins exist', function () {
    $evaluator = app(RollingOriginEvaluator::class);

    // Only 65 days (56 init + 7 horizon = 63, gives only 1 origin + holdout)
    $rows = [];
    for ($i = 0; $i < 70; $i++) {
        $rows[] = [
            'date' => Carbon::parse('2026-01-01')->addDays($i)->toDateString(),
            'observed_sales' => 20.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $res = $evaluator->evaluateObservations($rows, 7);

    expect($res['can_reselect'])->toBeFalse()
        ->and($res['selected'])->toBeNull();
});
