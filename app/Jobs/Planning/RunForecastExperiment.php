<?php

namespace App\Jobs\Planning;

use App\Models\ForecastExperiment;
use App\Models\ForecastRun;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\ForecastOrchestrator;
use App\Services\Forecasting\ForecastRunFactory;
use App\Services\Forecasting\PlanningSnapshot;
use App\Services\Forecasting\SyntheticDatasetBuilder;
use App\Services\Forecasting\SyntheticDemandGenerator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Throwable;

class RunForecastExperiment implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public ForecastExperiment $experiment) {}

    public function handle(
        SyntheticDatasetBuilder $datasetBuilder,
        ForecastRunFactory $runFactory,
        ForecastOrchestrator $orchestrator,
        PlanningSnapshot $snapshotter
    ): void {
        $lock = Cache::lock("forecast-experiment-{$this->experiment->id}", 600);
        $lock->block(10);
        try {
            $this->experiment->refresh();
            if (in_array($this->experiment->status, ['completed'], true)) {
                return;
            }
            $this->experiment->update(['status' => 'running']);

            $config = is_array($this->experiment->configuration) ? $this->experiment->configuration : [];
            $presets = (array) ($config['presets'] ?? ['stable']);
            $seeds = array_map('intval', (array) ($config['seeds'] ?? [42]));
            $horizons = array_map('intval', (array) ($config['horizons'] ?? [7]));
            $days = (int) ($config['days'] ?? 365);
            $startDate = (string) ($config['start_date'] ?? '2026-01-01');
            $itemIds = $config['menu_item_ids'] ?? null;

            $commonSnapshot = $config['snapshot'] ?? $snapshotter->capture();
            $config['snapshot'] = $commonSnapshot;
            $this->experiment->update(['configuration' => $config]);
            $cells = $config['cells'] ?? [];
            $completedCount = 0;
            $failedCount = 0;
            foreach ($cells as $existing) {
                if (($existing['status'] ?? null) === 'completed') {
                    $completedCount++;
                } elseif (($existing['status'] ?? null) === 'failed') {
                    $failedCount++;
                }
            }

            $persist = function () use (&$config, &$cells, &$completedCount, &$failedCount) {
                $config['cells'] = $cells;
                $config['summary']['completed'] = $completedCount;
                $config['summary']['failed'] = $failedCount;
                $this->experiment->update(['configuration' => $config]);
            };

            foreach ($presets as $preset) {
                foreach ($seeds as $seed) {
                    foreach ($horizons as $horizon) {
                        $cellKey = "{$preset}:{$seed}:{$horizon}";
                        if (($cells[$cellKey]['status'] ?? null) === 'failed') {
                            $failedCount = max(0, $failedCount - 1);
                        }
                        if (($cells[$cellKey]['status'] ?? null) === 'completed') {
                            $evalId = $cells[$cellKey]['evaluate_run_id'] ?? null;
                            $fcId = $cells[$cellKey]['forecast_run_id'] ?? null;
                            $evalOk = $evalId && ForecastRun::whereKey($evalId)->where('status', 'completed')->exists();
                            $fcOk = $fcId && ForecastRun::whereKey($fcId)->where('status', 'completed')->exists();
                            if ($evalOk && $fcOk) {
                                continue;
                            }
                            $completedCount = max(0, $completedCount - 1);
                            unset($cells[$cellKey]);
                        }

                        $requiredDays = 56 + 2 * 7 + 2 * $horizon;
                        if ($days < $requiredDays) {
                            $failedCount++;
                            $cells[$cellKey] = [
                                'status' => 'failed',
                                'error' => "Dataset too short: need {$requiredDays} days for H={$horizon} with 3 origins, got {$days}.",
                            ];
                            $persist();

                            continue;
                        }

                        try {
                            $datasetName = "Exp-{$this->experiment->id}-{$preset}-s{$seed}";
                            $datasetConfig = [
                                'preset' => $preset,
                                'days' => $days,
                                'start_date' => $startDate,
                                'menu_item_ids' => $itemIds,
                            ];

                            $dataset = SyntheticDataset::firstOrCreate(
                                ['name' => $datasetName],
                                [
                                    'seed' => $seed,
                                    'configuration' => $datasetConfig,
                                    'configuration_hash' => SyntheticDemandGenerator::canonicalHash($datasetConfig),
                                    'generator_version' => SyntheticDemandGenerator::VERSION,
                                    'dataset_hash' => hash('sha256', "exp:{$this->experiment->id}:{$preset}:{$seed}"),
                                    'status' => 'queued',
                                    'created_by' => $this->experiment->created_by,
                                ]
                            );

                            $datasetBuilder->build($dataset);
                            $dataset->refresh();
                            if ($dataset->status !== 'completed') {
                                throw new \RuntimeException("Dataset build failed: {$dataset->error_message}");
                            }

                            $existingEval = ForecastRun::where('experiment_id', $this->experiment->id)
                                ->where('cell_key', "{$cellKey}:eval")->latest('id')->first();
                            $existingFc = ForecastRun::where('experiment_id', $this->experiment->id)
                                ->where('cell_key', "{$cellKey}:fc")->latest('id')->first();
                            if ($existingEval && $existingEval->status === 'completed' && $existingFc && $existingFc->status === 'completed') {
                                $completedCount++;
                                $cells[$cellKey] = [
                                    'status' => 'completed',
                                    'dataset_id' => $dataset->id,
                                    'evaluate_run_id' => $existingEval->id,
                                    'forecast_run_id' => $existingFc->id,
                                ];
                                $persist();

                                continue;
                            }

                            $evalRun = $existingEval ?? $runFactory->create(
                                'evaluate',
                                $dataset->id,
                                $horizon,
                                null,
                                [
                                    'experiment_id' => $this->experiment->id,
                                    'cell_key' => "{$cellKey}:eval",
                                    'snapshot' => $commonSnapshot,
                                ]
                            );
                            if ($evalRun->status !== 'completed') {
                                $orchestrator->run($evalRun);
                            }
                            $evalRun->refresh();
                            if ($evalRun->status !== 'completed') {
                                throw new \RuntimeException("Evaluation failed: {$evalRun->error_message}");
                            }

                            $fcRun = $existingFc ?? $runFactory->create(
                                'forecast',
                                $dataset->id,
                                $horizon,
                                null,
                                [
                                    'experiment_id' => $this->experiment->id,
                                    'cell_key' => "{$cellKey}:fc",
                                    'snapshot' => $commonSnapshot,
                                ]
                            );
                            if ($fcRun->status !== 'completed') {
                                $orchestrator->run($fcRun);
                            }
                            $fcRun->refresh();

                            if ($fcRun->status !== 'completed') {
                                throw new \RuntimeException("Child runs failed: eval={$evalRun->status}, forecast={$fcRun->status}. Eval error: {$evalRun->error_message} Forecast error: {$fcRun->error_message}");
                            }

                            $completedCount++;
                            $cells[$cellKey] = [
                                'status' => 'completed',
                                'dataset_id' => $dataset->id,
                                'evaluate_run_id' => $evalRun->id,
                                'forecast_run_id' => $fcRun->id,
                            ];
                            $persist();
                        } catch (Throwable $cellError) {
                            $failedCount++;
                            $cells[$cellKey] = [
                                'status' => 'failed',
                                'error' => $cellError->getMessage(),
                            ];
                            $persist();
                        }
                    }
                }
            }

            $config['cells'] = $cells;
            $config['summary']['completed'] = $completedCount;
            $config['summary']['failed'] = $failedCount;

            $this->experiment->update([
                'status' => $failedCount === 0 ? 'completed' : ($completedCount > 0 ? 'partial' : 'failed'),
                'configuration' => $config,
            ]);
        } catch (Throwable $e) {
            $this->experiment->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            throw $e;
        } finally {
            optional($lock)->release();
        }
    }
}
