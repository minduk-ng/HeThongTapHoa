<?php

namespace App\Services\Forecasting;

use App\Models\ForecastCheck;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

class ForecastCheckService
{
    private const EPSILON = 1e-9;

    public function __construct(
        private DemandPreprocessor $preprocessor,
        private ForecastModelRunner $runner
    ) {}

    /**
     * Compute single origin forecast check across all candidate models strictly leak-free.
     *
     * @param  array<string, mixed>  $snapshot
     * @return array{
     *     history: list<array<string, mixed>>,
     *     actuals: list<array<string, mixed>>,
     *     training: array<string, mixed>,
     *     candidates: list<array<string, mixed>>,
     *     default_model_key: string|null,
     *     best_model_keys: list<string>,
     *     ranking_metric: string|null,
     *     scored_count: int,
     *     versions: array<string, mixed>
     * }
     *
     * @throws InvalidArgumentException
     */
    public function calculate(array $snapshot): array
    {
        $startDateStr = (string) ($snapshot['start_date'] ?? '');
        $endDateStr = (string) ($snapshot['end_date'] ?? '');
        $cutoffStr = (string) ($snapshot['cutoff'] ?? '');
        $rawObs = (array) ($snapshot['observations'] ?? []);

        if ($startDateStr === '' || $endDateStr === '' || $cutoffStr === '') {
            throw new InvalidArgumentException('Snapshot must specify start_date, end_date, and cutoff.');
        }

        $startDate = CarbonImmutable::parse($startDateStr)->startOfDay();
        $endDate = CarbonImmutable::parse($endDateStr)->startOfDay();
        $cutoffDate = CarbonImmutable::parse($cutoffStr)->startOfDay();

        if (! $startDate->addDays(6)->equalTo($endDate)) {
            throw new InvalidArgumentException('Horizon must be exactly 7 calendar days (start_date to end_date).');
        }

        if (! $cutoffDate->addDay()->equalTo($startDate)) {
            throw new InvalidArgumentException("Cutoff ({$cutoffStr}) must be exactly the day prior to start_date ({$startDateStr}).");
        }

        // Sort observations ascending by date
        usort($rawObs, fn ($a, $b) => strcmp((string) $a['date'], (string) $b['date']));

        $trainingRows = [];
        $targetRows = [];
        $historyRows = [];
        $historyStartDate = $cutoffDate->subDays(27);

        foreach ($rawObs as $r) {
            $rDate = CarbonImmutable::parse((string) $r['date'])->startOfDay();
            if ($rDate->lte($cutoffDate)) {
                $trainingRows[] = $r;
                if ($rDate->gte($historyStartDate)) {
                    $historyRows[] = $r;
                }
            } elseif ($rDate->gte($startDate) && $rDate->lte($endDate)) {
                $targetRows[] = $r;
            }
        }

        if (count($targetRows) !== 7) {
            throw new InvalidArgumentException('Target window must contain exactly 7 daily observations.');
        }

        // Prepare training series causally up to cutoff
        $prepared = $this->preprocessor->prepare($trainingRows, $cutoffStr);
        if (empty($prepared['values'])) {
            throw new InvalidArgumentException($prepared['unavailable_reason'] ?? 'No valid training observations before cutoff.');
        }

        // Determine scoring mask over 7 target days
        $scoredIndices = [];
        $scoredActuals = [];
        $sumActual = 0.0;

        foreach ($targetRows as $idx => $tRow) {
            $isMissing = (bool) ($tRow['is_missing'] ?? false) || ($tRow['observed_sales'] ?? null) === null;
            if (! $isMissing) {
                $actVal = (float) $tRow['observed_sales'];
                $scoredIndices[] = $idx;
                $scoredActuals[] = $actVal;
                $sumActual += $actVal;
            }
        }

        $scoredCount = count($scoredIndices);
        $candidates = [];
        $candidateKeys = ForecastModelRunner::CANDIDATES;

        foreach ($candidateKeys as $candKey) {
            $runResult = $this->runner->run($candKey, $prepared['values'], 7);

            if ($runResult['status'] === 'evaluated' && count($runResult['predictions']) === 7) {
                $preds = array_map('floatval', $runResult['predictions']);
                $points = [];

                foreach ($targetRows as $idx => $tRow) {
                    $pred = $preds[$idx];
                    $act = ($tRow['observed_sales'] ?? null) !== null ? (float) $tRow['observed_sales'] : null;
                    $isScored = in_array($idx, $scoredIndices, true);

                    $signedError = $isScored && $act !== null ? $pred - $act : null;
                    $absError = $signedError !== null ? abs($signedError) : null;

                    $points[] = [
                        'date' => (string) $tRow['date'],
                        'actual' => $act,
                        'predicted' => $pred,
                        'signed_error' => $signedError,
                        'absolute_error' => $absError,
                        'scored' => $isScored,
                        'is_open' => (bool) ($tRow['is_open'] ?? true),
                        'is_missing' => (bool) ($tRow['is_missing'] ?? false) || ($tRow['observed_sales'] ?? null) === null,
                        'is_stockout' => (bool) ($tRow['is_stockout'] ?? false),
                    ];
                }

                $mae = null;
                $rmse = null;
                $wape = null;
                $observedTotal = null;
                $predScoredTotal = null;
                $predSevenDayTotal = array_sum($preds);

                if ($scoredCount > 0) {
                    $scoredPreds = [];
                    foreach ($scoredIndices as $sIdx) {
                        $scoredPreds[] = $preds[$sIdx];
                    }

                    $metrics = ForecastMetrics::calculate($scoredActuals, $scoredPreds);
                    $mae = $metrics['mae'];
                    $rmse = $metrics['rmse'];
                    $wape = $metrics['wape'];

                    $observedTotal = array_sum($scoredActuals);
                    $predScoredTotal = array_sum($scoredPreds);
                }

                $candidates[] = [
                    'model_key' => $candKey,
                    'parameters' => $runResult['parameters'],
                    'status' => 'evaluated',
                    'reason' => null,
                    'predictions' => $preds,
                    'mae' => $mae,
                    'rmse' => $rmse,
                    'wape' => $wape,
                    'scored_count' => $scoredCount,
                    'observed_total' => $observedTotal,
                    'predicted_scored_total' => $predScoredTotal,
                    'predicted_seven_day_total' => $predSevenDayTotal,
                    'points' => $points,
                ];
            } else {
                $points = [];
                foreach ($targetRows as $tRow) {
                    $points[] = [
                        'date' => (string) $tRow['date'],
                        'actual' => ($tRow['observed_sales'] ?? null) !== null ? (float) $tRow['observed_sales'] : null,
                        'predicted' => null,
                        'signed_error' => null,
                        'absolute_error' => null,
                        'scored' => false,
                        'is_open' => (bool) ($tRow['is_open'] ?? true),
                        'is_missing' => (bool) ($tRow['is_missing'] ?? false) || ($tRow['observed_sales'] ?? null) === null,
                        'is_stockout' => (bool) ($tRow['is_stockout'] ?? false),
                    ];
                }

                $candidates[] = [
                    'model_key' => $candKey,
                    'parameters' => $runResult['parameters'],
                    'status' => $runResult['status'],
                    'reason' => $runResult['reason'],
                    'predictions' => [],
                    'mae' => null,
                    'rmse' => null,
                    'wape' => null,
                    'scored_count' => 0,
                    'observed_total' => null,
                    'predicted_scored_total' => null,
                    'predicted_seven_day_total' => null,
                    'points' => $points,
                ];
            }
        }

        // Rank eligible candidates & find best models
        $eligible = array_values(array_filter(
            $candidates,
            fn ($c) => $c['status'] === 'evaluated' && $c['scored_count'] > 0 && $c['mae'] !== null
        ));

        $bestModelKeys = [];
        $rankingMetric = null;

        if (! empty($eligible)) {
            $withWape = array_values(array_filter($eligible, fn ($c) => $c['wape'] !== null));

            if (! empty($withWape)) {
                $rankingMetric = 'wape';
                $minWape = min(array_map(fn ($c) => $c['wape'], $withWape));
                foreach ($withWape as $c) {
                    if (abs($c['wape'] - $minWape) <= self::EPSILON) {
                        $bestModelKeys[] = $c['model_key'];
                    }
                }
            } else {
                $rankingMetric = 'mae';
                $minMae = min(array_map(fn ($c) => $c['mae'], $eligible));
                foreach ($eligible as $c) {
                    if (abs($c['mae'] - $minMae) <= self::EPSILON) {
                        $bestModelKeys[] = $c['model_key'];
                    }
                }
            }
        }

        // Determine default candidate key to display
        $evaluatedKeys = array_column(
            array_filter($candidates, fn ($c) => $c['status'] === 'evaluated'),
            'model_key'
        );

        $defaultModelKey = null;
        if (in_array('seasonal_naive_7', $evaluatedKeys, true)) {
            $defaultModelKey = 'seasonal_naive_7';
        } elseif (in_array('naive', $evaluatedKeys, true)) {
            $defaultModelKey = 'naive';
        } elseif (! empty($evaluatedKeys)) {
            $defaultModelKey = $evaluatedKeys[0];
        }

        return [
            'history' => $historyRows,
            'actuals' => $targetRows,
            'training' => [
                'cutoff' => $cutoffStr,
                'quality' => $prepared['quality'],
                'counts' => $prepared['counts'],
                'unavailable_reason' => $prepared['unavailable_reason'],
            ],
            'candidates' => $candidates,
            'default_model_key' => $defaultModelKey,
            'best_model_keys' => $bestModelKeys,
            'ranking_metric' => $rankingMetric,
            'scored_count' => $scoredCount,
            'versions' => (array) ($snapshot['versions'] ?? ForecastCheck::VERSIONS),
        ];
    }
}
