<?php

namespace App\Jobs\Planning;

use App\Models\ForecastRun;
use App\Services\Forecasting\ForecastOrchestrator;
use App\Services\Forecasting\ForecastRunFactory;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;

class EvaluateForecastModels implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public ForecastRun $run;

    public function __construct(?ForecastRun $run = null)
    {
        $this->run = $run ?? app(ForecastRunFactory::class)->create(
            'evaluate',
            null,
            (int) config('forecasting.evaluation.horizon', 7)
        );
    }

    public function uniqueId(): string
    {
        return (string) $this->run->id;
    }

    /**
     * @return array<int, object>
     */
    public function middleware(): array
    {
        return [
            (new WithoutOverlapping((string) $this->run->id))->dontRelease(),
        ];
    }

    public function handle(ForecastOrchestrator $orchestrator): void
    {
        $orchestrator->run($this->run);
    }
}
