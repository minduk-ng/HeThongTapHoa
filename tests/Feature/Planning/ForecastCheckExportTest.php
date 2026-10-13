<?php

use App\Jobs\Planning\RunForecastCheck;
use App\Models\ForecastCheck;
use App\Services\Forecasting\ForecastCheckService;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(AuthorizationSeeder::class);
    config(['forecasting.synthetic_enabled' => true]);
});

it('exports manifest, comparison CSV, and daily errors CSV with matching arithmetic', function () {
    $admin = posAdmin();
    $item = posMenuItem(['name' => 'Trà vải thiều']);

    $observations = [];
    for ($d = 1; $d <= 21; $d++) {
        $observations[] = [
            'date' => sprintf('2026-01-%02d', $d),
            'observed_sales' => $d <= 14 ? 20.0 : ($d === 15 ? 15.0 : 25.0),
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
        ];
    }

    $snapshot = [
        'dataset' => ['id' => 99, 'name' => 'DS Export', 'seed' => 42, 'generator_version' => '2.0.0'],
        'item' => ['id' => $item->id, 'name' => 'Trà vải thiều'],
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
        'submission_token' => '44444444-aaaa-bbbb-cccc-444444444444',
        'request_hash' => 'hash_exp',
        'dataset_label' => 'DS Export',
        'item_label' => 'Trà vải thiều',
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'input_snapshot' => $snapshot,
        'status' => 'queued',
        'attempts' => 0,
    ]);

    // Test export before completion gives 409
    $this->actingAs($admin)->get("/planning/forecast-checks/{$check->id}/exports/manifest.json")
        ->assertStatus(409);

    // Run check to completion
    $job = new RunForecastCheck($check->id);
    $job->handle(app(ForecastCheckService::class));
    $check->refresh();
    expect($check->status)->toBe('completed');

    // 1. Manifest JSON
    $manifestRes = $this->actingAs($admin)->get("/planning/forecast-checks/{$check->id}/exports/manifest.json");
    $manifestRes->assertOk()
        ->assertJsonPath('check_id', $check->id)
        ->assertJsonPath('status', 'completed')
        ->assertJsonPath('start_date', '2026-01-15')
        ->assertJsonPath('dataset_label', 'DS Export');

    // 2. Comparison CSV
    $compRes = $this->actingAs($admin)->get("/planning/forecast-checks/{$check->id}/exports/comparison.csv");
    $compRes->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    $compContent = $compRes->streamedContent();
    expect($compContent)->toContain('model_key')
        ->and($compContent)->toContain('naive')
        ->and($compContent)->toContain('seasonal_naive_7');

    // 3. Daily errors CSV
    $dailyRes = $this->actingAs($admin)->get("/planning/forecast-checks/{$check->id}/exports/daily-errors.csv");
    $dailyRes->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    $dailyContent = $dailyRes->streamedContent();
    expect($dailyContent)->toContain('signed_error')
        ->and($dailyContent)->toContain('absolute_error');

    // 4. Disallowed file gives 404
    $this->actingAs($admin)->get("/planning/forecast-checks/{$check->id}/exports/secret.key")
        ->assertNotFound();
});
