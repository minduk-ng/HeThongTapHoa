<?php

use App\Services\Forecasting\SyntheticDemandGenerator;

it('generates the same dataset hash for the same config and seed', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $config = ['days' => 120, 'weekly' => true, 'trend' => 0.002, 'noise' => 0.10];
    expect($generator->hash($generator->generate($config, 42)))
        ->toBe($generator->hash($generator->generate($config, 42)));
});

it('produces different hash for different seeds', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $config = ['days' => 120, 'weekly' => true, 'trend' => 0.002, 'noise' => 0.10];
    expect($generator->hash($generator->generate($config, 42)))
        ->not->toBe($generator->hash($generator->generate($config, 43)));
});

it('generates non-negative integer demand', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $records = $generator->generate(['days' => 30, 'weekly' => true, 'trend' => -0.05, 'noise' => 0.20], 42);
    expect($records)->not->toBeEmpty();
    foreach ($records as $record) {
        expect($record['quantity'])->toBeInt()
            ->and($record['quantity'])->toBeGreaterThanOrEqual(0)
            ->and($record)->toHaveKeys(['date', 'menu_item_id', 'quantity', 'signals']);
    }
});

it('supports zero_demand_rate, outlier_rate, missing_rate, and stockout_censor_rate', function () {
    $generator = app(SyntheticDemandGenerator::class);
    $config = [
        'days' => 100,
        'zero_demand_rate' => 0.2,
        'outlier_rate' => 0.1,
        'missing_rate' => 0.1,
        'stockout_censor_rate' => 0.1,
    ];
    $records = $generator->generate($config, 42);
    expect(count($records))->toBeLessThan(100);

    $hasZero = false;
    $hasOutlier = false;
    $hasStockout = false;
    foreach ($records as $record) {
        if ($record['signals']['zero_demand'] ?? false) {
            $hasZero = true;
            expect($record['quantity'])->toBe(0);
        }
        if ($record['signals']['outlier'] ?? false) {
            $hasOutlier = true;
        }
        if ($record['signals']['stockout'] ?? false) {
            $hasStockout = true;
        }
    }
    expect($hasZero)->toBeTrue()
        ->and($hasOutlier)->toBeTrue()
        ->and($hasStockout)->toBeTrue();
});
