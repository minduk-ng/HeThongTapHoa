<?php

namespace App\Services\Forecasting;

use InvalidArgumentException;

class ForecastMetrics
{
    /**
     * Calculate MAE, RMSE, and WAPE between actual and predicted values.
     *
     * @param  array<int, float|int>  $actual
     * @param  array<int, float|int>  $predicted
     * @return array{mae: float, rmse: float, wape: float|null}
     *
     * @throws InvalidArgumentException
     */
    public static function calculate(array $actual, array $predicted): array
    {
        $n = count($actual);
        if ($n === 0) {
            throw new InvalidArgumentException('Actual series cannot be empty.');
        }

        if ($n !== count($predicted)) {
            throw new InvalidArgumentException('Actual and predicted series must have equal length.');
        }

        $sumAbsError = 0.0;
        $sumSqError = 0.0;
        $sumActual = 0.0;

        $actualValues = array_values($actual);
        $predictedValues = array_values($predicted);

        for ($i = 0; $i < $n; $i++) {
            $y = $actualValues[$i];
            $yHat = $predictedValues[$i];

            if (! is_finite((float) $y) || (float) $y < 0.0) {
                throw new InvalidArgumentException('Actual values must be non-negative finite numbers.');
            }

            if (! is_finite((float) $yHat) || (float) $yHat < 0.0) {
                throw new InvalidArgumentException('Predicted values must be non-negative finite numbers.');
            }

            $diff = abs((float) $y - (float) $yHat);
            $sumAbsError += $diff;
            $sumSqError += $diff * $diff;
            $sumActual += (float) $y;
        }

        $mae = $sumAbsError / $n;
        $rmse = sqrt($sumSqError / $n);
        $wape = $sumActual > 0.0 ? ($sumAbsError / $sumActual) * 100.0 : null;

        return [
            'mae' => $mae,
            'rmse' => $rmse,
            'wape' => $wape,
        ];
    }
}
