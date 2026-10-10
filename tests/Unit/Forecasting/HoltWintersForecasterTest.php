<?php

use App\Services\Forecasting\ForecastMetrics;
use App\Services\Forecasting\HoltWintersForecaster;
use App\Services\Forecasting\MovingAverageForecaster;
use Tests\TestCase;

uses(TestCase::class);

it('forecasts additive Holt-Winters with lower error than SMA on seasonal pattern', function () {
    $forecaster = app(HoltWintersForecaster::class);
    $smaForecaster = app(MovingAverageForecaster::class);

    // 8 weeks of synthetic additive seasonal demand (56 observations)
    $weeklyPattern = [10.0, 15.0, 20.0, 25.0, 30.0, 60.0, 50.0];
    $series = [];
    for ($w = 0; $w < 8; $w++) {
        foreach ($weeklyPattern as $val) {
            $series[] = $val;
        }
    }

    $actualNextWeek = $weeklyPattern;

    $hwResult = $forecaster->forecast($series, 7, 7, 'additive');
    $smaResult = $smaForecaster->forecast($series, 7, 7);

    expect($hwResult)->toHaveCount(7);

    foreach ($hwResult as $val) {
        expect(is_finite($val))->toBeTrue()
            ->and($val)->toBeGreaterThanOrEqual(0.0);
    }

    $hwMetrics = ForecastMetrics::calculate($actualNextWeek, $hwResult);
    $smaMetrics = ForecastMetrics::calculate($actualNextWeek, $smaResult);

    // Holt-Winters should significantly beat SMA on strongly seasonal data
    expect($hwMetrics['mae'])->toBeLessThan($smaMetrics['mae'])
        ->and($hwMetrics['rmse'])->toBeLessThan($smaMetrics['rmse']);
});

it('forecasts multiplicative Holt-Winters with lower error than SMA on seasonal series', function () {
    $forecaster = app(HoltWintersForecaster::class);
    $smaForecaster = app(MovingAverageForecaster::class);

    // 8 weeks of multiplicative seasonal demand with trend
    $multipliers = [0.5, 0.7, 1.0, 1.2, 1.5, 2.0, 1.1];
    $series = [];
    for ($w = 0; $w < 8; $w++) {
        $base = 20.0 + ($w * 2.0);
        foreach ($multipliers as $m) {
            $series[] = $base * $m;
        }
    }

    $nextBase = 20.0 + (8 * 2.0);
    $actualNextWeek = array_map(fn ($m) => $nextBase * $m, $multipliers);

    $hwResult = $forecaster->forecast($series, 7, 7, 'multiplicative');
    $smaResult = $smaForecaster->forecast($series, 7, 7);

    expect($hwResult)->toHaveCount(7);

    foreach ($hwResult as $val) {
        expect(is_finite($val))->toBeTrue()
            ->and($val)->toBeGreaterThanOrEqual(0.0);
    }

    $hwMetrics = ForecastMetrics::calculate($actualNextWeek, $hwResult);
    $smaMetrics = ForecastMetrics::calculate($actualNextWeek, $smaResult);

    expect($hwMetrics['mae'])->toBeLessThan($smaMetrics['mae'])
        ->and($hwMetrics['rmse'])->toBeLessThan($smaMetrics['rmse']);
});

it('rejects zero initial seasonal denominators in multiplicative mode', function () {
    $forecaster = new HoltWintersForecaster;

    // First cycle is all zeros, leading to zero cycle average denominator
    $series = array_merge(
        array_fill(0, 7, 0.0),
        [10.0, 15.0, 20.0, 25.0, 30.0, 60.0, 50.0]
    );

    $forecaster->forecast($series, 7, 7, 'multiplicative');
})->throws(InvalidArgumentException::class);

it('handles near-zero seasonal components safely in multiplicative mode without division by zero', function () {
    $forecaster = new HoltWintersForecaster;

    // First cycle positive, subsequent cycle has zero days
    $series = array_merge(
        [10.0, 15.0, 20.0, 25.0, 30.0, 60.0, 50.0],
        [0.0, 0.0, 0.0, 25.0, 30.0, 60.0, 50.0]
    );

    $result = $forecaster->forecast($series, 7, 3, 'multiplicative');

    expect($result)->toHaveCount(3);
    foreach ($result as $val) {
        expect(is_finite($val))->toBeTrue()
            ->and($val)->toBeGreaterThanOrEqual(0.0);
    }
});

it('clamps forecasts to non-negative when trend drops below zero', function () {
    $forecaster = new HoltWintersForecaster;

    // Steep downward trend
    $series = [
        100.0, 90.0, 80.0,
        50.0, 40.0, 30.0,
        10.0, 5.0, 1.0,
    ];

    $result = $forecaster->forecast($series, 3, 5, 'additive', ['beta' => 0.8]);

    expect($result)->toHaveCount(5);
    foreach ($result as $val) {
        expect($val)->toBeGreaterThanOrEqual(0.0);
    }
});

it('rejects invalid period', function (int $period) {
    (new HoltWintersForecaster)->forecast(range(1, 14), $period, 7);
})->with([0, 1, -1])->throws(InvalidArgumentException::class);

it('rejects series shorter than two full periods', function () {
    (new HoltWintersForecaster)->forecast(range(1, 13), 7, 7);
})->throws(InvalidArgumentException::class);

it('rejects invalid horizon', function (int $horizon) {
    (new HoltWintersForecaster)->forecast(range(1, 14), 7, $horizon);
})->with([0, -1, -5])->throws(InvalidArgumentException::class);

it('rejects invalid mode', function () {
    (new HoltWintersForecaster)->forecast(range(1, 14), 7, 7, 'exponential');
})->throws(InvalidArgumentException::class);

it('rejects invalid smoothing parameters', function (array $params) {
    (new HoltWintersForecaster)->forecast(range(1, 14), 7, 7, 'additive', $params);
})->with([
    [['alpha' => -0.1]],
    [['alpha' => 1.5]],
    [['beta' => -0.5]],
    [['beta' => 2.0]],
    [['gamma' => -0.1]],
    [['gamma' => 1.2]],
    [['alpha' => NAN]],
])->throws(InvalidArgumentException::class);

it('rejects negative series values', function () {
    $series = array_fill(0, 14, 10.0);
    $series[5] = -1.0;
    (new HoltWintersForecaster)->forecast($series, 7, 7);
})->throws(InvalidArgumentException::class);

it('rejects non-finite series values', function () {
    $series = array_fill(0, 14, 10.0);
    $series[5] = INF;
    (new HoltWintersForecaster)->forecast($series, 7, 7);
})->throws(InvalidArgumentException::class);
