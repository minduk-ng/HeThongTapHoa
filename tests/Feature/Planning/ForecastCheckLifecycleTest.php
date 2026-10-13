<?php

use App\Jobs\Planning\RunForecastCheck;
use App\Models\ForecastCheck;
use App\Models\ForecastRun;
use App\Models\InventoryRecommendation;
use App\Models\ProcurementPlan;
use App\Models\ProductForecast;
use App\Models\StockVoucher;
use App\Services\Forecasting\ForecastCheckService;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(AuthorizationSeeder::class);
    config(['forecasting.synthetic_enabled' => true]);
});

it('processes queued forecast check job to completed status atomically', function () {
    $admin = posAdmin();
    $item = posMenuItem(['name' => 'Trà đào']);

    $observations = [];
    for ($d = 1; $d <= 21; $d++) {
        $observations[] = [
            'date' => sprintf('2026-01-%02d', $d),
            'observed_sales' => 20.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $snapshot = [
        'dataset' => ['id' => 1, 'name' => 'Demo DS'],
        'item' => ['id' => $item->id, 'name' => 'Trà đào'],
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'timezone' => 'Asia/Ho_Chi_Minh',
        'versions' => ForecastCheck::VERSIONS,
        'observations' => $observations,
    ];

    $check = ForecastCheck::create([
        'created_by' => $admin->id,
        'synthetic_dataset_id' => null,
        'menu_item_id' => $item->id,
        'submission_token' => '11111111-aaaa-bbbb-cccc-111111111111',
        'request_hash' => 'hash_1',
        'dataset_label' => 'Demo DS',
        'item_label' => 'Trà đào',
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'input_snapshot' => $snapshot,
        'status' => 'queued',
        'attempts' => 0,
    ]);

    $job = new RunForecastCheck($check->id);
    $job->handle(app(ForecastCheckService::class));

    $check->refresh();
    expect($check->status)->toBe('completed')
        ->and($check->attempts)->toBe(1)
        ->and($check->result)->toHaveKeys(['candidates', 'default_model_key', 'best_model_keys'])
        ->and($check->completed_at)->not->toBeNull();

    // Re-running completed job is a safe no-op (does not increment attempts or recompute)
    $completedAt = $check->completed_at->toISOString();
    $job->handle(app(ForecastCheckService::class));
    $check->refresh();
    expect($check->attempts)->toBe(1)
        ->and($check->completed_at->toISOString())->toBe($completedAt);

    // Verify ZERO side effects on operational or planning models
    expect(ForecastRun::count())->toBe(0)
        ->and(ProductForecast::count())->toBe(0)
        ->and(InventoryRecommendation::count())->toBe(0)
        ->and(ProcurementPlan::count())->toBe(0)
        ->and(StockVoucher::count())->toBe(0);
});

it('handles failure and allows retrying a failed forecast check', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    // Malformed snapshot (missing cutoff) causes service to throw
    $snapshot = [
        'dataset' => ['id' => 1, 'name' => 'Demo DS'],
        'item' => ['id' => $item->id, 'name' => 'Demo Item'],
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '', // Empty cutoff causes calculation failure
        'timezone' => 'Asia/Ho_Chi_Minh',
        'versions' => ForecastCheck::VERSIONS,
        'observations' => [],
    ];

    $check = ForecastCheck::create([
        'created_by' => $admin->id,
        'synthetic_dataset_id' => null,
        'menu_item_id' => $item->id,
        'submission_token' => '22222222-aaaa-bbbb-cccc-222222222222',
        'request_hash' => 'hash_2',
        'dataset_label' => 'Demo DS',
        'item_label' => 'Demo Item',
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'input_snapshot' => $snapshot,
        'status' => 'queued',
        'attempts' => 0,
    ]);

    $job = new RunForecastCheck($check->id);
    $job->handle(app(ForecastCheckService::class));

    $check->refresh();
    expect($check->status)->toBe('failed')
        ->and($check->error_message)->not->toBeEmpty();

    // Call retry endpoint
    Queue::fake();
    $response = $this->actingAs($admin)->postJson("/planning/forecast-checks/{$check->id}/retry");
    $response->assertOk()
        ->assertJsonPath('data.status', 'queued');
    Queue::assertPushed(RunForecastCheck::class);

    $check->refresh();
    expect($check->status)->toBe('queued')
        ->and($check->error_message)->toBeNull();
});

it('fails version check when snapshot code versions differ from current code versions', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $snapshot = [
        'dataset' => ['id' => 1, 'name' => 'Demo DS'],
        'item' => ['id' => $item->id, 'name' => 'Demo Item'],
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'timezone' => 'Asia/Ho_Chi_Minh',
        'versions' => [
            'snapshot' => '0.1.0', // Older incompatible version
            'preprocessing' => '1.0.0',
            'model' => '2.0.0',
            'metrics' => '1.0.0',
        ],
        'observations' => [],
    ];

    $check = ForecastCheck::create([
        'created_by' => $admin->id,
        'synthetic_dataset_id' => null,
        'menu_item_id' => $item->id,
        'submission_token' => '33333333-aaaa-bbbb-cccc-333333333333',
        'request_hash' => 'hash_3',
        'dataset_label' => 'Demo DS',
        'item_label' => 'Demo Item',
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'input_snapshot' => $snapshot,
        'status' => 'queued',
        'attempts' => 0,
    ]);

    $job = new RunForecastCheck($check->id);
    $job->handle(app(ForecastCheckService::class));

    $check->refresh();
    expect($check->status)->toBe('failed')
        ->and($check->error_message)->toContain('phiên bản');
});
