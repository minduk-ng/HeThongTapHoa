<?php

namespace App\Jobs\Planning;

use App\Models\SyntheticDataset;
use App\Services\Forecasting\SyntheticDatasetBuilder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class GenerateSyntheticDataset implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public SyntheticDataset $dataset) {}

    public function handle(SyntheticDatasetBuilder $builder): void
    {
        $builder->build($this->dataset);
    }
}
