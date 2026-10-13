<?php

use App\Services\Forecasting\ForecastMetrics;

it('calculates the three approved metrics', function () {
    $m = ForecastMetrics::calculate([10, 20], [8, 24]);
    expect($m['mae'])->toBe(3.0)
        ->and($m['rmse'])->toEqualWithDelta(sqrt(10), 0.0001)
        ->and($m['wape'])->toBe(20.0);
});

it('returns null WAPE when actual total is zero', function () {
    expect(ForecastMetrics::calculate([0, 0], [1, 2])['wape'])->toBeNull();
});

it('returns zero errors when predictions match actuals perfectly', function () {
    $m = ForecastMetrics::calculate([5, 15, 25], [5, 15, 25]);
    expect($m['mae'])->toBe(0.0)
        ->and($m['rmse'])->toBe(0.0)
        ->and($m['wape'])->toBe(0.0);
});

it('rejects mismatched array lengths', function () {
    ForecastMetrics::calculate([1, 2], [1]);
})->throws(InvalidArgumentException::class);

it('rejects empty arrays', function () {
    ForecastMetrics::calculate([], []);
})->throws(InvalidArgumentException::class);

it('rejects negative actual values', function () {
    ForecastMetrics::calculate([-1, 5], [2, 5]);
})->throws(InvalidArgumentException::class);

it('rejects negative predicted values', function () {
    ForecastMetrics::calculate([1, 5], [-2, 5]);
})->throws(InvalidArgumentException::class);

it('rejects non-finite values in actual or predicted', function () {
    ForecastMetrics::calculate([1, NAN], [1, 2]);
})->throws(InvalidArgumentException::class);
