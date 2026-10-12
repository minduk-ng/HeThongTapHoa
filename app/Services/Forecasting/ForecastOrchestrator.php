<?php

namespace App\Services\Forecasting;

use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\MenuItem;
use App\Models\ProductForecast;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

class ForecastOrchestrator
{
    private DemandSeriesBuilder $seriesBuilder;

    private ForecastEvaluationService $evaluationService;

    private InventoryRecommendationBuilder $recommendationBuilder;

    private ForecastModelRunner $modelRunner;

    /**
     * @var array<string, mixed>
     */
    private array $customForecasters = [];

    /**
     * @param  array<string, mixed>  $customForecasters
     */
    public function __construct(
        ?DemandSeriesBuilder $seriesBuilder = null,
        ?ForecastEvaluationService $evaluationService = null,
        ?InventoryRecommendationBuilder $recommendationBuilder = null,
        ?ForecastModelRunner $modelRunner = null,
        array $customForecasters = []
    ) {
        $this->seriesBuilder = $seriesBuilder ?? app(DemandSeriesBuilder::class);
        $this->evaluationService = $evaluationService ?? app(ForecastEvaluationService::class);
        $this->recommendationBuilder = $recommendationBuilder ?? app(InventoryRecommendationBuilder::class);
        $this->modelRunner = $modelRunner ?? app(ForecastModelRunner::class);
        $this->customForecasters = $customForecasters;
    }

