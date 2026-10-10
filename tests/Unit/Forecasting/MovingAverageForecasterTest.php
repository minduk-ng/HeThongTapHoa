<?php

use App\Services\Forecasting\MovingAverageForecaster;
use Tests\TestCase;

uses(TestCase::class);

it('forecasts SMA recursively from the selected window', function () {
    $result = app(MovingAverageForecaster::class)->forecast([1, 2, 3, 4, 5, 6, 7], 7, 2);
    expect($result)->toEqualWithDelta([4.0, 31 / 7], 0.0001);
});

it('forecasts SMA with window 14 and multiple horizon steps', function () {
    $series = range(1, 14);
    $forecaster = new MovingAverageForecaster;
    $result = $forecaster->forecast($series, 14, 3);

    // Mean of 1..14 is 105 / 14 = 7.5
    expect($result)->toHaveCount(3)
        ->and($result[0])->toEqualWithDelta(7.5, 0.0001);
});

it('clamps forecasts to non-negative values', function () {
    $forecaster = new MovingAverageForecaster;
    $result = $forecaster->forecast([0, 0, 0, 0, 0, 0, 0], 7, 3);

    expect($result)->toBe([0.0, 0.0, 0.0]);
});

it('rejects empty series', function () {
    (new MovingAverageForecaster)->forecast([], 7, 1);
})->throws(InvalidArgumentException::class);

it('rejects series shorter than window', function () {
    (new MovingAverageForecaster)->forecast([1, 2, 3], 7, 1);
})->throws(InvalidArgumentException::class);

it('rejects invalid window', function (int $window) {
    (new MovingAverageForecaster)->forecast([1, 2, 3, 4, 5, 6, 7], $window, 1);
})->with([0, -1, -7])->throws(InvalidArgumentException::class);

it('rejects invalid horizon', function (int $horizon) {
    (new MovingAverageForecaster)->forecast([1, 2, 3, 4, 5, 6, 7], 7, $horizon);
})->with([0, -1, -5])->throws(InvalidArgumentException::class);

it('rejects negative series values', function () {
    (new MovingAverageForecaster)->forecast([1, 2, -3, 4, 5, 6, 7], 7, 1);
})->throws(InvalidArgumentException::class);

it('rejects non-finite series values', function (float $val) {
    (new MovingAverageForecaster)->forecast([1, 2, $val, 4, 5, 6, 7], 7, 1);
})->with([NAN, INF, -INF])->throws(InvalidArgumentException::class);
