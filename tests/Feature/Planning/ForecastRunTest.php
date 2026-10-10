<?php

use App\Jobs\Planning\RunDemandForecast;
use App\Models\DailyProductDemand;
use App\Models\ForecastModelEvaluation;
use App\Models\ForecastRun;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\ProductForecast;
use App\Models\SyntheticDataset;
use App\Services\Forecasting\DemandSeriesBuilder;
use App\Services\Forecasting\ForecastOrchestrator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

it('publishes a new run only after all forecasts commit', function () {
    $old = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDays(2),
        'status' => 'completed',
        'is_active' => true,
    ]);
    $new = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'queued',
        'is_active' => false,
    ]);

    app(ForecastOrchestrator::class)->run($new);

    expect($new->fresh()->status)->toBe('completed')
        ->and($new->fresh()->is_active)->toBeTrue()
        ->and($old->fresh()->is_active)->toBeFalse();
});

it('keeps the previous run active when forecasting fails', function () {
    $old = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDays(2),
        'status' => 'completed',
        'is_active' => true,
    ]);
    $new = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'queued',
        'is_active' => false,
    ]);

    $item = posMenuItem(['name' => 'Failing Item']);

    $failingOrchestrator = new ForecastOrchestrator(
        customForecasters: [
            'sma_7' => function () {
                throw new RuntimeException('Candidate forecasting calculation exploded');
            },
        ]
    );

    $failingOrchestrator->run($new);

    expect($new->fresh()->status)->toBe('failed')
        ->and($new->fresh()->error_message)->toContain('exploded')
        ->and($new->fresh()->is_active)->toBeFalse()
        ->and($old->fresh()->is_active)->toBeTrue()
        ->and(ProductForecast::where('forecast_run_id', $new->id)->count())->toBe(0);
});

it('isolates active runs between real data and synthetic datasets', function () {
    $dataset = SyntheticDataset::create([
        'name' => 'test-syn-dataset',
        'seed' => 123,
        'configuration' => ['days' => 30],
        'configuration_hash' => hash('sha256', '30'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'syn'),
    ]);

    $realActive = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => null,
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'completed',
        'is_active' => true,
    ]);

    $synRun = ForecastRun::create([
        'kind' => 'forecast',
        'synthetic_dataset_id' => $dataset->id,
        'horizon_days' => 7,
        'data_cutoff' => now()->subDay(),
        'status' => 'queued',
        'is_active' => false,
    ]);

    app(ForecastOrchestrator::class)->run($synRun);

    expect($synRun->fresh()->status)->toBe('completed')
        ->and($synRun->fresh()->is_active)->toBeTrue()
        ->and($realActive->fresh()->is_active)->toBeTrue();
});

