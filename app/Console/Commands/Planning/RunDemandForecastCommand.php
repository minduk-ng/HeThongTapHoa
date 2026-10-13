<?php

namespace App\Console\Commands\Planning;

use App\Jobs\Planning\RunDemandForecast;
use App\Services\Forecasting\ForecastRunFactory;
use Illuminate\Console\Command;

class RunDemandForecastCommand extends Command
{
    protected $signature = 'planning:forecast
        {--dataset= : Synthetic dataset ID}
        {--horizon= : Forecast horizon in days}
        {--cutoff= : Historical cutoff date (Y-m-d)}';

    protected $description = 'Generate demand forecasts for menu items';

    public function handle(ForecastRunFactory $factory): int
    {
        $datasetId = $this->option('dataset') !== null ? (int) $this->option('dataset') : null;
        $horizon = (int) ($this->option('horizon') ?: config('forecasting.horizons.default', 7));
        $cutoff = $this->option('cutoff') ? (string) $this->option('cutoff') : null;

        $run = $factory->create('forecast', $datasetId, $horizon, $cutoff);

        RunDemandForecast::dispatch($run)->afterCommit();

        $this->info("Dispatched RunDemandForecast job for run #{$run->id} (horizon: {$horizon} days)");

        return self::SUCCESS;
    }
}
