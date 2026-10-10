<?php

namespace App\Console\Commands\Planning;

use App\Jobs\Planning\EvaluateForecastModels;
use App\Models\ForecastRun;
use Illuminate\Console\Command;

class EvaluateForecastModelsCommand extends Command
{
    protected $signature = 'planning:evaluate-models
        {--dataset= : Synthetic dataset ID}
        {--horizon= : Forecast horizon in days}';

    protected $description = 'Evaluate forecasting candidate models using rolling-origin backtesting';

    public function handle(): int
    {
        $datasetId = $this->option('dataset') !== null ? (int) $this->option('dataset') : null;
        $horizon = (int) ($this->option('horizon') ?: config('forecasting.evaluation.horizon', 7));

        $run = ForecastRun::create([
            'kind' => 'evaluate',
            'synthetic_dataset_id' => $datasetId,
            'horizon_days' => $horizon,
            'data_cutoff' => now()->startOfDay(),
            'status' => 'queued',
            'configuration' => [
                'horizon_days' => $horizon,
            ],
            'is_active' => false,
        ]);

        EvaluateForecastModels::dispatch($run)->afterCommit();

        $this->info("Dispatched EvaluateForecastModels job for run #{$run->id}");

        return self::SUCCESS;
    }
}
