<?php

namespace App\Services\Forecasting;

use InvalidArgumentException;

class BaselineForecaster
{
    /**
     * Generate forecasts using naive (period=1) or seasonal naive (period>1).
     *
     * @param  list<float|int>  $series
     * @return list<float>
     *
     * @throws InvalidArgumentException
     */
    public function forecast(array $series, int $horizon, int $period = 1): array
    {
        if ($horizon <= 0) {
            throw new InvalidArgumentException("Horizon must be greater than zero, got {$horizon}.");
        }

        if ($period <= 0) {
            throw new InvalidArgumentException("Period must be greater than zero, got {$period}.");
        }

        $count = count($series);
        if ($count < $period) {
            throw new InvalidArgumentException("Series length ({$count}) must be at least period ({$period}).");
        }

        $values = [];
        foreach ($series as $val) {
            if (! is_finite((float) $val) || (float) $val < 0.0) {
                throw new InvalidArgumentException('Series values must be non-negative finite numbers.');
            }
            $values[] = (float) $val;
        }

        $predictions = [];
        for ($h = 1; $h <= $horizon; $h++) {
            $offset = ($h - 1) % $period;
            $idx = $count - $period + $offset;
            $predictions[] = $values[$idx];
        }

        return $predictions;
    }
}
