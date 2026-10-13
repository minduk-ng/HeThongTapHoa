<?php

use App\Services\Forecasting\InventoryInput;
use App\Services\Forecasting\InventoryOptimizer;
use Tests\TestCase;

uses(TestCase::class);

it('calculates safety stock reorder point and rounded order quantity', function () {
    $decision = app(InventoryOptimizer::class)->recommend(new InventoryInput(
        available: 14, dailyDemandStdDev: 2, leadDays: 4,
        serviceFactor: 1.65, annualDemand: 1200,
        orderingCost: 100000, annualHoldingCost: 20000,
        moq: 24, orderMultiple: 12, packSize: 12,
    ));

    expect($decision->safetyStock)->toEqualWithDelta(6.6, 0.001)
        ->and($decision->reorderPoint)->toBeGreaterThan(14)
        ->and(fmod($decision->finalQuantity, 12.0))->toBe(0.0);
});

it('uses reorder-gap fallback when EOQ inputs are missing', function () {
    $decision = app(InventoryOptimizer::class)->recommend(new InventoryInput(
        available: 10,
        dailyDemandStdDev: 2,
        leadDays: 4,
        serviceFactor: 1.65,
        annualDemand: 1200,
        orderingCost: null,
        annualHoldingCost: null,
        moq: 15,
        orderMultiple: 10,
        packSize: 1,
    ));

    expect($decision->method)->toBe('reorder_gap')
        ->and($decision->safetyStock)->toEqualWithDelta(6.6, 0.001)
        ->and($decision->reorderPoint)->toBeGreaterThan(10)
        ->and($decision->rawQuantity)->toEqualWithDelta($decision->reorderPoint - 10, 0.001)
        ->and($decision->afterMoqQuantity)->toBeGreaterThanOrEqual(15.0)
        ->and(fmod($decision->finalQuantity, 10.0))->toBe(0.0);
});

it('recommends zero quantity and does not trigger order when available exceeds reorder point', function () {
    $decision = app(InventoryOptimizer::class)->recommend(new InventoryInput(
        available: 50,
        dailyDemandStdDev: 2,
        leadDays: 4,
        serviceFactor: 1.65,
        annualDemand: 1200,
        orderingCost: 100000,
        annualHoldingCost: 20000,
        moq: 24,
        orderMultiple: 12,
        packSize: 12,
    ));

    expect($decision->triggersOrder)->toBeFalse()
        ->and($decision->rawQuantity)->toBe(0.0)
        ->and($decision->afterMoqQuantity)->toBe(0.0)
        ->and($decision->finalQuantity)->toBe(0.0)
        ->and($decision->suggestedQuantity)->toBe(0.0);
});

it('tracks intermediate calculation values correctly', function () {
    $decision = app(InventoryOptimizer::class)->recommend(new InventoryInput(
        available: 2,
        dailyDemandStdDev: 1,
        leadDays: 1,
        serviceFactor: 2.0,
        annualDemand: 365,
        orderingCost: 50,
        annualHoldingCost: 4,
        moq: 100,
        orderMultiple: 25,
        packSize: 5,
    ));

    // EOQ = sqrt(2 * 365 * 50 / 4) = sqrt(9125) ≈ 95.5249
    // MOQ = 100 -> after_moq = 100
    // orderMultiple = 25 -> 100 is exact multiple
    expect($decision->triggersOrder)->toBeTrue()
        ->and($decision->method)->toBe('eoq')
        ->and($decision->safetyStock)->toEqualWithDelta(2.0, 0.001)
        ->and($decision->reorderPoint)->toEqualWithDelta(3.0, 0.001)
        ->and($decision->rawQuantity)->toEqualWithDelta(95.5249, 0.001)
        ->and($decision->afterMoqQuantity)->toBe(100.0)
        ->and($decision->finalQuantity)->toBe(100.0)
        ->and($decision->reserved)->toBe(0.0)
        ->and($decision->available)->toBe(2.0);
});

it('respects explicitly passed lead demand', function () {
    $decision = app(InventoryOptimizer::class)->recommend(new InventoryInput(
        available: 10,
        dailyDemandStdDev: 0,
        leadDays: 5,
        serviceFactor: 1.65,
        orderingCost: 0,
        annualHoldingCost: 0,
        moq: 0,
        orderMultiple: 1,
        leadDemand: 25,
    ));

    // SS = 0, ROP = 25 + 0 = 25
    // available = 10 <= 25 => triggers order
    // EOQ invalid because S=0, H=0 => reorder_gap
    // raw = max(25 - 10, 0) = 15
    expect($decision->safetyStock)->toBe(0.0)
        ->and($decision->reorderPoint)->toBe(25.0)
        ->and($decision->method)->toBe('reorder_gap')
        ->and($decision->rawQuantity)->toBe(15.0)
        ->and($decision->finalQuantity)->toBe(15.0);
});
