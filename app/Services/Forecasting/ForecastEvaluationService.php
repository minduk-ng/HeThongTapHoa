<?php

namespace App\Services\Forecasting;

use App\Models\ForecastEvaluationPoint;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\MenuItem;
use App\Models\SyntheticDataset;

class ForecastEvaluationService
{
    public function __construct(
        private DemandSeriesBuilder $seriesBuilder,
        private RollingOriginEvaluator $evaluator
    ) {}

    public function evaluate(ForecastRun $run): void
    {
        $itemIds = [];
        if ($run->synthetic_dataset_id !== null) {
            $dataset = SyntheticDataset::find($run->synthetic_dataset_id);
            if ($dataset && ! empty($dataset->configuration['menu_item_ids'])) {
                $itemIds = array_map('intval', array_values($dataset->configuration['menu_item_ids']));
            }
        }

        if (empty($itemIds)) {
            $itemIds = MenuItem::where('is_available', true)->pluck('id')->all();
            if (empty($itemIds)) {
                $itemIds = MenuItem::pluck('id')->all();
            }
        }

        $horizon = $run->horizon_days > 0 ? $run->horizon_days : (int) config('forecasting.evaluation.horizon', 7);
        $cutoffStr = $run->data_cutoff ? $run->data_cutoff->toDateString() : now()->subDay()->toDateString();

        foreach ($itemIds as $itemId) {
            $rows = $this->seriesBuilder->observations($itemId, $run->synthetic_dataset_id, '2020-01-01', $cutoffStr);

            if (empty($rows)) {
                ForecastModelEvaluation::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $itemId,
                    'model_key' => 'sma_7',
                    'parameters' => ['window' => 7],
                    'mae' => null,
                    'rmse' => null,
                    'wape' => null,
                    'origins_evaluated' => 0,
                    'is_selected' => true,
                    'status' => 'fallback',
                    'reason' => 'No historical observations found up to cutoff',
                    'selection_notes' => 'Fallback evaluation for missing series',
                    'metrics' => null,
                ]);

                continue;
            }

            $evalResult = $this->evaluator->evaluateObservations($rows, $horizon);

            if ($evalResult['origins_count'] < RollingOriginEvaluator::MIN_ORIGINS || empty($evalResult['evaluations'])) {
                ForecastModelEvaluation::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $itemId,
                    'model_key' => 'sma_7',
                    'parameters' => ['window' => 7],
                    'mae' => null,
                    'rmse' => null,
                    'wape' => null,
                    'origins_evaluated' => (int) $evalResult['origins_count'],
                    'is_selected' => true,
                    'status' => 'fallback',
                    'reason' => 'Fewer than 3 valid origins evaluated',
                    'selection_notes' => 'Fallback evaluation for short series',
                    'metrics' => null,
                ]);

                continue;
            }

            $selectedKey = $evalResult['selected']['model_key'] ?? null;
            $hasSelected = false;

            foreach ($evalResult['evaluations'] as $cand) {
                $isSelected = ($selectedKey !== null && $cand['model_key'] === $selectedKey);
                if ($isSelected) {
                    $hasSelected = true;
                }

                $hMetrics = $evalResult['holdout']['metrics'][$cand['model_key']] ?? null;

                ForecastModelEvaluation::create([
                    'forecast_run_id' => $run->id,
                    'menu_item_id' => $itemId,
                    'model_key' => $cand['model_key'],
                    'parameters' => $cand['parameters'],
                    'mae' => $cand['mae'],
                    'rmse' => $cand['rmse'],
                    'wape' => $cand['wape'],
                    'origins_evaluated' => $cand['origins_count'],
                    'is_selected' => $isSelected,
                    'status' => $cand['status'] ?? 'evaluated',
                    'selection_notes' => $isSelected ? 'Selected by minimum WAPE / tie-break MAE' : null,
                    'validation_sums' => $cand['validation_sums'] ?? null,
                    'holdout_metrics' => $hMetrics,
                    'metrics' => [
                        'mae' => $cand['mae'],
                        'rmse' => $cand['rmse'],
                        'wape' => $cand['wape'],
                        'holdout_mae' => $hMetrics['mae'] ?? null,
                        'holdout_rmse' => $hMetrics['rmse'] ?? null,
                        'holdout_wape' => $hMetrics['wape'] ?? null,
                    ],
                ]);
            }

            if (! $hasSelected) {
                ForecastModelEvaluation::where('forecast_run_id', $run->id)
                    ->where('menu_item_id', $itemId)
                    ->whereNotNull('mae')
                    ->limit(1)
                    ->update(['is_selected' => true]);
            }

            // Persist points into forecast_evaluation_points in batches
            if (! empty($evalResult['points'])) {
                $pointChunks = array_chunk($evalResult['points'], 500);
                $now = now();

                foreach ($pointChunks as $chunk) {
                    $insertPoints = [];
                    foreach ($chunk as $p) {
                        $insertPoints[] = [
                            'forecast_run_id' => $run->id,
                            'menu_item_id' => $itemId,
                            'stage' => $p['stage'],
                            'origin_date' => $p['origin_date'],
                            'target_date' => $p['target_date'],
                            'model_key' => $p['model_key'],
                            'observed_actual' => $p['observed_actual'] !== null ? (float) $p['observed_actual'] : null,
                            'predicted' => $p['predicted'] !== null ? (float) $p['predicted'] : null,
                            'status' => $p['status'] ?? 'evaluated',
                            'reason' => $p['reason'] ?? null,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                    ForecastEvaluationPoint::insert($insertPoints);
                }
            }
        }
    }
}
