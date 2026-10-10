<?php

namespace App\Console\Commands\Planning;

use App\Jobs\Planning\AggregateDailyDemand;
use App\Models\ForecastRun;
use Carbon\Carbon;
use Illuminate\Console\Command;

class AggregateForecastDemand extends Command
{
    protected $signature = 'planning:aggregate-demand
        {--dataset= : Synthetic dataset ID}
        {--from= : Start date (Y-m-d)}
        {--to= : End date (Y-m-d)}';

    protected $description = 'Aggregate invoice lines into daily product demand series';

    public function handle(): int
    {
        $datasetId = $this->option('dataset') !== null ? (int) $this->option('dataset') : null;
        $from = $this->option('from') ? Carbon::parse((string) $this->option('from')) : null;
        $to = $this->option('to') ? Carbon::parse((string) $this->option('to')) : null;

        $run = ForecastRun::create([
            'kind' => 'aggregate',
            'synthetic_dataset_id' => $datasetId,
            'horizon_days' => 0,
            'data_cutoff' => $to ?? now(),
            'status' => 'queued',
            'configuration' => [
                'from' => $from?->toDateString(),
                'to' => $to?->toDateString(),
            ],
            'is_active' => false,
        ]);

        AggregateDailyDemand::dispatch($run)->afterCommit();

        $this->info("Dispatched AggregateDailyDemand job for run #{$run->id}");

        return self::SUCCESS;
    }
}
