<?php

namespace App\Console\Commands\Planning;

use App\Jobs\Planning\EvaluateForecastModels;
use App\Services\Forecasting\ForecastRunFactory;
use Illuminate\Console\Command;

class EvaluateForecastModelsCommand extends Command
{
    protected $signature = 'planning:evaluate-models
        {--dataset= : Synthetic dataset ID}
        {--horizon= : Forecast horizon in days}
        {--cutoff= : Historical cutoff date (Y-m-d)}';

    protected $description = 'Evaluate forecasting candidate models using rolling-origin backtesting';

    public function handle(ForecastRunFactory $factory): int
    {
        $datasetId = $this->option('dataset') !== null ? (int) $this->option('dataset') : null;
        $horizon = (int) ($this->option('horizon') ?: config('forecasting.evaluation.horizon', 7));
        $cutoff = $this->option('cutoff') ? (string) $this->option('cutoff') : null;

        $run = $factory->create('evaluate', $datasetId, $horizon, $cutoff);

        EvaluateForecastModels::dispatch($run)->afterCommit();

        $this->info("Dispatched EvaluateForecastModels job for run #{$run->id}");

        return self::SUCCESS;
    }
}
