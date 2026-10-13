<?php

namespace App\Services\Forecasting;

use InvalidArgumentException;

class ForecastModelRunner
{
    public const CANDIDATES = [
        'naive',
        'seasonal_naive_7',
        'sma_7',
        'sma_14',
        'sma_28',
        'holt_winters_additive',
        'holt_winters_multiplicative',
    ];

    public function __construct(
        private ?BaselineForecaster $baseline = null,
        private ?MovingAverageForecaster $movingAverage = null,
        private ?HoltWintersForecaster $holtWinters = null
    ) {
        $this->baseline = $baseline ?? app(BaselineForecaster::class);
        $this->movingAverage = $movingAverage ?? app(MovingAverageForecaster::class);
        $this->holtWinters = $holtWinters ?? app(HoltWintersForecaster::class);
    }

    /**
     * Run forecasting model on training series for specified horizon.
     *
     * @param  list<float|int>  $training
     * @param  array<string, mixed>  $parameters
     * @return array{
     *     status: string,
     *     predictions: list<float>,
     *     parameters: array<string, mixed>,
     *     reason: string|null
     * }
     *
     * @throws InvalidArgumentException
     */
    public function run(string $key, array $training, int $horizon, array $parameters = []): array
    {
        if (! in_array($key, self::CANDIDATES, true)) {
            throw new InvalidArgumentException("Unknown forecasting candidate '{$key}'.");
        }

        if ($horizon <= 0) {
            throw new InvalidArgumentException("Horizon must be greater than zero, got {$horizon}.");
        }

        $count = count($training);

        $minObs = match ($key) {
            'naive' => 1,
            'seasonal_naive_7', 'sma_7' => 7,
            'sma_14', 'holt_winters_additive', 'holt_winters_multiplicative' => 14,
            default => 28,
        };

        if ($count < $minObs) {
            return [
                'status' => 'skipped',
                'predictions' => [],
                'parameters' => $this->defaultParametersFor($key, $parameters),
                'reason' => "Training series length {$count} is below minimum requirement of {$minObs} for {$key}.",
            ];
        }

        // Multiplicative Holt-Winters eligibility check: all values must be strictly positive
        if ($key === 'holt_winters_multiplicative') {
            foreach ($training as $v) {
                if ((float) $v <= 0.0) {
                    return [
                        'status' => 'skipped',
                        'predictions' => [],
                        'parameters' => $this->defaultParametersFor($key, $parameters),
                        'reason' => 'Non-positive values present in series for multiplicative mode.',
                    ];
                }
            }
        }

        try {
            $params = $this->defaultParametersFor($key, $parameters);

            $preds = match ($key) {
                'naive' => $this->baseline->forecast($training, $horizon, 1),
                'seasonal_naive_7' => $this->baseline->forecast($training, $horizon, 7),
                'sma_7' => $this->movingAverage->forecast($training, (int) ($params['window'] ?? 7), $horizon),
                'sma_14' => $this->movingAverage->forecast($training, (int) ($params['window'] ?? 14), $horizon),
                'sma_28' => $this->movingAverage->forecast($training, (int) ($params['window'] ?? 28), $horizon),
                'holt_winters_additive' => $this->holtWinters->forecast(
                    $training,
                    (int) ($params['period'] ?? 7),
                    $horizon,
                    'additive',
                    $params
                ),
                'holt_winters_multiplicative' => $this->holtWinters->forecast(
                    $training,
                    (int) ($params['period'] ?? 7),
                    $horizon,
                    'multiplicative',
                    $params
                ),
            };

            return [
                'status' => 'evaluated',
                'predictions' => array_map('floatval', $preds),
                'parameters' => $params,
                'reason' => null,
            ];
        } catch (InvalidArgumentException $e) {
            return [
                'status' => 'failed',
                'predictions' => [],
                'parameters' => $this->defaultParametersFor($key, $parameters),
                'reason' => $e->getMessage(),
            ];
        }
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public function defaultParametersFor(string $key, array $overrides = []): array
    {
        $defaults = match ($key) {
            'naive' => [],
            'seasonal_naive_7' => ['period' => 7],
            'sma_7' => ['window' => 7],
            'sma_14' => ['window' => 14],
            'sma_28' => ['window' => 28],
            'holt_winters_additive' => [
                'period' => 7,
                'mode' => 'additive',
                'alpha' => 0.2,
                'beta' => 0.1,
                'gamma' => 0.3,
            ],
            'holt_winters_multiplicative' => [
                'period' => 7,
                'mode' => 'multiplicative',
                'alpha' => 0.2,
                'beta' => 0.1,
                'gamma' => 0.3,
            ],
            default => [],
        };

        return array_merge($defaults, $overrides);
    }
}
