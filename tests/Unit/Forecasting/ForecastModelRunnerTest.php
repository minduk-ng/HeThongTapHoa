<?php

use App\Services\Forecasting\ForecastModelRunner;
use Tests\TestCase;

uses(TestCase::class);

it('runs all supported candidate models successfully on sufficient positive series', function (string $key) {
    $runner = app(ForecastModelRunner::class);
    $series = array_fill(0, 56, 20.0);

    $result = $runner->run($key, $series, 7);

    expect($result['status'])->toBe('evaluated')
        ->and($result['predictions'])->toHaveCount(7)
        ->and($result['reason'])->toBeNull();
})->with([
    'naive',
    'seasonal_naive_7',
    'sma_7',
    'sma_14',
    'sma_28',
    'holt_winters_additive',
    'holt_winters_multiplicative',
]);

it('skips multiplicative holt winters when non-positive values exist in series', function () {
    $runner = app(ForecastModelRunner::class);
    $series = array_fill(0, 56, 20.0);
    $series[10] = 0.0; // zero day

    $result = $runner->run('holt_winters_multiplicative', $series, 7);

    expect($result['status'])->toBe('skipped')
        ->and($result['predictions'])->toBeEmpty()
        ->and($result['reason'])->toContain('Non-positive');
});

it('skips candidates when training series length is insufficient without failing entire batch', function () {
    $runner = app(ForecastModelRunner::class);
    $series = [10.0, 15.0, 20.0]; // only 3 observations

    $result = $runner->run('sma_7', $series, 7);

    expect($result['status'])->toBe('skipped')
        ->and($result['predictions'])->toBeEmpty()
        ->and($result['reason'])->toContain('minimum requirement');
});

it('throws exception on unknown model key', function () {
    $runner = app(ForecastModelRunner::class);
    $runner->run('arima_unknown', [10.0, 20.0], 7);
})->throws(InvalidArgumentException::class);
