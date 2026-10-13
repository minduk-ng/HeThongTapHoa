<?php

namespace App\Services\Forecasting;

use InvalidArgumentException;
use ReflectionMethod;
use ReflectionNamedType;

class RollingOriginEvaluator
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
     * Minimum valid origins required to reselect models.
     */
    public const MIN_ORIGINS = 3;

    /**
     * Custom forecaster drivers or mocks.
     *
     * @var array<string, mixed>
     */
    private array $forecasters;

    private ?MovingAverageForecaster $movingAverageForecaster = null;

    private ?HoltWintersForecaster $holtWintersForecaster = null;

    private ForecastModelRunner $runner;

    /**
     * @param  array<string, mixed>  $forecasters
     */
    public function __construct(array $forecasters = [], ?ForecastModelRunner $runner = null)
    {
        $this->forecasters = $forecasters;
        $this->runner = $runner ?? app(ForecastModelRunner::class);
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
        return ModelSelector::eligibleCandidates($seriesLength);
    }

    /**
     * Evaluate observations with strictly leak-free validation and holdout separation.
     *
     * @param  list<array{date: string, observed_sales: float|null, is_open: bool, is_missing: bool, is_stockout: bool}>  $rows
     * @return array{
     *     origins: list<array<string, mixed>>,
     *     evaluations: list<array<string, mixed>>,
     *     selected: array<string, mixed>|null,
     *     can_reselect: bool,
     *     origins_count: int,
     *     holdout: array<string, mixed>,
     *     points: list<array<string, mixed>>
     * }
     */
    public function evaluateObservations(
        array $rows,
        int $horizon,
        int $initialWindow = 56,
        int $step = 7,
        int $maxOrigins = 8
    ): array {
        if ($horizon <= 0) {
            throw new InvalidArgumentException("Horizon must be greater than zero, got {$horizon}.");
        }

        usort($rows, fn ($a, $b) => strcmp($a['date'], $b['date']));
        $totalRows = count($rows);

        if ($totalRows < ($horizon + 1)) {
            return [
                'origins' => [],
                'evaluations' => [],
                'selected' => null,
                'can_reselect' => false,
                'origins_count' => 0,
                'holdout' => [],
                'points' => [],
            ];
        }

        // Split pre-holdout vs final holdout
        $preHoldoutRows = array_slice($rows, 0, -$horizon);
        $holdoutRows = array_slice($rows, -$horizon);
        $preHoldoutCount = count($preHoldoutRows);

        // Find nearest validation cutoffs
        $allCutoffs = [];
        for ($c = $initialWindow; $c + $horizon <= $preHoldoutCount; $c += $step) {
            $allCutoffs[] = $c;
        }

        $cutoffs = count($allCutoffs) > $maxOrigins ? array_slice($allCutoffs, -$maxOrigins) : $allCutoffs;

        $points = [];
        $originsData = [];
        $candidates = ForecastModelRunner::CANDIDATES;

        /** @var array<string, list<float|null>> $candActuals */
        $candActuals = [];
        /** @var array<string, list<float|null>> $candPreds */
        $candPreds = [];
        foreach ($candidates as $k) {
            $candActuals[$k] = [];
            $candPreds[$k] = [];
        }

        $preprocessor = new DemandPreprocessor;
        $candSuccess = [];
        foreach ($candidates as $k) {
            $candSuccess[$k] = 0;
        }

        foreach ($cutoffs as $idx => $cutoff) {
            $trainSlice = array_slice($preHoldoutRows, 0, $cutoff);
            $originDate = (string) $trainSlice[count($trainSlice) - 1]['date'];

            $trainPrep = $preprocessor->prepare($trainSlice, $originDate);
            $valSlice = array_slice($preHoldoutRows, $cutoff, $horizon);

            $foldActuals = array_map(fn ($r) => $r['observed_sales'] !== null ? (float) $r['observed_sales'] : null, $valSlice);
            $foldDates = array_map(fn ($r) => (string) $r['date'], $valSlice);

            $foldForecasts = [];
            $foldMetrics = [];

            foreach ($candidates as $candKey) {
                $runRes = $this->runner->run($candKey, $trainPrep['values'], $horizon);

                if ($runRes['status'] === 'evaluated' && ! empty($runRes['predictions'])) {
                    $candSuccess[$candKey]++;
                    $foldForecasts[$candKey] = $runRes['predictions'];
                    $foldMetrics[$candKey] = ForecastMetrics::summarize($foldActuals, $runRes['predictions']);

                    for ($h = 0; $h < $horizon; $h++) {
                        $act = $foldActuals[$h];
                        $pred = $runRes['predictions'][$h] ?? null;

                        $candActuals[$candKey][] = $act;
                        $candPreds[$candKey][] = $pred;

                        $points[] = [
                            'stage' => 'validation',
                            'origin_date' => $originDate,
                            'target_date' => $foldDates[$h],
                            'model_key' => $candKey,
                            'observed_actual' => $act,
                            'predicted' => $pred,
                            'status' => 'evaluated',
                            'reason' => null,
                        ];
                    }
                } else {
                    $foldForecasts[$candKey] = [];
                    $foldMetrics[$candKey] = ['mae' => null, 'rmse' => null, 'wape' => null];

                    for ($h = 0; $h < $horizon; $h++) {
                        $points[] = [
                            'stage' => 'validation',
                            'origin_date' => $originDate,
                            'target_date' => $foldDates[$h],
                            'model_key' => $candKey,
                            'observed_actual' => $foldActuals[$h],
                            'predicted' => null,
                            'status' => $runRes['status'],
                            'reason' => $runRes['reason'],
                        ];
                    }
                }
            }

            $originsData[] = [
                'origin_index' => $idx,
                'cutoff' => $cutoff,
                'origin_date' => $originDate,
                'horizon' => $horizon,
                'actual' => $foldActuals,
                'forecasts' => $foldForecasts,
                'metrics' => $foldMetrics,
            ];
        }

        // Aggregate validation metrics per candidate; only fully successful candidates are eligible.
        $evaluations = [];
        $totalCutoffs = count($cutoffs);
        foreach ($candidates as $candKey) {
            $summary = ForecastMetrics::summarize($candActuals[$candKey], $candPreds[$candKey]);
            $defaultParams = $this->runner->defaultParametersFor($candKey);
            $successCount = (int) $candSuccess[$candKey];
            $eligible = $successCount === $totalCutoffs && $totalCutoffs > 0 && $summary['scored_count'] > 0;

            $evaluations[] = [
                'model_key' => $candKey,
                'parameters' => $defaultParams,
                'mae' => $eligible ? $summary['mae'] : null,
                'rmse' => $eligible ? $summary['rmse'] : null,
                'wape' => $eligible ? $summary['wape'] : null,
                'origins_count' => $successCount,
                'successful_origins' => $successCount,
                'eligible_for_selection' => $eligible,
                'status' => $eligible ? 'evaluated' : 'skipped',
                'reason' => $eligible ? null : ($successCount < $totalCutoffs ? "Only {$successCount}/{$totalCutoffs} folds succeeded." : 'No scored points.'),
                'validation_sums' => [
                    'sum_abs_error' => $summary['sum_abs_error'],
                    'sum_sq_error' => $summary['sum_sq_error'],
                    'sum_actual' => $summary['sum_actual'],
                    'scored_count' => $summary['scored_count'],
                ],
            ];
        }

        $canReselect = count($cutoffs) >= self::MIN_ORIGINS;
        $selected = null;
        if ($canReselect) {
            try {
                $selected = ModelSelector::select($evaluations);
            } catch (\Throwable) {
                $selected = null;
            }
        }

        // Final holdout evaluation (strictly separated from model selection)
        $holdoutOriginDate = (string) $preHoldoutRows[$preHoldoutCount - 1]['date'];
        $holdoutPrep = $preprocessor->prepare($preHoldoutRows, $holdoutOriginDate);

        $holdoutActuals = array_map(fn ($r) => $r['observed_sales'] !== null ? (float) $r['observed_sales'] : null, $holdoutRows);
        $holdoutDates = array_map(fn ($r) => (string) $r['date'], $holdoutRows);

        $holdoutKeys = array_values(array_unique(array_filter([
            $selected['model_key'] ?? null,
            'naive',
            'seasonal_naive_7',
            'sma_7',
        ])));

        $holdoutMetrics = [];
        foreach ($holdoutKeys as $hKey) {
            $hRes = $this->runner->run($hKey, $holdoutPrep['values'], $horizon);
            if ($hRes['status'] === 'evaluated') {
                $summary = ForecastMetrics::summarize($holdoutActuals, $hRes['predictions']);
                $holdoutMetrics[$hKey] = $summary;

                for ($h = 0; $h < $horizon; $h++) {
                    $points[] = [
                        'stage' => 'holdout',
                        'origin_date' => $holdoutOriginDate,
                        'target_date' => $holdoutDates[$h],
                        'model_key' => $hKey,
                        'observed_actual' => $holdoutActuals[$h],
                        'predicted' => $hRes['predictions'][$h] ?? null,
                        'status' => 'evaluated',
                        'reason' => null,
                    ];
                }
            } else {
                $holdoutMetrics[$hKey] = ['mae' => null, 'rmse' => null, 'wape' => null];

                for ($h = 0; $h < $horizon; $h++) {
                    $points[] = [
                        'stage' => 'holdout',
                        'origin_date' => $holdoutOriginDate,
                        'target_date' => $holdoutDates[$h],
                        'model_key' => $hKey,
                        'observed_actual' => $holdoutActuals[$h],
                        'predicted' => null,
                        'status' => $hRes['status'],
                        'reason' => $hRes['reason'],
                    ];
                }
            }
        }

        return [
            'origins' => $originsData,
            'evaluations' => $evaluations,
            'selected' => $selected,
            'can_reselect' => $canReselect,
            'origins_count' => count($cutoffs),
            'holdout' => [
                'origin_date' => $holdoutOriginDate,
                'metrics' => $holdoutMetrics,
            ],
            'points' => $points,
        ];
    }

    /**
     * Backward-compatible evaluate on numeric series array.
     *
     * @param  array<int, float|int>  $series
     * @param  array<int|string, mixed>  $candidates
     * @return array{
     *     origins: list<array{origin_index: int, cutoff: int, horizon: int, actual: list<float>, forecasts: array<string, list<float>>, metrics: array<string, array{mae: float, rmse: float, wape: float|null}>}>,
     *     evaluations: list<array{model_key: string, parameters: array<string, mixed>, mae: float, rmse: float, wape: float|null, origins_count: int}>,
     *     selected: array{model_key: string, parameters: array<string, mixed>, mae: float, rmse: float, wape: float|null}|null,
     *     can_reselect: bool,
     *     origins_count: int
     * }
     *
     * @throws InvalidArgumentException
     */
    public function evaluate(
        array $series,
        array $candidates = [],
        int $initialWindow = 56,
        int $horizon = 7,
        int $step = 7,
        int $maxOrigins = 8
    ): array {
        if (empty($series)) {
            throw new InvalidArgumentException('Series cannot be empty.');
        }

        if ($initialWindow <= 0) {
            throw new InvalidArgumentException("Initial window must be greater than zero, got {$initialWindow}.");
        }

        if ($horizon <= 0) {
            throw new InvalidArgumentException("Horizon must be greater than zero, got {$horizon}.");
        }

        if ($step <= 0) {
            throw new InvalidArgumentException("Step must be greater than zero, got {$step}.");
        }

        if ($maxOrigins <= 0) {
            throw new InvalidArgumentException("Max origins must be greater than zero, got {$maxOrigins}.");
        }

        /** @var list<float> $seriesValues */
        $seriesValues = [];
        foreach ($series as $val) {
            if (! is_finite((float) $val) || (float) $val < 0.0) {
                throw new InvalidArgumentException('Series values must be non-negative finite numbers.');
            }
            $seriesValues[] = (float) $val;
        }

        $seriesLength = count($seriesValues);
        $normalizedCandidates = $this->normalizeCandidates($candidates, $seriesLength);

        // Generate origin cutoffs using expanding window: initialWindow, +step, ..., up to maxOrigins
        $cutoffs = [];
        for ($cutoff = $initialWindow; $cutoff + $horizon <= $seriesLength && count($cutoffs) < $maxOrigins; $cutoff += $step) {
            $cutoffs[] = $cutoff;
        }

        $originsData = [];
        /** @var array<string, list<float>> $allActuals */
        $allActuals = [];
        /** @var array<string, list<float>> $allPredicted */
        $allPredicted = [];

        foreach ($normalizedCandidates as $cand) {
            $key = $cand['key'];
            $allActuals[$key] = [];
            $allPredicted[$key] = [];
        }

        foreach ($cutoffs as $idx => $cutoff) {
            // Strictly leak-free: training slice contains only observations before the cutoff
            $trainingSlice = array_slice($seriesValues, 0, $cutoff);
            $validationSlice = array_slice($seriesValues, $cutoff, $horizon);

            $foldForecasts = [];
            $foldMetrics = [];

            foreach ($normalizedCandidates as $cand) {
                $key = $cand['key'];
                $params = $cand['parameters'];

                $forecast = $this->runForecast($key, $trainingSlice, $params, $horizon);
                if (count($forecast) !== $horizon) {
                    throw new InvalidArgumentException("Candidate '{$key}' returned ".count($forecast)." forecasts, expected {$horizon}.");
                }

                $foldForecasts[$key] = $forecast;
                $foldMetrics[$key] = ForecastMetrics::calculate($validationSlice, $forecast);

                foreach ($validationSlice as $act) {
                    $allActuals[$key][] = $act;
                }
                foreach ($forecast as $pred) {
                    $allPredicted[$key][] = $pred;
                }
            }

            $originsData[] = [
                'origin_index' => $idx,
                'cutoff' => $cutoff,
                'horizon' => $horizon,
                'actual' => $validationSlice,
                'forecasts' => $foldForecasts,
                'metrics' => $foldMetrics,
            ];
        }

        // Aggregate metrics: WAPE calculated from summed absolute errors over summed actuals across all validation observations
        $evaluations = [];
        if (! empty($originsData)) {
            foreach ($normalizedCandidates as $cand) {
                $key = $cand['key'];
                $params = $cand['parameters'];

                $metrics = ForecastMetrics::calculate($allActuals[$key], $allPredicted[$key]);

                $evaluations[] = [
                    'model_key' => $key,
                    'parameters' => $params,
                    'mae' => $metrics['mae'],
                    'rmse' => $metrics['rmse'],
                    'wape' => $metrics['wape'],
                    'origins_count' => count($originsData),
                ];
            }
        }

        $canReselect = count($originsData) >= self::MIN_ORIGINS;
        $selected = ($canReselect && ! empty($evaluations))
            ? ModelSelector::select($evaluations)
            : null;

        return [
            'origins' => $originsData,
            'evaluations' => $evaluations,
            'selected' => $selected,
            'can_reselect' => $canReselect,
            'origins_count' => count($originsData),
        ];
    }

    /**
     * @param  array<int|string, mixed>  $candidates
     * @return list<array{key: string, parameters: array<string, mixed>}>
     */
    private function normalizeCandidates(array $candidates, int $seriesLength): array
    {
        if (empty($candidates)) {
            $eligible = self::eligibleCandidates($seriesLength);
            $candidates = ! empty($eligible) ? $eligible : self::CANDIDATES;
        }

        $result = [];
        foreach ($candidates as $key => $item) {
            if (is_string($item)) {
                $candKey = $item;
                $params = $this->defaultParametersFor($candKey);
            } elseif (is_array($item)) {
                $candKey = (string) ($item['key'] ?? $item['model_key'] ?? (is_string($key) ? $key : ''));
                /** @var array<string, mixed> $params */
                $params = isset($item['parameters']) && is_array($item['parameters'])
                    ? array_merge($this->defaultParametersFor($candKey), $item['parameters'])
                    : $this->defaultParametersFor($candKey);
            } else {
                throw new InvalidArgumentException('Candidate must be string key or array configuration.');
            }

            if ($candKey === '') {
                throw new InvalidArgumentException('Missing candidate key in configuration.');
            }

            $result[] = [
                'key' => $candKey,
                'parameters' => $params,
            ];
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function defaultParametersFor(string $key): array
    {
        return match ($key) {
            'sma_7' => ['window' => 7],
            'sma_14' => ['window' => 14],
            'sma_28' => ['window' => 28],
            'holt_winters_additive' => ['period' => 7, 'mode' => 'additive'],
            'holt_winters_multiplicative' => ['period' => 7, 'mode' => 'multiplicative'],
            default => [],
        };
    }

    /**
     * @param  list<float>  $trainingSeries
     * @param  array<string, mixed>  $parameters
     * @return list<float>
     */
    private function runForecast(string $key, array $trainingSeries, array $parameters, int $horizon): array
    {
        if (isset($this->forecasters[$key])) {
            $driver = $this->forecasters[$key];

            if (is_callable($driver)) {
                /** @var array<int, float|int> $res */
                $res = $driver($trainingSeries, $parameters, $horizon);

                return array_map('floatval', array_values($res));
            }

            if ($driver instanceof MovingAverageForecaster) {
                $window = (int) ($parameters['window'] ?? 7);

                return $driver->forecast($trainingSeries, $window, $horizon);
            }

            if ($driver instanceof HoltWintersForecaster) {
                $period = (int) ($parameters['period'] ?? 7);
                $mode = (string) ($parameters['mode'] ?? 'additive');

                return $driver->forecast($trainingSeries, $period, $horizon, $mode, $parameters);
            }

            if (is_object($driver) && method_exists($driver, 'forecast')) {
                $ref = new ReflectionMethod($driver, 'forecast');
                $refParams = $ref->getParameters();
                if (isset($refParams[1]) && $refParams[1]->hasType()) {
                    $type = $refParams[1]->getType();
                    if ($type instanceof ReflectionNamedType && $type->getName() === 'int') {
                        $arg2 = (int) ($parameters['window'] ?? $parameters['period'] ?? 7);
                        /** @var array<int, float|int> $res */
                        $res = $driver->forecast($trainingSeries, $arg2, $horizon);

                        return array_map('floatval', array_values($res));
                    }
                }

                /** @var array<int, float|int> $res */
                $res = $driver->forecast($trainingSeries, $parameters, $horizon);

                return array_map('floatval', array_values($res));
            }
        }

        if ($key === 'sma_7' || $key === 'sma_14' || $key === 'sma_28') {
            $window = (int) ($parameters['window'] ?? (int) substr($key, 4));

            return $this->getMovingAverageForecaster()->forecast($trainingSeries, $window, $horizon);
        }

        if ($key === 'holt_winters_additive') {
            $period = (int) ($parameters['period'] ?? 7);

            return $this->getHoltWintersForecaster()->forecast($trainingSeries, $period, $horizon, 'additive', $parameters);
        }

        if ($key === 'holt_winters_multiplicative') {
            $period = (int) ($parameters['period'] ?? 7);

            return $this->getHoltWintersForecaster()->forecast($trainingSeries, $period, $horizon, 'multiplicative', $parameters);
        }

        throw new InvalidArgumentException("Unknown forecasting candidate '{$key}'.");
    }

    private function getMovingAverageForecaster(): MovingAverageForecaster
    {
        return $this->movingAverageForecaster ??= new MovingAverageForecaster;
    }

    private function getHoltWintersForecaster(): HoltWintersForecaster
    {
        return $this->holtWintersForecaster ??= new HoltWintersForecaster;
    }
}
