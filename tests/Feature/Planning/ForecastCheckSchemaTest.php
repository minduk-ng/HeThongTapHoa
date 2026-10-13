<?php

use App\Models\ForecastCheck;
use App\Models\SyntheticDataset;
use App\Models\User;
use Database\Seeders\AuthorizationSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->withoutVite();
    $this->seed(AuthorizationSeeder::class);
});

it('creates forecast check and preserves snapshot and labels when source dataset is deleted', function () {
    $admin = posAdmin();
    $item = posMenuItem(['name' => 'Cà phê muối']);
    $dataset = SyntheticDataset::create([
        'name' => 'Dataset demo',
        'seed' => 42,
        'configuration' => ['days' => 60, 'start_date' => '2026-01-01'],
        'configuration_hash' => 'cfg_hash_1',
        'generator_version' => '2.0.0',
        'dataset_hash' => 'data_hash_1',
        'status' => 'completed',
    ]);

    $snapshot = [
        'dataset' => ['id' => $dataset->id, 'name' => 'Dataset demo'],
        'item' => ['id' => $item->id, 'name' => 'Cà phê muối'],
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'timezone' => 'Asia/Ho_Chi_Minh',
        'versions' => ForecastCheck::VERSIONS,
        'observations' => [
            ['date' => '2026-01-14', 'observed_sales' => 20.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
            ['date' => '2026-01-15', 'observed_sales' => 22.0, 'is_open' => true, 'is_missing' => false, 'is_stockout' => false],
        ],
    ];

    $check = ForecastCheck::create([
        'created_by' => $admin->id,
        'synthetic_dataset_id' => $dataset->id,
        'menu_item_id' => $item->id,
        'submission_token' => 'a8b60385-2e69-4509-95a2-9fa496a77d5a',
        'request_hash' => hash('sha256', 'request-1'),
        'dataset_label' => 'Dataset demo',
        'item_label' => 'Cà phê muối',
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'input_snapshot' => $snapshot,
        'result' => null,
        'status' => 'queued',
        'attempts' => 0,
    ]);

    expect($check->fresh()->input_snapshot)->toEqual($snapshot)
        ->and($check->fresh()->status)->toBe('queued')
        ->and($check->fresh()->attempts)->toBe(0);

    $dataset->delete();

    $fresh = $check->fresh();
    expect($fresh->synthetic_dataset_id)->toBeNull()
        ->and($fresh->dataset_label)->toBe('Dataset demo')
        ->and($fresh->input_snapshot['dataset']['name'])->toBe('Dataset demo');
});

it('enforces unique submission token per user while allowing same token for different users', function () {
    $user1 = posAdmin();
    $user2 = User::factory()->create();
    $item = posMenuItem();
    $token = 'b1e102f4-7e9b-449e-8761-4560a6ce46ef';

    $payload = [
        'synthetic_dataset_id' => null,
        'menu_item_id' => $item->id,
        'submission_token' => $token,
        'request_hash' => hash('sha256', 'hash-1'),
        'dataset_label' => 'No dataset',
        'item_label' => $item->name,
        'start_date' => '2026-01-15',
        'end_date' => '2026-01-21',
        'cutoff' => '2026-01-14',
        'input_snapshot' => ['dummy' => true],
        'status' => 'queued',
    ];

    ForecastCheck::create(array_merge($payload, ['created_by' => $user1->id]));

    // Different user with same token succeeds
    $checkUser2 = ForecastCheck::create(array_merge($payload, ['created_by' => $user2->id]));
    expect($checkUser2->id)->toBeGreaterThan(0);

    // Same user with same token throws QueryException (unique constraint)
    expect(fn () => ForecastCheck::create(array_merge($payload, ['created_by' => $user1->id])))
        ->toThrow(QueryException::class);
});
