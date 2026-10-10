<?php

namespace App\Services\Forecasting;

use InvalidArgumentException;

class HoltWintersForecaster
{
    private const DEFAULT_ALPHA = 0.2;

    private const DEFAULT_BETA = 0.1;

    private const DEFAULT_GAMMA = 0.3;

    private const EPSILON = 1e-9;

    /**
     * Forecast future values using Holt-Winters Triple Exponential Smoothing.
     *
     * @param  array<int, float|int>  $series
     * @param  array<string, mixed>  $params
     * @return list<float>
     *
     * @throws InvalidArgumentException
     */
    public function forecast(array $series, int $period, int $horizon, string $mode = 'additive', array $params = []): array
    {
        if ($period <= 1) {
            throw new InvalidArgumentException("Seasonal period must be greater than 1, got {$period}.");
        }

        if ($horizon <= 0) {
            throw new InvalidArgumentException("Forecast horizon must be greater than zero, got {$horizon}.");
        }

        if ($mode !== 'additive' && $mode !== 'multiplicative') {
            throw new InvalidArgumentException("Unsupported Holt-Winters mode '{$mode}'. Allowed: additive, multiplicative.");
        }

        $count = count($series);
        if ($count < 2 * $period) {
            throw new InvalidArgumentException("Series length ({$count}) must contain at least 2 full periods (".(2 * $period).').');
        }

        /** @var list<float> $values */
        $values = [];
        foreach ($series as $val) {
            if (! is_finite((float) $val) || (float) $val < 0.0) {
                throw new InvalidArgumentException('Series values must be non-negative finite numbers.');
            }
            $values[] = (float) $val;
        }

        $alpha = $this->extractSmoothingParam($params, 'alpha', self::DEFAULT_ALPHA);
        $beta = $this->extractSmoothingParam($params, 'beta', self::DEFAULT_BETA);
        $gamma = $this->extractSmoothingParam($params, 'gamma', self::DEFAULT_GAMMA);

        $k = intdiv($count, $period);

        // Cycle averages for initialization
        $cycleAverages = [];
        for ($j = 0; $j < $k; $j++) {
            $sum = 0.0;
            for ($i = 0; $i < $period; $i++) {
                $sum += $values[$j * $period + $i];
            }
            $avg = $sum / $period;
            if ($mode === 'multiplicative' && $avg <= self::EPSILON) {
                throw new InvalidArgumentException('Initial seasonal cycle average is zero or near-zero in multiplicative mode.');
            }
            $cycleAverages[$j] = $avg;
        }

        // Initial trend and level
        $trend = ($cycleAverages[$k - 1] - $cycleAverages[0]) / (($k - 1) * $period);
        $level = $cycleAverages[0];

        // Initial seasonal components
        /** @var list<float> $season */
        $season = array_fill(0, $period, 0.0);

        if ($mode === 'additive') {
            for ($i = 0; $i < $period; $i++) {
                $sumDiff = 0.0;
                for ($j = 0; $j < $k; $j++) {
                    $sumDiff += ($values[$j * $period + $i] - $cycleAverages[$j]);
                }
                $season[$i] = $sumDiff / $k;
            }

            // Normalize so sum of seasonal components is 0
            $meanSeason = array_sum($season) / $period;
            for ($i = 0; $i < $period; $i++) {
                $season[$i] -= $meanSeason;
            }
        } else {
            for ($i = 0; $i < $period; $i++) {
                $sumRatio = 0.0;
                for ($j = 0; $j < $k; $j++) {
                    $sumRatio += ($values[$j * $period + $i] / $cycleAverages[$j]);
                }
                $season[$i] = $sumRatio / $k;
            }

            // Normalize so sum of seasonal components is $period (mean = 1.0)
            $sumSeason = array_sum($season);
            if ($sumSeason <= self::EPSILON) {
                throw new InvalidArgumentException('Sum of initial seasonal components is near-zero in multiplicative mode.');
            }
            $scale = (float) $period / $sumSeason;
            for ($i = 0; $i < $period; $i++) {
                $season[$i] *= $scale;
            }
        }

        // Sequential state update across entire series
        for ($t = 0; $t < $count; $t++) {
            $seasonIndex = $t % $period;
            $y = $values[$t];
            $prevSeason = $season[$seasonIndex];
            $prevLevel = $level;
            $prevTrend = $trend;

            if ($mode === 'additive') {
                $level = ($alpha * ($y - $prevSeason)) + ((1.0 - $alpha) * ($prevLevel + $prevTrend));
                $trend = ($beta * ($level - $prevLevel)) + ((1.0 - $beta) * $prevTrend);
                $season[$seasonIndex] = ($gamma * ($y - $level)) + ((1.0 - $gamma) * $prevSeason);
            } else {
                // ponytail: clamp divisor to EPSILON to avoid zero division on near-zero seasonal factors
                $safeSeason = abs($prevSeason) < self::EPSILON ? self::EPSILON : $prevSeason;
                $level = ($alpha * ($y / $safeSeason)) + ((1.0 - $alpha) * ($prevLevel + $prevTrend));
                $trend = ($beta * ($level - $prevLevel)) + ((1.0 - $beta) * $prevTrend);
                $safeLevel = abs($level) < self::EPSILON ? self::EPSILON : $level;
                $season[$seasonIndex] = ($gamma * ($y / $safeLevel)) + ((1.0 - $gamma) * $prevSeason);
                $season[$seasonIndex] = max(0.0, $season[$seasonIndex]);
            }
        }

        // Forecast generation
        $forecasts = [];
        for ($h = 1; $h <= $horizon; $h++) {
            $seasonIndex = ($count - 1 + $h) % $period;
            if ($mode === 'additive') {
                $val = $level + ($h * $trend) + $season[$seasonIndex];
            } else {
                $val = max(0.0, $level + ($h * $trend)) * $season[$seasonIndex];
            }

            $forecasts[] = max(0.0, (float) $val);
        }

        return $forecasts;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function extractSmoothingParam(array $params, string $key, float $default): float
    {
        if (! array_key_exists($key, $params)) {
            return $default;
        }

        $val = $params[$key];
        if (! is_numeric($val) || ! is_finite((float) $val) || (float) $val < 0.0 || (float) $val > 1.0) {
            throw new InvalidArgumentException("Parameter {$key} must be a finite number between 0 and 1.");
        }

        return (float) $val;
    }
}