    /**
     * Execute a forecast run with transactional active swapping on success,
     * or rollback and failed status on error.
     */
    public function run(ForecastRun $run): void
    {
        $run->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        try {
            DB::transaction(function () use ($run) {
                match ($run->kind) {
                    'forecast' => $this->executeForecast($run),
                    'evaluate' => $this->executeEvaluation($run),
                    'aggregate' => $this->executeAggregation($run),
                    default => $this->executeForecast($run),
                };

                // ponytail: atomic swap of active run per kind, synthetic source scope, and horizon
                ForecastRun::where('kind', $run->kind)
                    ->where('id', '!=', $run->id)
                    ->where('horizon_days', $run->horizon_days)
                    ->where('is_active', true)
                    ->when(
                        $run->synthetic_dataset_id === null,
                        fn ($q) => $q->whereNull('synthetic_dataset_id'),
                        fn ($q) => $q->where('synthetic_dataset_id', $run->synthetic_dataset_id)
                    )
                    ->update(['is_active' => false]);

                $run->is_active = true;
                $run->status = 'completed';
                $run->completed_at = now();
                $run->error_message = null;
                $run->save();
            });
        } catch (Throwable $e) {
            // ponytail: transaction rolled back; preserve previous active run and flag failed state
            $run->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'is_active' => false,
                'completed_at' => now(),
            ]);
        }
    }

    private function executeForecast(ForecastRun $run): void
    {
        $menuItems = MenuItem::where('is_available', true)->get();
        if ($menuItems->isEmpty()) {
            $menuItems = MenuItem::all();
        }

        $horizon = $run->horizon_days > 0 ? $run->horizon_days : (int) config('forecasting.horizons.default', 7);

        $preprocessor = new DemandPreprocessor;
        foreach ($menuItems as $item) {
            $cutoffStr = $run->data_cutoff ? $run->data_cutoff->toDateString() : now()->subDay()->toDateString();
            $obsRows = $this->seriesBuilder->observations($item->id, $run->synthetic_dataset_id, '2020-01-01', $cutoffStr);
            $prepared = $preprocessor->prepare($obsRows, $cutoffStr);
            $series = $prepared['values'];
            $dataQuality = $prepared['quality'];
            $qualityCounts = $prepared['counts'];
            $unavailableReason = $prepared['unavailable_reason'];

            // Fetch previously selected model if available
            /** @var ForecastModelEvaluation|null $latestEval */
            $latestEval = ForecastModelEvaluation::where('menu_item_id', $item->id)
                ->where('is_selected', true)
                ->whereHas('forecastRun', function ($q) use ($run) {
                    $q->where('status', 'completed')
                        ->where('horizon_days', $run->horizon_days);
                    if ($run->synthetic_dataset_id === null) {
                        $q->whereNull('synthetic_dataset_id');
                    } else {
                        $q->where('synthetic_dataset_id', $run->synthetic_dataset_id);
                    }
                    if ($run->data_cutoff) {
                        $q->where('data_cutoff', '<=', $run->data_cutoff);
                    }
                })
                ->latest('id')
                ->first();

            $modelKey = $latestEval ? $latestEval->model_key : (string) config('forecasting.models.default', 'sma_7');
            /** @var array<string, mixed> $parameters */
            $parameters = $latestEval && is_array($latestEval->parameters)
                ? $latestEval->parameters
                : ['window' => 7];

            $predictions = null;
            $usedModelKey = $modelKey;
            $usedParameters = $parameters;
            if (empty($series)) {
                $dataQuality = 'insufficient';
            } else {
                try {
                    $predictions = $this->generatePredictions($modelKey, $series, $parameters, $horizon);
                } catch (Throwable $e) {
                    $unavailableReason = $e->getMessage();
                    foreach (['naive', 'sma_7'] as $fallbackKey) {
                        try {
                            $fallbackParams = $fallbackKey === 'naive' ? [] : ['window' => 7];
                            $predictions = $this->generatePredictions($fallbackKey, $series, $fallbackParams, $horizon);
                            $usedModelKey = $fallbackKey;
                            $usedParameters = $fallbackParams;
                            $unavailableReason = null;
                            break;
                        } catch (Throwable $fe) {
                            continue;
                        }
                    }
                }
            }

            for ($day = 1; $day <= $horizon; $day++) {
                $forecastDate = $run->data_cutoff->copy()->addDays($day)->toDateString();
                $qty = $predictions !== null ? max(0.0, (float) ($predictions[$day - 1] ?? 0.0)) : null;
                $lowerBound = $qty !== null ? max(0.0, round($qty * 0.8, 4)) : null;
                $upperBound = $qty !== null ? round($qty * 1.2, 4) : null;

                ProductForecast::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $item->id,
                    'forecast_date' => $forecastDate,
                    'forecast_quantity' => $qty !== null ? round($qty, 4) : null,
                    'lower_bound' => $lowerBound,
                    'upper_bound' => $upperBound,
                    'model_key' => $qty !== null ? $usedModelKey : null,
                    'status' => $qty !== null ? 'available' : 'unavailable',
                    'bound_method' => $qty !== null ? 'fixed_percentage' : null,
                    'bound_percentage' => $qty !== null ? 20.0 : null,
                    'parameters' => $usedParameters,
                    'data_cutoff' => $run->data_cutoff,
                    'data_quality' => $dataQuality,
                    'metrics' => [
                        'source_evaluation_id' => $latestEval?->id,
                        'quality_counts' => $qualityCounts,
                        'unavailable_reason' => $unavailableReason,
                        'eval_metrics' => $latestEval?->metrics,
                    ],
                ]);
            }
        }

        $this->recommendationBuilder->build($run);
    }

    private function executeEvaluation(ForecastRun $run): void
    {
        $this->evaluationService->evaluate($run);
    }

    private function executeAggregation(ForecastRun $run): void
    {
        $config = is_array($run->configuration) ? $run->configuration : [];
        $fromDate = isset($config['from']) && is_string($config['from'])
            ? Carbon::parse($config['from'])
            : null;

        $toDate = null;
        if (isset($config['to']) && is_string($config['to'])) {
            $toDate = Carbon::parse($config['to']);
        } elseif ($run->data_cutoff) {
            $toDate = Carbon::parse($run->data_cutoff);
        }

        $this->seriesBuilder->aggregate($run->synthetic_dataset_id, $fromDate, $toDate);
    }

    /**
     * @param  list<float>  $series
     * @param  array<string, mixed>  $parameters
     * @return list<float>
     */
    private function generatePredictions(string $modelKey, array $series, array $parameters, int $horizon): array
    {
        if (isset($this->customForecasters[$modelKey]) && is_callable($this->customForecasters[$modelKey])) {
            /** @var array<int, float|int> $res */
            $res = ($this->customForecasters[$modelKey])($series, $parameters, $horizon);

            return array_map('floatval', array_values($res));
        }
        $result = $this->modelRunner->run($modelKey, $series, $horizon, $parameters);
        if ($result['status'] !== 'evaluated' || empty($result['predictions'])) {
            throw new InvalidArgumentException("Forecasting candidate '{$modelKey}' unavailable: ".($result['reason'] ?? 'no predictions'));
        }
        if (count($result['predictions']) !== $horizon) {
            throw new InvalidArgumentException("Forecasting candidate '{$modelKey}' returned ".count($result['predictions'])." forecasts, expected {$horizon}.");
        }
        foreach ($result['predictions'] as $value) {
            if (! is_finite((float) $value) || (float) $value < 0.0) {
                throw new InvalidArgumentException("Forecasting candidate '{$modelKey}' returned invalid prediction.");
            }
        }

        return array_map('floatval', $result['predictions']);
    }
}
