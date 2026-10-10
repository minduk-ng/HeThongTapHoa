<?php

namespace App\Services\Forecasting;

use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\MenuItem;
use App\Models\ProductForecast;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

class ForecastOrchestrator
{
    private DemandSeriesBuilder $seriesBuilder;

    private MovingAverageForecaster $movingAverage;

    private HoltWintersForecaster $holtWinters;

    private RollingOriginEvaluator $evaluator;

    /**
     * @var array<string, mixed>
     */
    private array $customForecasters;

    /**
     * @param  array<string, mixed>  $customForecasters
     */
    public function __construct(
        ?DemandSeriesBuilder $seriesBuilder = null,
        ?MovingAverageForecaster $movingAverage = null,
        ?HoltWintersForecaster $holtWinters = null,
        ?RollingOriginEvaluator $evaluator = null,
        array $customForecasters = []
    ) {
        $this->seriesBuilder = $seriesBuilder ?? app(DemandSeriesBuilder::class);
        $this->movingAverage = $movingAverage ?? app(MovingAverageForecaster::class);
        $this->holtWinters = $holtWinters ?? app(HoltWintersForecaster::class);
        $this->evaluator = $evaluator ?? app(RollingOriginEvaluator::class);
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

                // ponytail: atomic swap of active run per kind and synthetic source scope
                ForecastRun::where('kind', $run->kind)
                    ->where('id', '!=', $run->id)
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

        foreach ($menuItems as $item) {
            $series = $this->seriesBuilder->getSeries(
                $item->id,
                $run->synthetic_dataset_id,
                $run->data_cutoff,
                120
            );

            // Fetch previously selected model if available
            /** @var ForecastModelEvaluation|null $latestEval */
            $latestEval = ForecastModelEvaluation::where('menu_item_id', $item->id)
                ->where('is_selected', true)
                ->whereHas('forecastRun', function ($q) use ($run) {
                    if ($run->synthetic_dataset_id === null) {
                        $q->whereNull('synthetic_dataset_id');
                    } else {
                        $q->where('synthetic_dataset_id', $run->synthetic_dataset_id);
                    }
                })
                ->latest('id')
                ->first();

            $modelKey = $latestEval ? $latestEval->model_key : (string) config('forecasting.models.default', 'sma_7');
            /** @var array<string, mixed> $parameters */
            $parameters = $latestEval && is_array($latestEval->parameters)
                ? $latestEval->parameters
                : ['window' => 7];

            $predictions = $this->generatePredictions($modelKey, $series, $parameters, $horizon);

            $nonZeroCount = count(array_filter($series, fn ($v) => $v > 0));
            $dataQuality = ($nonZeroCount < 7 || count($series) < 14) ? 'sparse' : 'sufficient';

            for ($day = 1; $day <= $horizon; $day++) {
                $forecastDate = $run->data_cutoff->copy()->addDays($day)->toDateString();
                $qty = max(0.0, (float) ($predictions[$day - 1] ?? 0.0));
                $lowerBound = max(0.0, round($qty * 0.8, 4));
                $upperBound = round($qty * 1.2, 4);

                ProductForecast::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $item->id,
                    'forecast_date' => $forecastDate,
                    'forecast_quantity' => round($qty, 4),
                    'lower_bound' => $lowerBound,
                    'upper_bound' => $upperBound,
                    'model_key' => $modelKey,
                    'parameters' => $parameters,
                    'data_cutoff' => $run->data_cutoff,
                    'data_quality' => $dataQuality,
                    'metrics' => $latestEval?->metrics,
                ]);
            }
        }
    }

    private function executeEvaluation(ForecastRun $run): void
    {
        $menuItems = MenuItem::where('is_available', true)->get();
        if ($menuItems->isEmpty()) {
            $menuItems = MenuItem::all();
        }

        foreach ($menuItems as $item) {
            $series = $this->seriesBuilder->getSeries(
                $item->id,
                $run->synthetic_dataset_id,
                $run->data_cutoff,
                120
            );

            if (count($series) < 14) {
                ForecastModelEvaluation::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $item->id,
                    'model_key' => 'sma_7',
                    'parameters' => ['window' => 7],
                    'mae' => 0.0,
                    'rmse' => 0.0,
                    'wape' => null,
                    'origins_evaluated' => 0,
                    'is_selected' => true,
                    'selection_notes' => 'Default fallback for short series',
                    'metrics' => ['mae' => 0.0, 'rmse' => 0.0, 'wape' => null],
                ]);

                continue;
            }

            $evalResult = $this->evaluator->evaluate($series);

            if (empty($evalResult['evaluations'])) {
                ForecastModelEvaluation::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $item->id,
                    'model_key' => 'sma_7',
                    'parameters' => ['window' => 7],
                    'mae' => 0.0,
                    'rmse' => 0.0,
                    'wape' => null,
                    'origins_evaluated' => 0,
                    'is_selected' => true,
                    'selection_notes' => 'Fallback evaluation for short series',
                    'metrics' => ['mae' => 0.0, 'rmse' => 0.0, 'wape' => null],
                ]);

                continue;
            }

            $hasSelected = false;
            foreach ($evalResult['evaluations'] as $cand) {
                $isSelected = ($evalResult['selected'] !== null && $cand['model_key'] === $evalResult['selected']['model_key']);
                if ($isSelected) {
                    $hasSelected = true;
                }

                ForecastModelEvaluation::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $item->id,
                    'model_key' => $cand['model_key'],
                    'parameters' => $cand['parameters'],
                    'mae' => $cand['mae'],
                    'rmse' => $cand['rmse'],
                    'wape' => $cand['wape'],
                    'origins_evaluated' => $cand['origins_count'],
                    'is_selected' => $isSelected,
                    'selection_notes' => $isSelected ? 'Selected by minimum WAPE / tie-break MAE' : null,
                    'metrics' => [
                        'mae' => $cand['mae'],
                        'rmse' => $cand['rmse'],
                        'wape' => $cand['wape'],
                    ],
                ]);
            }

            if (! $hasSelected) {
                ForecastModelEvaluation::where('forecast_run_id', $run->id)
                    ->where('menu_item_id', $item->id)
                    ->limit(1)
                    ->update(['is_selected' => true]);
            }
        }
    }

    private function executeAggregation(ForecastRun $run): void
    {
        $this->seriesBuilder->aggregate($run->synthetic_dataset_id);
    }

    /**
     * @param  list<float>  $series
     * @param  array<string, mixed>  $parameters
     * @return list<float>
     */
    private function generatePredictions(string $modelKey, array $series, array $parameters, int $horizon): array
    {
        if (isset($this->customForecasters[$modelKey])) {
            $driver = $this->customForecasters[$modelKey];
            if (is_callable($driver)) {
                /** @var array<int, float|int> $res */
                $res = $driver($series, $parameters, $horizon);

                return array_map('floatval', array_values($res));
            }
        }

        if (str_starts_with($modelKey, 'sma_')) {
            $window = (int) ($parameters['window'] ?? (int) substr($modelKey, 4));

            return $this->movingAverage->forecast($series, $window, $horizon);
        }

        if ($modelKey === 'holt_winters_additive') {
            $period = (int) ($parameters['period'] ?? 7);

            return $this->holtWinters->forecast($series, $period, $horizon, 'additive', $parameters);
        }

        if ($modelKey === 'holt_winters_multiplicative') {
            $period = (int) ($parameters['period'] ?? 7);

            return $this->holtWinters->forecast($series, $period, $horizon, 'multiplicative', $parameters);
        }

        throw new InvalidArgumentException("Unknown forecasting candidate '{$modelKey}'.");
    }
}
