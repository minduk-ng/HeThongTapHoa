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
    public function experimentSummary(ForecastExperiment $experiment): array
    {
        $header = ['preset', 'seed', 'horizon', 'status', 'dataset_id', 'evaluate_run_id', 'forecast_run_id', 'error'];
        $expConfig = $experiment->configuration;
        $config = is_array($expConfig) ? $expConfig : [];
        $cells = $config['cells'] ?? [];
        $rows = [];
        foreach ($cells as $cellKey => $cell) {
            $parts = explode(':', (string) $cellKey);
            $rows[] = [
                $parts[0],
                $parts[1] ?? '',
                $parts[2] ?? '',
                $cell['status'] ?? '',
                $cell['dataset_id'] ?? '',
                $cell['evaluate_run_id'] ?? '',
                $cell['forecast_run_id'] ?? '',
                $cell['error'] ?? '',
            ];
        }

        return ['header' => $header, 'rows' => $rows];
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
