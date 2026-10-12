<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Services\Forecasting\SyntheticDemandGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('generates the same dataset hash for the same config and seed', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $config = ['days' => 120, 'weekly' => true, 'trend' => 0.002, 'noise' => 0.10, 'menu_item_ids' => [1]];
    expect($generator->hash($generator->generate($config, 42)))
        ->toBe($generator->hash($generator->generate($config, 42)));
});

it('produces different hash for different seeds', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $config = ['days' => 120, 'weekly' => true, 'trend' => 0.002, 'noise' => 0.10, 'menu_item_ids' => [1]];
    expect($generator->hash($generator->generate($config, 42)))
        ->not->toBe($generator->hash($generator->generate($config, 43)));
});

it('requires explicit menu_item_ids and never writes catalog tables', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $itemsBefore = MenuItem::count();
    $catsBefore = MenuCategory::count();
    try {
        $generator->generate(['days' => 10], 42);
        expect(false)->toBeTrue('Expected InvalidArgumentException was not thrown.');
    } catch (InvalidArgumentException $e) {
        expect($e->getMessage())->toContain('menu_item_ids');
    }
    expect(MenuItem::count())->toBe($itemsBefore)
        ->and(MenuCategory::count())->toBe($catsBefore);
});

it('keeps latent demand stable when only masking rates change', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $base = ['days' => 60, 'menu_item_ids' => [1], 'weekly' => true, 'noise' => 0.1, 'zero_demand_rate' => 0.1, 'outlier_rate' => 0.05];
    $complete = $generator->generate(array_merge($base, ['missing_rate' => 0.0, 'stockout_censor_rate' => 0.0]), 42);
    $masked = $generator->generate(array_merge($base, ['missing_rate' => 0.2, 'stockout_censor_rate' => 0.2]), 42);
    expect(array_column($masked, 'latent_demand'))->toBe(array_column($complete, 'latent_demand'));
});

it('computes canonical hash regardless of associative key order', function () {
    expect(SyntheticDemandGenerator::canonicalHash(['b' => 2, 'a' => 1]))
        ->toBe(SyntheticDemandGenerator::canonicalHash(['a' => 1, 'b' => 2]));
});

it('generates non-negative integer demand and canonical observation shape', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $records = $generator->generate(['days' => 30, 'weekly' => true, 'trend' => -0.05, 'noise' => 0.20, 'menu_item_ids' => [1]], 42);
    expect($records)->not->toBeEmpty();
    foreach ($records as $record) {
        expect($record['quantity'])->toBeInt()
            ->and($record['quantity'])->toBeGreaterThanOrEqual(0)
            ->and($record)->toHaveKeys([
                'date',
                'menu_item_id',
                'latent_demand',
                'observed_sales',
                'is_open',
                'is_missing',
                'is_stockout',
                'quantity',
                'signals',
            ]);
    }
});

it('preserves full calendar grid with explicit missing and stockout observations', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $config = [
        'days' => 100,
        'menu_item_ids' => [1],
        'zero_demand_rate' => 0.2,
        'outlier_rate' => 0.1,
        'missing_rate' => 0.1,
        'stockout_censor_rate' => 0.1,
    ];
    $records = $generator->generate($config, 42);

    // Full calendar grid is preserved (100 days for 1 item)
    expect($records)->toHaveCount(100);

    $hasZero = false;
    $hasOutlier = false;
    $hasStockout = false;
    $hasMissing = false;

    foreach ($records as $record) {
        if ($record['signals']['zero_demand'] ?? false) {
            $hasZero = true;
            expect($record['latent_demand'])->toBe(0.0);
        }
        if ($record['signals']['outlier'] ?? false) {
            $hasOutlier = true;
        }
        if ($record['is_missing']) {
            $hasMissing = true;
            expect($record['observed_sales'])->toBeNull()
                ->and($record['quantity'])->toBe(0);
        }
        if ($record['is_stockout']) {
            $hasStockout = true;
            expect($record['observed_sales'])->not->toBeNull()
                ->and((float) $record['observed_sales'])->toBeLessThanOrEqual((float) $record['latent_demand']);
        }
    }

    expect($hasZero)->toBeTrue()
        ->and($hasOutlier)->toBeTrue()
        ->and($hasMissing)->toBeTrue()
        ->and($hasStockout)->toBeTrue();
});

it('generates expected behaviors for all 6 presets', function (string $preset) {
    $generator = app(SyntheticDemandGenerator::class);
    $config = [
        'preset' => $preset,
        'days' => 56,
        'menu_item_ids' => [1, 2],
    ];

    $records = $generator->generate($config, 42);
    expect($records)->toHaveCount(112); // 56 days * 2 items

    foreach ($records as $record) {
        expect($record['latent_demand'])->toBeGreaterThanOrEqual(0.0);
    }
})->with([
    'stable',
    'weekly_seasonal',
    'trend_seasonal',
    'intermittent',
    'level_shift',
    'data_stress',
]);
