<?php

namespace App\Services\Forecasting;

use InvalidArgumentException;

class MovingAverageForecaster
{
    /**
     * Forecast future values using Simple Moving Average recursively.
     *
     * @param  array<int, float|int>  $series
     * @return list<float>
     *
     * @throws InvalidArgumentException
     */
    public function forecast(array $series, int $window, int $horizon): array
    {
        if ($window <= 0) {
            throw new InvalidArgumentException("Window size must be greater than zero, got {$window}.");
        }

        if ($horizon <= 0) {
            throw new InvalidArgumentException("Forecast horizon must be greater than zero, got {$horizon}.");
        }

        $count = count($series);
        if ($count < $window) {
            throw new InvalidArgumentException("Series length ({$count}) is shorter than window size ({$window}).");
        }

        /** @var list<float> $history */
        $history = [];
        foreach ($series as $value) {
            if (! is_finite((float) $value) || (float) $value < 0.0) {
                throw new InvalidArgumentException('Series values must be non-negative finite numbers.');
            }
            $history[] = (float) $value;
        }

        $predictions = [];
        for ($h = 0; $h < $horizon; $h++) {
            $slice = array_slice($history, -$window);
            $avg = array_sum($slice) / $window;
            $clamped = max(0.0, (float) $avg);
            $predictions[] = $clamped;
            $history[] = $clamped;
        }

        return $predictions;
    }
}
