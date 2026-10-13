<?php

use App\Jobs\Planning\RunForecastCheck;
use App\Models\ForecastCheck;
use App\Models\SyntheticDataset;
use App\Models\SyntheticObservation;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(AuthorizationSeeder::class);
    config(['forecasting.synthetic_enabled' => true]);
});

it('creates forecast check with captured snapshot and dispatches job', function () {
    Queue::fake();
    $admin = posAdmin();
    $item = posMenuItem(['name' => 'Trà vải']);

    $dataset = SyntheticDataset::create([
        'name' => 'Dataset Check Test',
        'seed' => 42,
        'configuration' => [
            'days' => 60,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
        ],
        'configuration_hash' => 'hash_cfg',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'hash_ds',
        'start_date' => '2026-01-01',
        'end_date' => '2026-03-01',
        'status' => 'completed',
    ]);

    // Populate synthetic observations from Jan 1 to Jan 21
    $obsData = [];
    for ($d = 1; $d <= 21; $d++) {
        $obsData[] = [
            'synthetic_dataset_id' => $dataset->id,
            'menu_item_id' => $item->id,
            'date' => sprintf('2026-01-%02d', $d),
            'latent_demand' => 15.0,
            'observed_sales' => 15.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
    SyntheticObservation::insert($obsData);

    $token = 'e7264a13-84cb-46bc-97e6-44055d728640';

    $response = $this->actingAs($admin)->postJson('/planning/forecast-checks', [
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'start_date' => '2026-01-15',
        'submission_token' => $token,
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.status', 'queued')
        ->assertJsonPath('data.start_date', '2026-01-15')
        ->assertJsonPath('data.end_date', '2026-01-21')
        ->assertJsonPath('data.cutoff', '2026-01-14');

    Queue::assertPushed(RunForecastCheck::class);

    $check = ForecastCheck::where('submission_token', $token)->first();
    expect($check)->not->toBeNull()
        ->and($check->input_snapshot)->toHaveKeys(['dataset', 'item', 'start_date', 'end_date', 'cutoff', 'observations']);
});

it('handles idempotency gracefully returning existing check on double submit', function () {
    Queue::fake();
    $admin = posAdmin();
    $item = posMenuItem();

    $dataset = SyntheticDataset::create([
        'name' => 'Idempotent Dataset',
        'seed' => 42,
        'configuration' => [
            'days' => 30,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
        ],
        'configuration_hash' => 'hash_cfg',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'hash_ds',
        'start_date' => '2026-01-01',
        'end_date' => '2026-01-30',
        'status' => 'completed',
    ]);

    $obsData = [];
    for ($d = 1; $d <= 25; $d++) {
        $obsData[] = [
            'synthetic_dataset_id' => $dataset->id,
            'menu_item_id' => $item->id,
            'date' => sprintf('2026-01-%02d', $d),
            'latent_demand' => 10.0,
            'observed_sales' => 10.0,
            'is_open' => true,
            'is_missing' => false,
            'is_stockout' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
    SyntheticObservation::insert($obsData);

    $token = 'c1234567-89ab-cdef-0123-456789abcdef';

    $payload = [
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'start_date' => '2026-01-15',
        'submission_token' => $token,
    ];

    $first = $this->actingAs($admin)->postJson('/planning/forecast-checks', $payload);
    $first->assertCreated();

    // Second submit with exact same payload returns 200 OK with same check
    $second = $this->actingAs($admin)->postJson('/planning/forecast-checks', $payload);
    $second->assertOk()
        ->assertJsonPath('data.id', $first->json('data.id'));

    // Submit with same token but different inputs returns 409 Conflict
    $conflictPayload = array_merge($payload, ['start_date' => '2026-01-16']);
    $conflict = $this->actingAs($admin)->postJson('/planning/forecast-checks', $conflictPayload);
    $conflict->assertStatus(409);
});

it('rejects start_date when cutoff is before dataset start date', function () {
    $admin = posAdmin();
    $item = posMenuItem();

    $dataset = SyntheticDataset::create([
        'name' => 'Boundary Dataset',
        'seed' => 42,
        'configuration' => [
            'days' => 30,
            'start_date' => '2026-01-01',
            'menu_item_ids' => [$item->id],
        ],
        'configuration_hash' => 'hash_cfg',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'hash_ds',
        'start_date' => '2026-01-01',
        'end_date' => '2026-01-30',
        'status' => 'completed',
    ]);

    // start_date = 2026-01-01 implies cutoff = 2026-12-31 (prior day, before dataset start 2026-01-01)
    $response = $this->actingAs($admin)->postJson('/planning/forecast-checks', [
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'start_date' => '2026-01-01',
        'submission_token' => 'f1111111-2222-3333-4444-555555555555',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['start_date']);
});
