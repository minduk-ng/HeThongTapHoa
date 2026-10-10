<?php

use App\Services\Forecasting\RollingOriginEvaluator;

it('never passes observations after the origin into model fitting', function () {
    $spy = new class
    {
        /** @var array<int, int> */
        public array $trainingLengths = [];

        /** @param array<int, float|int> $series */
        public function forecast(array $series, array $parameters, int $horizon): array
        {
            $this->trainingLengths[] = count($series);

            return array_fill(0, $horizon, (float) end($series));
        }
    };
    $result = (new RollingOriginEvaluator(['spy' => $spy]))
        ->evaluate(range(1, 84), [['key' => 'spy', 'parameters' => []]], 56, 7, 7, 4);

    expect($spy->trainingLengths)->toBe([56, 63, 70, 77])
        ->and($result['origins'])->toHaveCount(4);
});

it('evaluates all five candidate models on series with 56 or more observations', function () {
    // 84 points with weekly pattern
    $pattern = [10.0, 12.0, 11.0, 14.0, 18.0, 22.0, 15.0];
    $series = [];
    for ($i = 0; $i < 12; $i++) {
        foreach ($pattern as $val) {
            $series[] = $val + ($i * 0.5);
        }
    }

    $evaluator = new RollingOriginEvaluator;
    $result = $evaluator->evaluate($series, [], 56, 7, 7, 4);

    expect($result['origins'])->toHaveCount(4)
        ->and($result['can_reselect'])->toBeTrue()
        ->and($result['evaluations'])->toHaveCount(5);

    $keys = array_column($result['evaluations'], 'model_key');
    expect($keys)->toEqualCanonicalizing([
        'sma_7',
        'sma_14',
        'sma_28',
        'holt_winters_additive',
        'holt_winters_multiplicative',
    ]);

    foreach ($result['evaluations'] as $eval) {
        expect($eval['mae'])->toBeGreaterThanOrEqual(0.0)
            ->and($eval['rmse'])->toBeGreaterThanOrEqual(0.0)
            ->and($eval['wape'])->toBeGreaterThanOrEqual(0.0)
            ->and($eval['origins_count'])->toBe(4);
    }

    expect($result['selected'])->toBeArray()
        ->and($result['selected']['model_key'])->toBeIn($keys);
});

it('calculates aggregate WAPE from summed absolute errors over summed actuals instead of average of fold WAPEs', function () {
    // Two folds with deliberately different actual scales:
    // Fold 1: actuals = [100.0], predicted = [110.0] -> error = 10, actual = 100 -> fold WAPE = 10%
    // Fold 2: actuals = [10.0], predicted = [15.0]  -> error = 5,  actual = 10  -> fold WAPE = 50%
    // Average of fold WAPEs = (10% + 50%) / 2 = 30.0%
    // True aggregate WAPE = (10 + 5) / (100 + 10) * 100% = 15 / 110 * 100% = 13.6363636...%
    $series = [
        // 56 points initial window
        ...array_fill(0, 56, 100.0),
        // Origin 0 validation (length 1)
        100.0,
        // Origin 1 validation (length 1)
        10.0,
    ];

    $spy = new class
    {
        public int $callCount = 0;

        /** @param array<int, float|int> $series */
        public function forecast(array $series, array $parameters, int $horizon): array
        {
            $this->callCount++;
            if ($this->callCount === 1) {
                return [110.0];
            }

            return [15.0];
        }
    };

    $evaluator = new RollingOriginEvaluator(['spy' => $spy]);
    $result = $evaluator->evaluate($series, [['key' => 'spy', 'parameters' => []]], 56, 1, 1, 2);

    expect($result['origins'])->toHaveCount(2);

    $eval = $result['evaluations'][0];
    $expectedWape = (15.0 / 110.0) * 100.0;
    $unweightedMeanFoldWape = 30.0;

    expect($eval['wape'])->toEqualWithDelta($expectedWape, 1e-4)
        ->and(abs($eval['wape'] - $unweightedMeanFoldWape))->toBeGreaterThan(10.0);
});

it('flags can_reselect as false when series produces fewer than 3 valid origins', function () {
    // 70 points with initialWindow 56, horizon 7, step 7:
    // Origin 0: cutoff 56, validation 56..62 (end 63 <= 70)
    // Origin 1: cutoff 63, validation 63..69 (end 70 <= 70)
    // Next cutoff 70 would need 70 + 7 = 77 > 70 -> only 2 origins fit!
    $series = array_fill(0, 70, 5.0);

    $evaluator = new RollingOriginEvaluator;
    $result = $evaluator->evaluate($series, ['sma_7'], 56, 7, 7, 8);

    expect($result['origins'])->toHaveCount(2)
        ->and($result['can_reselect'])->toBeFalse()
        ->and($result['selected'])->toBeNull();
});

it('determines candidate eligibility by series length', function () {
    expect(RollingOriginEvaluator::eligibleCandidates(10))->toBe([])
        ->and(RollingOriginEvaluator::eligibleCandidates(13))->toBe([])
        ->and(RollingOriginEvaluator::eligibleCandidates(14))->toBe(['sma_7'])
        ->and(RollingOriginEvaluator::eligibleCandidates(27))->toBe(['sma_7'])
        ->and(RollingOriginEvaluator::eligibleCandidates(28))->toBe(['sma_7', 'sma_14'])
        ->and(RollingOriginEvaluator::eligibleCandidates(55))->toBe(['sma_7', 'sma_14'])
        ->and(RollingOriginEvaluator::eligibleCandidates(56))->toBe([
            'sma_7',
            'sma_14',
            'sma_28',
            'holt_winters_additive',
            'holt_winters_multiplicative',
        ]);
});

it('returns null WAPE when actual demand is zero across all origins', function () {
    $series = array_fill(0, 84, 0.0);

    $evaluator = new RollingOriginEvaluator;
    $result = $evaluator->evaluate($series, ['sma_7'], 56, 7, 7, 4);

    expect($result['evaluations'][0]['wape'])->toBeNull()
        ->and($result['evaluations'][0]['mae'])->toBe(0.0)
        ->and($result['evaluations'][0]['rmse'])->toBe(0.0);
});

it('validates input series and parameter boundaries', function () {
    $evaluator = new RollingOriginEvaluator;

    expect(fn () => $evaluator->evaluate([], [], 56, 7, 7, 4))
        ->toThrow(InvalidArgumentException::class, 'Series cannot be empty.');

    expect(fn () => $evaluator->evaluate([1, 2, -1], [], 56, 7, 7, 4))
        ->toThrow(InvalidArgumentException::class, 'non-negative');

    expect(fn () => $evaluator->evaluate(range(1, 84), [], 0, 7, 7, 4))
        ->toThrow(InvalidArgumentException::class, 'Initial window');

    expect(fn () => $evaluator->evaluate(range(1, 84), [], 56, 0, 7, 4))
        ->toThrow(InvalidArgumentException::class, 'Horizon');

    expect(fn () => $evaluator->evaluate(range(1, 84), [], 56, 7, 0, 4))
        ->toThrow(InvalidArgumentException::class, 'Step');

    expect(fn () => $evaluator->evaluate(range(1, 84), [], 56, 7, 7, 0))
        ->toThrow(InvalidArgumentException::class, 'Max origins');
});
