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

    /**
     * Calculate summary metrics skipping null actuals or predictions.
     *
     * @param  array<int, float|int|null>  $actual
     * @param  array<int, float|int|null>  $predicted
     * @return array{
     *     mae: float|null,
     *     rmse: float|null,
     *     wape: float|null,
     *     scored_count: int,
     *     sum_abs_error: float,
     *     sum_sq_error: float,
     *     sum_actual: float
     * }
     */
    public static function summarize(array $actual, array $predicted): array
    {
        $sumAbsError = 0.0;
        $sumSqError = 0.0;
        $sumActual = 0.0;
        $scoredCount = 0;

        $n = count($actual);
        $actualValues = array_values($actual);
        $predictedValues = array_values($predicted);

        for ($i = 0; $i < $n; $i++) {
            $y = $actualValues[$i] ?? null;
            $yHat = $predictedValues[$i] ?? null;

            if ($y === null || $yHat === null) {
                continue;
            }

            $diff = abs((float) $y - (float) $yHat);
            $sumAbsError += $diff;
            $sumSqError += $diff * $diff;
            $sumActual += (float) $y;
            $scoredCount++;
        }

        if ($scoredCount === 0) {
            return [
                'mae' => null,
                'rmse' => null,
                'wape' => null,
                'scored_count' => 0,
                'sum_abs_error' => 0.0,
                'sum_sq_error' => 0.0,
                'sum_actual' => 0.0,
            ];
        }

        return [
            'mae' => round($sumAbsError / $scoredCount, 4),
            'rmse' => round(sqrt($sumSqError / $scoredCount), 4),
            'wape' => $sumActual > 0.0 ? round(($sumAbsError / $sumActual) * 100.0, 4) : null,
            'scored_count' => $scoredCount,
            'sum_abs_error' => round($sumAbsError, 4),
            'sum_sq_error' => round($sumSqError, 4),
            'sum_actual' => round($sumActual, 4),
        ];
    }
}
