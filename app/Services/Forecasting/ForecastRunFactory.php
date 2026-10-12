<?php

namespace App\Services\Forecasting;

use App\Models\ForecastRun;
use App\Models\SyntheticDataset;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

class ForecastRunFactory
{
    public const ALLOWED_KINDS = ['forecast', 'evaluate', 'aggregate'];

    public const ALLOWED_HORIZONS = [7, 30];

    /**
     * @param  array<string, mixed>  $configuration
     */
    public function create(
        string $kind,
        ?int $datasetId = null,
        int $horizon = 7,
        ?string $cutoff = null,
        array $configuration = []
    ): ForecastRun {
        if (! in_array($kind, self::ALLOWED_KINDS, true)) {
            throw new InvalidArgumentException("Kind '{$kind}' must be one of: ".implode(', ', self::ALLOWED_KINDS));
        }

        if ($kind !== 'aggregate' && ! in_array($horizon, self::ALLOWED_HORIZONS, true)) {
            throw new InvalidArgumentException("Horizon {$horizon} is not allowed. Must be one of: ".implode(', ', self::ALLOWED_HORIZONS));
        }

        $nowTz = CarbonImmutable::now('Asia/Ho_Chi_Minh');

        if ($datasetId === null) {
            $lastComplete = $nowTz->subDay()->startOfDay();

            if ($cutoff !== null) {
                $cutoffDate = CarbonImmutable::parse($cutoff, 'Asia/Ho_Chi_Minh')->startOfDay();
                if ($cutoffDate->gt($lastComplete)) {
                    throw new InvalidArgumentException("Operational cutoff '{$cutoff}' cannot be today or in the future. Last completed date is {$lastComplete->toDateString()}.");
                }
                $finalCutoff = $cutoffDate;
            } else {
                $finalCutoff = $lastComplete;
            }
        } else {
            /** @var SyntheticDataset $dataset */
            $dataset = SyntheticDataset::findOrFail($datasetId);
            if ($dataset->status !== 'completed') {
                throw new InvalidArgumentException("Synthetic dataset #{$datasetId} is not completed (status: {$dataset->status}).");
            }
            $datasetConfig = $dataset->configuration;
            $startDateStr = (string) ($datasetConfig['start_date'] ?? '2026-01-01');
            $days = max(1, (int) ($datasetConfig['days'] ?? 120));
            $startDate = CarbonImmutable::parse($startDateStr, 'Asia/Ho_Chi_Minh')->startOfDay();
            $endDate = $startDate->addDays($days - 1)->startOfDay();

            if ($cutoff !== null) {
                $cutoffDate = CarbonImmutable::parse($cutoff, 'Asia/Ho_Chi_Minh')->startOfDay();
                if ($cutoffDate->lt($startDate) || $cutoffDate->gt($endDate)) {
                    throw new InvalidArgumentException("Synthetic cutoff '{$cutoff}' is outside dataset range ({$startDate->toDateString()} to {$endDate->toDateString()}).");
                }
                $finalCutoff = $cutoffDate;
            } else {
                $finalCutoff = $endDate;
            }
        }

        if ($kind === 'forecast' && empty($configuration['snapshot']['ingredients'])) {
            $snapshot = app(PlanningSnapshot::class)->capture();
            if (! empty($snapshot['ingredients'])) {
                $configuration['snapshot'] = $snapshot;
            }
        }

        unset($configuration['timezone'], $configuration['schema_version'], $configuration['horizon_days'], $configuration['data_cutoff']);
        $mergedConfig = array_merge([
            'horizon_days' => $horizon,
            'timezone' => 'Asia/Ho_Chi_Minh',
            'data_cutoff' => $finalCutoff->toDateString(),
            'schema_version' => 2,
        ], $configuration);

        return ForecastRun::create([
            'kind' => $kind,
            'synthetic_dataset_id' => $datasetId,
            'experiment_id' => isset($configuration['experiment_id']) ? (int) $configuration['experiment_id'] : null,
            'cell_key' => isset($configuration['cell_key']) ? (string) $configuration['cell_key'] : null,
            'horizon_days' => $horizon,
            'data_cutoff' => $finalCutoff,
            'status' => 'queued',
            'configuration' => $mergedConfig,
            'is_active' => false,
        ]);
    }
}