it('aggregates daily demands with source isolation and refunded quantity metadata', function () {
    $itemA = posMenuItem(['name' => 'Item A']);
    $itemB = posMenuItem(['name' => 'Item B']);

    $dataset = SyntheticDataset::create([
        'name' => 'aggregate-syn-dataset',
        'seed' => 456,
        'configuration' => ['days' => 10],
        'configuration_hash' => hash('sha256', '10'),
        'generator_version' => '1.0.0',
        'dataset_hash' => hash('sha256', 'syn-agg'),
    ]);

    $targetDate = Carbon::parse('2026-03-01 14:00:00');

    // 1. Real invoice with refund
    $realInvoice = Invoice::create([
        'invoice_code' => 'INV-REAL-AGG-1',
        'table_name' => 'T1',
        'payment_method' => 'cash',
        'subtotal_amount' => 50000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 50000,
        'amount_received' => 50000,
        'change_amount' => 0,
        'issued_at' => $targetDate,
        'synthetic_dataset_id' => null,
    ]);
    InvoiceLine::create([
        'invoice_id' => $realInvoice->id,
        'menu_item_id' => $itemA->id,
        'name_snapshot' => 'Item A',
        'quantity' => 5,
        'refunded_qty' => 2,
        'unit_price' => 10000,
        'subtotal' => 50000,
    ]);

    // 2. Synthetic invoice
    $synInvoice = Invoice::create([
        'invoice_code' => 'SYN-AGG-1',
        'table_name' => 'T2',
        'payment_method' => 'cash',
        'subtotal_amount' => 30000,
        'discount_amount' => 0,
        'vat_amount' => 0,
        'total_amount' => 30000,
        'amount_received' => 30000,
        'change_amount' => 0,
        'issued_at' => $targetDate,
        'synthetic_dataset_id' => $dataset->id,
    ]);
    InvoiceLine::create([
        'invoice_id' => $synInvoice->id,
        'menu_item_id' => $itemA->id,
        'name_snapshot' => 'Item A',
        'quantity' => 3,
        'refunded_qty' => 0,
        'unit_price' => 10000,
        'subtotal' => 30000,
    ]);

    $builder = app(DemandSeriesBuilder::class);

    // Aggregate real data
    $builder->aggregate(null);

    $realDemand = DailyProductDemand::whereNull('synthetic_dataset_id')
        ->where('menu_item_id', $itemA->id)
        ->whereDate('demand_date', '2026-03-01')
        ->first();

    expect($realDemand)->not->toBeNull()
        ->and($realDemand->quantity)->toBe(5.0)
        ->and($realDemand->refunded_quantity)->toBe(2.0)
        ->and($realDemand->order_count)->toBe(1);

    // Assert synthetic record does not exist yet under synthetic scope
    expect(DailyProductDemand::where('synthetic_dataset_id', $dataset->id)->count())->toBe(0);

    // Aggregate synthetic data
    $builder->aggregate($dataset->id);

    $synDemand = DailyProductDemand::where('synthetic_dataset_id', $dataset->id)
        ->where('menu_item_id', $itemA->id)
        ->whereDate('demand_date', '2026-03-01')
        ->first();

    expect($synDemand)->not->toBeNull()
        ->and($synDemand->quantity)->toBe(3.0)
        ->and($synDemand->refunded_quantity)->toBe(0.0);
});

it('dispatches queued demand forecast job with afterCommit and unique lock', function () {
    Queue::fake();

    $run = ForecastRun::create([
        'kind' => 'forecast',
        'horizon_days' => 7,
        'data_cutoff' => now()->startOfDay(),
        'status' => 'queued',
        'is_active' => false,
    ]);

    RunDemandForecast::dispatch($run)->afterCommit();

    Queue::assertPushed(RunDemandForecast::class, function ($job) use ($run) {
        return $job->run->id === $run->id && $job->uniqueId() === (string) $run->id;
    });
});

it('executes model evaluation run and records selected model', function () {
    $item = posMenuItem(['name' => 'Eval Item']);

    // Seed daily product demands for 84 days (12 weeks)
    $baseDate = Carbon::parse('2026-01-01');
    for ($i = 0; $i < 84; $i++) {
        DailyProductDemand::create([
            'synthetic_dataset_id' => null,
            'menu_item_id' => $item->id,
            'demand_date' => $baseDate->copy()->addDays($i)->toDateString(),
            'quantity' => 10.0 + ($i % 7),
            'refunded_quantity' => 0.0,
            'order_count' => 1,
        ]);
    }

    $run = ForecastRun::create([
        'kind' => 'evaluate',
        'horizon_days' => 7,
        'data_cutoff' => $baseDate->copy()->addDays(83),
        'status' => 'queued',
        'is_active' => false,
    ]);

    app(ForecastOrchestrator::class)->run($run);

    expect($run->fresh()->status)->toBe('completed');

    $evals = ForecastModelEvaluation::where('forecast_run_id', $run->id)->get();
    expect($evals->count())->toBeGreaterThanOrEqual(1)
        ->and($evals->where('is_selected', true)->count())->toBe(1);
});
