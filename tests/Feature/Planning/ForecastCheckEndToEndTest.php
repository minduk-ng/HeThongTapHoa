<?php

use App\Jobs\Planning\RunForecastCheck;
use App\Models\ForecastCheck;
use App\Models\SyntheticDataset;
use App\Models\SyntheticObservation;
use App\Services\Forecasting\ForecastCheckService;
use Carbon\Carbon;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(AuthorizationSeeder::class);
    config(['forecasting.synthetic_enabled' => true]);
});

it('executes full weekly forecast check lifecycle end-to-end with leak-free metamorphic invariance', function () {
    $admin = posAdmin();
    $item = posMenuItem(['name' => 'Trà xanh lài']);

    // Build 60 days of synthetic observations (2026-01-01 to 2026-03-01)
    $dataset = SyntheticDataset::create([
        'name' => 'E2E Check Dataset',
        'seed' => 555,
        'configuration' => [
            'days' => 60,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
        ],
        'configuration_hash' => 'hash_e2e_cfg',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'hash_e2e_ds',
        'start_date' => '2026-01-01',
        'end_date' => '2026-03-01',
        'status' => 'completed',
    ]);

    $obsData = [];
    for ($d = 0; $d < 60; $d++) {
        $date = Carbon::parse('2026-01-01')->addDays($d)->toDateString();
        $obsData[] = [
            'synthetic_dataset_id' => $dataset->id,
            'menu_item_id' => $item->id,
            'date' => $date,
            'latent_demand' => 20.0 + ($d % 7),
            'observed_sales' => 20.0 + ($d % 7),
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
    SyntheticObservation::insert($obsData);

    // Step 1: Open index page
    $this->actingAs($admin)->get('/planning/forecast-checks')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('planning/ForecastChecks')
            ->has('datasets')
            ->has('menuItems')
        );

    // Step 2: Post inspection request for week 2026-02-01 to 2026-02-07 (cutoff: 2026-01-31)
    $token = Str::uuid()->toString();
    $createRes = $this->actingAs($admin)->postJson('/planning/forecast-checks', [
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'start_date' => '2026-02-01',
        'submission_token' => $token,
    ]);

    $createRes->assertCreated();
    $checkId = $createRes->json('data.id');

    // Step 3: Execute asynchronous job
    $job = new RunForecastCheck($checkId);
    $job->handle(app(ForecastCheckService::class));

    // Step 4: Verify completed check output
    $check = ForecastCheck::findOrFail($checkId);
    expect($check->status)->toBe('completed')
        ->and($check->result)->not->toBeNull()
        ->and($check->result['candidates'])->toHaveCount(7)
        ->and($check->result['scored_count'])->toBe(7);

    // Step 5: Test metamorphic invariance:
    // Mutating future observations after 2026-02-07 in the database must NOT affect this check's result!
    SyntheticObservation::where('synthetic_dataset_id', $dataset->id)
        ->where('date', '>', '2026-02-07')
        ->update(['observed_sales' => 9999.0]);

    $recomputed = app(ForecastCheckService::class)->calculate($check->input_snapshot);
    expect($recomputed['candidates'][0]['predictions'])->toEqual($check->result['candidates'][0]['predictions'])
        ->and($recomputed['candidates'][0]['mae'])->toEqual($check->result['candidates'][0]['mae']);

    // Step 6: View specific check via GET
    $this->actingAs($admin)->get("/planning/forecast-checks/{$checkId}")
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('planning/ForecastChecks')
            ->where('activeCheck.id', $checkId)
            ->where('activeCheck.status', 'completed')
        );
});
