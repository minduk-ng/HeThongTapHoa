<?php

use App\Jobs\Planning\AggregateDailyDemand;
use App\Jobs\Planning\EvaluateForecastModels;
use App\Jobs\Planning\RunDemandForecast;
use App\Models\ForecastRun;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

it('registers planning commands in the console schedule with withoutOverlapping', function () {
    /** @var Schedule $schedule */
    $schedule = app(Schedule::class);

    $events = collect($schedule->events());

    $aggregateEvent = $events->first(function ($event) {
        return str_contains((string) $event->command, 'planning:aggregate-demand');
    });

    expect($aggregateEvent)->not->toBeNull()
        ->and($aggregateEvent->expression)->toBe('10 0 * * *')
        ->and($aggregateEvent->withoutOverlapping)->toBeTrue();

    $forecastEvent = $events->first(function ($event) {
        return str_contains((string) $event->command, 'planning:forecast');
    });

    expect($forecastEvent)->not->toBeNull()
        ->and($forecastEvent->expression)->toBe('15 0 * * *')
        ->and($forecastEvent->withoutOverlapping)->toBeTrue();

    $evaluateEvent = $events->first(function ($event) {
        return str_contains((string) $event->command, 'planning:evaluate-models');
    });

    expect($evaluateEvent)->not->toBeNull()
        ->and($evaluateEvent->expression)->toBe('0 1 * * 0')
        ->and($evaluateEvent->withoutOverlapping)->toBeTrue();
});

it('executes planning:aggregate-demand and creates queued run', function () {
    Queue::fake();

    $exitCode = Artisan::call('planning:aggregate-demand');

    expect($exitCode)->toBe(0);

    $run = ForecastRun::where('kind', 'aggregate')->latest()->first();
    expect($run)->not->toBeNull()
        ->and($run->status)->toBe('queued')
        ->and($run->synthetic_dataset_id)->toBeNull();

    Queue::assertPushed(AggregateDailyDemand::class, function ($job) use ($run) {
        return $job->run->id === $run->id;
    });
});

it('executes planning:forecast and creates queued run', function () {
    Queue::fake();

    $exitCode = Artisan::call('planning:forecast', ['--horizon' => 7]);

    expect($exitCode)->toBe(0);

    $run = ForecastRun::where('kind', 'forecast')->latest()->first();
    expect($run)->not->toBeNull()
        ->and($run->status)->toBe('queued')
        ->and($run->horizon_days)->toBe(7);

    Queue::assertPushed(RunDemandForecast::class, function ($job) use ($run) {
        return $job->run->id === $run->id;
    });
});

it('executes planning:evaluate-models and creates queued run', function () {
    Queue::fake();

    $exitCode = Artisan::call('planning:evaluate-models');

    expect($exitCode)->toBe(0);

    $run = ForecastRun::where('kind', 'evaluate')->latest()->first();
    expect($run)->not->toBeNull()
        ->and($run->status)->toBe('queued');

    Queue::assertPushed(EvaluateForecastModels::class, function ($job) use ($run) {
        return $job->run->id === $run->id;
    });
});
