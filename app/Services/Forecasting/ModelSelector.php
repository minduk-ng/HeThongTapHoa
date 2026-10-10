<?php

namespace App\Services\Forecasting;

use InvalidArgumentException;

class ModelSelector
{
    /**
     * Approved candidate model keys.
     *
     * @var list<string>
     */
    public const CANDIDATES = [
        'sma_7',
        'sma_14',
        'sma_28',
        'holt_winters_additive',
        'holt_winters_multiplicative',
    ];

    /**
     * Threshold in WAPE percentage points for tie-breaking to MAE.
     */
    public const TIE_BREAK_WAPE_THRESHOLD = 0.5;

    /**
     * Minimum valid origins required to reselect models.
     */
    public const MIN_ORIGINS = 3;

    /**
     * Complexity hierarchy: lower score means simpler model.
     *
     * @var array<string, int>
     */
    private const COMPLEXITY_RANK = [
        'sma_7' => 1,
        'sma_14' => 2,
        'sma_28' => 3,
        'holt_winters_additive' => 4,
        'holt_winters_multiplicative' => 5,
    ];

    private const EPSILON = 1e-9;

    /**
     * Select best model using WAPE primary, 0.5-point tie-break to MAE, then simpler model complexity.
     *
     * @param  array<int|string, array<string, mixed>>  $evaluations
     * @return array{model_key: string, parameters: array<string, mixed>, mae: float, rmse: float, wape: float|null}
     *
     * @throws InvalidArgumentException
     */
    public static function select(array $evaluations): array
    {
        if (empty($evaluations)) {
            throw new InvalidArgumentException('Evaluations list cannot be empty.');
        }

        $normalized = [];
        foreach ($evaluations as $key => $eval) {
            $modelKey = $eval['model_key'] ?? (is_string($key) ? $key : null);
            if ($modelKey === null || $modelKey === '') {
                throw new InvalidArgumentException("Missing 'model_key' in evaluation item.");
            }

            if (! isset($eval['mae']) || ! is_numeric($eval['mae'])) {
                throw new InvalidArgumentException("Missing or invalid 'mae' in evaluation for {$modelKey}.");
            }

            if (! isset($eval['rmse']) || ! is_numeric($eval['rmse'])) {
                throw new InvalidArgumentException("Missing or invalid 'rmse' in evaluation for {$modelKey}.");
            }

            $wape = null;
            if (isset($eval['wape'])) {
                if (! is_numeric($eval['wape'])) {
                    throw new InvalidArgumentException("Invalid 'wape' in evaluation for {$modelKey}.");
                }
                $wape = (float) $eval['wape'];
            }

            /** @var array<string, mixed> $parameters */
            $parameters = isset($eval['parameters']) && is_array($eval['parameters'])
                ? $eval['parameters']
                : [];

            $normalized[] = [
                'model_key' => (string) $modelKey,
                'parameters' => $parameters,
                'mae' => (float) $eval['mae'],
                'rmse' => (float) $eval['rmse'],
                'wape' => $wape,
            ];
        }

        // Candidates with valid (non-null) WAPE
        $withWape = array_values(array_filter($normalized, fn ($c) => $c['wape'] !== null));

        if (! empty($withWape)) {
            $minWape = min(array_map(fn ($c) => $c['wape'], $withWape));

            // Candidates within 0.5 percentage points of minimum WAPE
            $wapePool = array_values(array_filter(
                $withWape,
                fn ($c) => ($c['wape'] - $minWape) <= (self::TIE_BREAK_WAPE_THRESHOLD + self::EPSILON)
            ));

            if (empty($wapePool)) {
                $wapePool = $withWape;
            }

            $minMae = min(array_map(fn ($c) => $c['mae'], $wapePool));

            $maePool = array_values(array_filter(
                $wapePool,
                fn ($c) => abs($c['mae'] - $minMae) <= self::EPSILON
            ));

            usort($maePool, function ($a, $b) {
                $rankA = self::COMPLEXITY_RANK[$a['model_key']] ?? 99;
                $rankB = self::COMPLEXITY_RANK[$b['model_key']] ?? 99;
                if ($rankA !== $rankB) {
                    return $rankA <=> $rankB;
                }

                return strcmp($a['model_key'], $b['model_key']);
            });

            return $maePool[0];
        }

        // Fallback when all WAPEs are null: lowest MAE then simplest model
        $minMae = min(array_map(fn ($c) => $c['mae'], $normalized));
        $maePool = array_values(array_filter(
            $normalized,
            fn ($c) => abs($c['mae'] - $minMae) <= self::EPSILON
        ));

        usort($maePool, function ($a, $b) {
            $rankA = self::COMPLEXITY_RANK[$a['model_key']] ?? 99;
            $rankB = self::COMPLEXITY_RANK[$b['model_key']] ?? 99;
            if ($rankA !== $rankB) {
                return $rankA <=> $rankB;
            }

            return strcmp($a['model_key'], $b['model_key']);
        });

        return $maePool[0];
    }

    /**
     * Check if valid origin count satisfies minimum reselection requirement.
     */
    public static function canReselect(int $validOrigins): bool
    {
        return $validOrigins >= self::MIN_ORIGINS;
    }

    /**
     * Get eligible candidate keys based on series observation count.
     *
     * @return list<string>
     */
    public static function eligibleCandidates(int $seriesLength): array
    {
        if ($seriesLength < 14) {
            return [];
        }

        if ($seriesLength < 28) {
            return ['sma_7'];
        }

        if ($seriesLength < 56) {
            return ['sma_7', 'sma_14'];
        }

        return self::CANDIDATES;
    }
}
