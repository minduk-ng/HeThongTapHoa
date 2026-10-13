<?php

namespace App\Services\Forecasting;

use App\Models\ForecastEvaluationPoint;
use App\Models\ForecastExperiment;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\InventoryRecommendation;
use App\Models\ProductForecast;
use App\Models\SyntheticObservation;
use App\Support\SpreadsheetCellSanitizer;
use Carbon\Carbon;
use InvalidArgumentException;

class ForecastEvidenceExporter
{
    public const ALLOWED_FILES = [
        'manifest.json',
        'observations.csv',
        'fold_predictions.csv',
        'model_metrics.csv',
        'holdout_predictions.csv',
        'forecast.csv',
        'recommendations.csv',
    ];

    /**
     * @return array<string, mixed>
     */
    public function manifest(ForecastRun $run): array
    {
        $runConfig = $run->configuration;
        $config = is_array($runConfig) ? $runConfig : [];
        $dataset = $run->synthetic_dataset_id !== null ? $run->syntheticDataset : null;

        return [
            'run_id' => $run->id,
            'kind' => $run->kind,
            'horizon_days' => $run->horizon_days,
            'data_cutoff' => $run->data_cutoff?->toISOString(),
            'status' => $run->status,
            'synthetic_dataset_id' => $run->synthetic_dataset_id,
            'dataset' => $dataset ? [
                'id' => $dataset->id,
                'name' => $dataset->name,
                'seed' => $dataset->seed,
                'generator_version' => $dataset->generator_version,
                'configuration_hash' => $dataset->configuration_hash,
                'dataset_hash' => $dataset->dataset_hash,
                'start_date' => $dataset->start_date?->toDateString(),
                'end_date' => $dataset->end_date?->toDateString(),
            ] : null,
            'configuration' => $config,
            'versions' => [
                'schema_version' => $config['schema_version'] ?? 2,
                'generator_version' => $dataset !== null ? $dataset->generator_version : 'unknown-legacy',
                'preprocessing_version' => $config['preprocessing_version'] ?? '1.0.0-legacy',
                'model_version' => $config['model_version'] ?? '2.0.0-legacy',
            ],
            'protocol' => [
                'target' => 'observed_sales',
                'initial_window' => 56,
                'step' => 7,
                'max_origins' => 8,
                'min_origins' => 3,
            ],
            'timestamps' => [
                'started_at' => $run->started_at?->toISOString(),
                'completed_at' => $run->completed_at?->toISOString(),
            ],
            'limitations' => [
                'Biên tham khảo ±20% là biên heuristic, không phải khoảng dự báo thống kê.',
                'Đánh giá mô phỏng được thực hiện trên dữ liệu giả lập có kiểm soát.',
            ],
        ];
    }

