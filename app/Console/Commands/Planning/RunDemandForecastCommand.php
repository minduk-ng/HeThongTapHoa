<?php

namespace App\Console\Commands\Planning;

use App\Jobs\Planning\RunDemandForecast;
use App\Models\ForecastRun;
use Illuminate\Console\Command;

class RunDemandForecastCommand extends Command
{
    protected $signature = 'planning:forecast
        {--dataset= : Synthetic dataset ID}
        {--horizon= : Forecast horizon in days}';

    protected $description = 'Generate demand forecasts for menu items';

    public function handle(): int
    {
        $datasetId = $this->option('dataset') !== null ? (int) $this->option('dataset') : null;
        $horizon = (int) ($this->option('horizon') ?: config('forecasting.horizons.default', 7));

        $run = ForecastRun::create([
            'kind' => 'forecast',
            'synthetic_dataset_id' => $datasetId,
            'horizon_days' => $horizon,
            'data_cutoff' => now()->startOfDay(),
            'status' => 'queued',
            'configuration' => [
                'horizon_days' => $horizon,
            ],
            'is_active' => false,
        ]);

        RunDemandForecast::dispatch($run)->afterCommit();

        $this->info("Dispatched RunDemandForecast job for run #{$run->id} (horizon: {$horizon} days)");

        return self::SUCCESS;
    }
}
