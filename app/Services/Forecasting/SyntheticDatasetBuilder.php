<?php

namespace App\Services\Forecasting;

use App\Models\MenuItem;
use App\Models\SyntheticDataset;
use App\Models\SyntheticObservation;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class SyntheticDatasetBuilder
{
    public function __construct(private SyntheticDemandGenerator $generator) {}

    public function build(SyntheticDataset $dataset): void
    {
        $lock = Cache::lock("synthetic-dataset-{$dataset->id}", 300);
        $lock->block(10);
        try {
            $dataset->refresh();
            if ($dataset->status === 'completed' && $dataset->observations()->exists()) {
                return;
            }

            $dataset->update(['status' => 'generating', 'error_message' => null]);

            $rawConfig = $dataset->configuration;
            $itemIds = $rawConfig['menu_item_ids'] ?? null;
            if (! is_array($itemIds) || empty($itemIds)) {
                $itemIds = MenuItem::pluck('id')->all();
            }
            if (empty($itemIds)) {
                throw new \InvalidArgumentException('No menu items available to generate synthetic dataset.');
            }
            $config = SyntheticDemandGenerator::resolveConfiguration($rawConfig, array_values(array_map('intval', $itemIds)));
            $dataset->update(['configuration' => $config]);
            $seed = (int) $dataset->seed;

            $records = $this->generator->generate($config, $seed);
            $datasetHash = $this->generator->hash($records);

            $startDateStr = (string) ($config['start_date'] ?? '2026-01-01');
            $days = max(1, (int) ($config['days'] ?? 120));
            $startDate = Carbon::parse($startDateStr);
            $endDate = $startDate->copy()->addDays($days - 1);

            DB::transaction(function () use ($dataset, $records, $startDate, $endDate, $datasetHash) {
                // Clear any existing observations/invoices if retrying
                SyntheticObservation::where('synthetic_dataset_id', $dataset->id)->delete();

                $obsChunks = array_chunk($records, 500);
                $now = now();

                foreach ($obsChunks as $chunk) {
                    $insertData = [];
                    foreach ($chunk as $row) {
                        $insertData[] = [
                            'synthetic_dataset_id' => $dataset->id,
                            'menu_item_id' => (int) $row['menu_item_id'],
                            'date' => $row['date'],
                            'latent_demand' => (float) $row['latent_demand'],
                            'observed_sales' => $row['observed_sales'] !== null ? (float) $row['observed_sales'] : null,
                            'is_open' => (bool) $row['is_open'],
                            'is_missing' => (bool) $row['is_missing'],
                            'is_stockout' => (bool) $row['is_stockout'],
                            'signals' => json_encode($row['signals'], JSON_THROW_ON_ERROR),
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                    SyntheticObservation::insert($insertData);
                }

                $this->generator->persist($dataset, $records);

                $dataset->update([
                    'start_date' => $startDate->toDateString(),
                    'end_date' => $endDate->toDateString(),
                    'dataset_hash' => $datasetHash,
                    'status' => 'completed',
                    'error_message' => null,
                ]);
            });
        } catch (Throwable $e) {
            $dataset->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            throw $e;
        } finally {
            optional($lock)->release();
        }
    }
}