    /**
     * @return array{header: list<string>, rows: list<list<mixed>>}
     */
    /**
     * Aggregate experiment evaluation metrics across seeds.
     * Computes mean and sample stddev without confidence interval labels.
     *
     * @return array{header: list<string>, rows: list<list<mixed>>}
     */
    public function experimentSummary(ForecastExperiment $experiment): array
    {
        $header = [
            'preset',
            'horizon',
            'model_key',
            'stage',
            'target',
            'runs_count',
            'mean_mae',
            'stddev_mae',
            'mean_rmse',
            'stddev_rmse',
            'mean_wape',
            'stddev_wape',
        ];

        $runs = ForecastRun::where('experiment_id', $experiment->id)
            ->where('kind', 'evaluate')
            ->where('status', 'completed')
            ->with(['modelEvaluations', 'syntheticDataset'])
            ->get();

        $groups = [];

        foreach ($runs as $run) {
            $cellKey = (string) $run->cell_key;
            $parts = explode(':', $cellKey);
            $preset = $parts[0] !== '' ? $parts[0] : ($run->syntheticDataset?->configuration['preset'] ?? 'default');
            $horizon = (int) $run->horizon_days;

            $runValidation = [];
            $runHoldout = [];

            foreach ($run->modelEvaluations as $e) {
                $modelKey = $e->model_key;

                // Validation stage
                if ($e->status === 'evaluated' && $e->mae !== null) {
                    $runValidation[$modelKey]['mae'][] = (float) $e->mae;
                    $runValidation[$modelKey]['rmse'][] = (float) $e->rmse;
                    if ($e->wape !== null) {
                        $runValidation[$modelKey]['wape'][] = (float) $e->wape;
                    }
                }

                // Holdout stage
                $holdout = $e->holdout_metrics;
                if (is_array($holdout) && ($holdout['scored_count'] ?? 0) > 0 && isset($holdout['mae'])) {
                    $runHoldout[$modelKey]['mae'][] = (float) $holdout['mae'];
                    $runHoldout[$modelKey]['rmse'][] = (float) $holdout['rmse'];
                    if (($holdout['wape'] ?? null) !== null) {
                        $runHoldout[$modelKey]['wape'][] = (float) $holdout['wape'];
                    }
                }
            }

            // Record run-level macro metrics for validation
            foreach ($runValidation as $modelKey => $metrics) {
                $groupKey = "{$preset}|{$horizon}|{$modelKey}|validation|observed_sales";
                $groups[$groupKey]['preset'] = $preset;
                $groups[$groupKey]['horizon'] = $horizon;
                $groups[$groupKey]['model_key'] = $modelKey;
                $groups[$groupKey]['stage'] = 'validation';
                $groups[$groupKey]['target'] = 'observed_sales';

                $groups[$groupKey]['mae_runs'][] = array_sum($metrics['mae']) / count($metrics['mae']);
                $groups[$groupKey]['rmse_runs'][] = array_sum($metrics['rmse']) / count($metrics['rmse']);
                if (! empty($metrics['wape'])) {
                    $groups[$groupKey]['wape_runs'][] = array_sum($metrics['wape']) / count($metrics['wape']);
                }
            }

            // Record run-level macro metrics for holdout
            foreach ($runHoldout as $modelKey => $metrics) {
                $groupKey = "{$preset}|{$horizon}|{$modelKey}|holdout|observed_sales";
                $groups[$groupKey]['preset'] = $preset;
                $groups[$groupKey]['horizon'] = $horizon;
                $groups[$groupKey]['model_key'] = $modelKey;
                $groups[$groupKey]['stage'] = 'holdout';
                $groups[$groupKey]['target'] = 'observed_sales';

                $groups[$groupKey]['mae_runs'][] = array_sum($metrics['mae']) / count($metrics['mae']);
                $groups[$groupKey]['rmse_runs'][] = array_sum($metrics['rmse']) / count($metrics['rmse']);
                if (! empty($metrics['wape'])) {
                    $groups[$groupKey]['wape_runs'][] = array_sum($metrics['wape']) / count($metrics['wape']);
                }
            }
        }

        $rows = [];
        ksort($groups);

        foreach ($groups as $g) {
            $maeRuns = $g['mae_runs'];
            $rmseRuns = $g['rmse_runs'];
            $wapeRuns = $g['wape_runs'] ?? [];

            $runsCount = count($maeRuns);
            $meanMae = $this->mean($maeRuns);
            $stddevMae = $this->sampleStdDev($maeRuns, $meanMae);

            $meanRmse = $this->mean($rmseRuns);
            $stddevRmse = $this->sampleStdDev($rmseRuns, $meanRmse);

            $meanWape = $this->mean($wapeRuns);
            $stddevWape = $this->sampleStdDev($wapeRuns, $meanWape);

            $rows[] = [
                $g['preset'],
                $g['horizon'],
                $g['model_key'],
                $g['stage'],
                $g['target'],
                $runsCount,
                $meanMae,
                $stddevMae,
                $meanRmse,
                $stddevRmse,
                $meanWape,
                $stddevWape,
            ];
        }

        return ['header' => $header, 'rows' => $rows];
    }

