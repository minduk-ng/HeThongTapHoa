<?php

use App\Services\Forecasting\BaselineForecaster;
use Tests\TestCase;

uses(TestCase::class);

it('forecasts flat naive repeating the last observation', function () {
    $baseline = new BaselineForecaster;
    $series = [10.0, 15.0, 22.0];

    $predictions = $baseline->forecast($series, 4, 1);

    expect($predictions)->toBe([22.0, 22.0, 22.0, 22.0]);
});

it('forecasts seasonal naive cyclically repeating the last 7 observations', function () {
    $baseline = new BaselineForecaster;
    $series = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];

    $predictions = $baseline->forecast($series, 9, 7);

    expect($predictions)->toBe([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 1.0, 2.0]);
});

it('rejects series shorter than seasonal period', function () {
    $baseline = new BaselineForecaster;
    $baseline->forecast([1.0, 2.0], 7, 7);
})->throws(InvalidArgumentException::class);