    /**
     * Persist complete acceptance matrix artifacts to disk before test teardown.
     */
    public function persistExperimentArtifacts(ForecastExperiment $experiment, ?string $baseDir = null): string
    {
        $dir = $baseDir ?? storage_path("app/forecasting-acceptance/{$experiment->id}");
        \Illuminate\Support\Facades\File::ensureDirectoryExists($dir);

        // 1. Save manifest.json
        $config = is_array($experiment->configuration) ? $experiment->configuration : [];
        $runs = $experiment->runs()->get(['id', 'kind', 'horizon_days', 'status', 'cell_key', 'synthetic_dataset_id'])->all();
        $manifest = [
            'experiment_id' => $experiment->id,
            'status' => $experiment->status,
            'configuration' => $config,
            'runs' => $runs,
            'exported_at' => now()->toISOString(),
        ];
        file_put_contents("{$dir}/manifest.json", json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // 2. Save summary.csv
        $summary = $this->experimentSummary($experiment);
        $summaryFile = fopen("{$dir}/summary.csv", 'w');
        if (is_resource($summaryFile)) {
            fputcsv($summaryFile, $summary['header']);
            foreach ($summary['rows'] as $row) {
                fputcsv($summaryFile, array_map(fn ($val) => $val === null ? '' : (string) $val, $row));
            }
            fclose($summaryFile);
        }

        // 3. Save per-run evidence for completed evaluate runs
        $evalRuns = $experiment->runs()->where('kind', 'evaluate')->where('status', 'completed')->get();
        foreach ($evalRuns as $run) {
            $safeCell = str_replace(':', '_', (string) $run->cell_key);
            $runDir = "{$dir}/runs/run_{$run->id}_{$safeCell}";
            \Illuminate\Support\Facades\File::ensureDirectoryExists($runDir);

            file_put_contents("{$runDir}/manifest.json", json_encode($this->manifest($run), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            foreach (['model_metrics.csv', 'holdout_predictions.csv', 'fold_predictions.csv'] as $file) {
                try {
                    $export = $this->exportData($run, $file);
                    $fp = fopen("{$runDir}/{$file}", 'w');
                    if (is_resource($fp)) {
                        fputcsv($fp, $export['header']);
                        foreach ($export['rows'] as $row) {
                            fputcsv($fp, array_map(fn ($val) => $val === null ? '' : (string) $val, $row));
                        }
                        fclose($fp);
                    }
                } catch (\Throwable) {
                    // skip non-existent tables/points
                }
            }
        }

        return $dir;
    }

    /**
     * @param  list<float>  $values
     */
    private function mean(array $values): ?float
    {
        $count = count($values);
        if ($count === 0) {
            return null;
        }

        return round(array_sum($values) / $count, 6);
    }

    /**
     * @param  list<float>  $values
     */
    private function sampleStdDev(array $values, ?float $mean = null): ?float
    {
        $count = count($values);
        if ($count < 2) {
            return null;
        }

        $mean ??= array_sum($values) / $count;
        $sumSqDiff = 0.0;
        foreach ($values as $v) {
            $sumSqDiff += pow($v - $mean, 2);
        }

        return round(sqrt($sumSqDiff / ($count - 1)), 6);
    }

    /**
     * Generate header and row generator for CSV export.
     *
     * @return array{header: list<string>, rows: iterable<list<mixed>>}
     *
     * @throws InvalidArgumentException
     */
    public function exportData(ForecastRun $run, string $filename): array
    {
        return match ($filename) {
            'observations.csv' => $this->observationsData($run),
            'fold_predictions.csv' => $this->pointsData($run, 'validation'),
            'holdout_predictions.csv' => $this->pointsData($run, 'holdout'),
            'model_metrics.csv' => $this->metricsData($run),
            'forecast.csv' => $this->forecastData($run),
            'recommendations.csv' => $this->recommendationsData($run),
            default => throw new InvalidArgumentException("Unknown export file: {$filename}"),
        };
    }

    /**
     * @return array{header: list<string>, rows: iterable<list<mixed>>}
     */
    private function observationsData(ForecastRun $run): array
    {
        $header = ['dataset_id', 'menu_item_id', 'date', 'latent_demand', 'observed_sales', 'is_open', 'is_missing', 'is_stockout'];

        $records = $run->synthetic_dataset_id
            ? SyntheticObservation::where('synthetic_dataset_id', $run->synthetic_dataset_id)->orderBy('date')->get()
            : [];

        $rows = [];
        foreach ($records as $r) {
            $rows[] = [
                $r->synthetic_dataset_id,
                $r->menu_item_id,
                $r->date instanceof Carbon ? $r->date->toDateString() : (string) $r->date,
                $r->latent_demand,
                $r->observed_sales,
                $r->is_open ? 1 : 0,
                $r->is_missing ? 1 : 0,
                $r->is_stockout ? 1 : 0,
            ];
        }

        return ['header' => $header, 'rows' => $rows];
    }

    /**
     * @return array{header: list<string>, rows: iterable<list<mixed>>}
     */
    private function pointsData(ForecastRun $run, string $stage): array
    {
        $header = ['run_id', 'dataset_id', 'menu_item_id', 'model_key', 'stage', 'target', 'origin_date', 'target_date', 'observed_actual', 'predicted', 'status', 'reason'];

        $rows = [];
        $query = ForecastEvaluationPoint::where('forecast_run_id', $run->id)
            ->where('stage', $stage)
            ->orderBy('origin_date')
            ->orderBy('target_date')
            ->orderBy('menu_item_id')
            ->orderBy('model_key');
        foreach ($query->cursor() as $p) {
            $rows[] = [
                $p->forecast_run_id,
                $run->synthetic_dataset_id,
                $p->menu_item_id,
                $p->model_key,
                $p->stage,
                'observed_sales',
                $p->origin_date instanceof Carbon ? $p->origin_date->toDateString() : (string) $p->origin_date,
                $p->target_date instanceof Carbon ? $p->target_date->toDateString() : (string) $p->target_date,
                $p->observed_actual,
                $p->predicted,
                $p->status,
                SpreadsheetCellSanitizer::sanitize($p->reason ?? ''),
            ];
        }

        return ['header' => $header, 'rows' => $rows];
    }

    /**
     * @return array{header: list<string>, rows: iterable<list<mixed>>}
     */
    private function metricsData(ForecastRun $run): array
    {
        $header = ['run_id', 'menu_item_id', 'model_key', 'stage', 'target', 'status', 'is_selected', 'origins_evaluated', 'scored_points', 'mae', 'rmse', 'wape', 'sum_abs_error', 'sum_sq_error', 'sum_actual', 'parameters_json'];

        $rows = [];
        foreach (ForecastModelEvaluation::where('forecast_run_id', $run->id)->cursor() as $e) {
            $sums = $e->validation_sums ?? [];
            $rows[] = [
                $e->forecast_run_id,
                $e->menu_item_id,
                $e->model_key,
                'validation',
                'observed_sales',
                $e->status,
                $e->is_selected ? 1 : 0,
                $e->origins_evaluated,
                $sums['scored_count'] ?? '',
                $e->mae,
                $e->rmse,
                $e->wape,
                $sums['sum_abs_error'] ?? '',
                $sums['sum_sq_error'] ?? '',
                $sums['sum_actual'] ?? '',
                json_encode($e->parameters ?? []),
            ];
            $holdout = $e->holdout_metrics;
            if (is_array($holdout)) {
                $scoredPoints = (int) ($holdout['scored_count'] ?? 0);
                $rows[] = [
                    $e->forecast_run_id,
                    $e->menu_item_id,
                    $e->model_key,
                    'holdout',
                    'observed_sales',
                    $scoredPoints > 0 ? 'evaluated' : 'skipped',
                    0,
                    $scoredPoints > 0 ? 1 : 0,
                    $scoredPoints,
                    $holdout['mae'] ?? null,
                    $holdout['rmse'] ?? null,
                    $holdout['wape'] ?? null,
                    $holdout['sum_abs_error'] ?? null,
                    $holdout['sum_sq_error'] ?? null,
                    $holdout['sum_actual'] ?? null,
                    json_encode($e->parameters ?? []),
                ];
            }
        }

        return ['header' => $header, 'rows' => $rows];
    }

    /**
     * @return array{header: list<string>, rows: iterable<list<mixed>>}
     */
    private function forecastData(ForecastRun $run): array
    {
        $header = ['run_id', 'menu_item_id', 'forecast_date', 'forecast_quantity', 'status', 'model_key', 'bound_method', 'bound_percentage', 'lower_bound', 'upper_bound', 'data_quality'];

        $forecasts = ProductForecast::where('forecast_run_id', $run->id)->orderBy('forecast_date')->get();

        $rows = [];
        foreach ($forecasts as $f) {
            $rows[] = [
                $f->forecast_run_id,
                $f->menu_item_id,
                $f->forecast_date instanceof Carbon ? $f->forecast_date->toDateString() : (string) $f->forecast_date,
                $f->forecast_quantity,
                $f->status,
                $f->model_key,
                $f->bound_method,
                $f->bound_percentage,
                $f->lower_bound,
                $f->upper_bound,
                $f->data_quality,
            ];
        }

        return ['header' => $header, 'rows' => $rows];
    }

    /**
     * @return array{header: list<string>, rows: iterable<list<mixed>>}
     */
    private function recommendationsData(ForecastRun $run): array
    {
        $header = ['run_id', 'dataset_id', 'ingredient_id', 'status', 'base_unit', 'purchase_unit', 'lead_demand', 'safety_stock', 'reorder_point', 'raw_quantity', 'after_moq_quantity', 'final_quantity', 'pack_size', 'purchase_quantity', 'explanation_json'];

        $rows = [];
        foreach (InventoryRecommendation::where('forecast_run_id', $run->id)->cursor() as $r) {
            $explanation = is_array($r->explanation) ? $r->explanation : [];
            $pack = $explanation['pack_size'] ?? '';
            $finalQty = (float) $r->final_quantity;
            $purchaseQty = (is_numeric($pack) && (float) $pack > 0) ? round($finalQty / (float) $pack, 4) : '';
            $rows[] = [
                $r->forecast_run_id,
                $run->synthetic_dataset_id,
                $r->ingredient_id,
                $r->status,
                SpreadsheetCellSanitizer::sanitize((string) $r->unit),
                SpreadsheetCellSanitizer::sanitize((string) $r->purchase_unit),
                $explanation['lead_demand'] ?? $r->demand_quantity,
                $r->safety_stock,
                $r->reorder_point,
                $r->raw_quantity,
                $r->after_moq_quantity,
                $r->final_quantity,
                $pack,
                $purchaseQty,
                json_encode($explanation),
            ];
        }

        return ['header' => $header, 'rows' => $rows];
    }
}
