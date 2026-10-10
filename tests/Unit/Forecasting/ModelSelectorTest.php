<?php

use App\Services\Forecasting\ModelSelector;

it('uses MAE then simpler model for WAPE ties within half a point', function () {
    $selected = ModelSelector::select([
        ['model_key' => 'holt_winters_additive', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_14', 'wape' => 10.4, 'mae' => 3.0, 'rmse' => 4.1],
    ]);
    expect($selected['model_key'])->toBe('sma_14');
});

it('selects strictly lower WAPE when difference exceeds 0.5 points', function () {
    $selected = ModelSelector::select([
        ['model_key' => 'holt_winters_additive', 'wape' => 10.0, 'mae' => 5.0, 'rmse' => 6.0],
        ['model_key' => 'sma_7', 'wape' => 10.6, 'mae' => 1.0, 'rmse' => 1.5],
    ]);
    expect($selected['model_key'])->toBe('holt_winters_additive');
});

it('selects lower MAE when candidates are within 0.5 WAPE points', function () {
    $selected = ModelSelector::select([
        ['model_key' => 'holt_winters_additive', 'wape' => 10.0, 'mae' => 4.0, 'rmse' => 5.0],
        ['model_key' => 'sma_14', 'wape' => 10.3, 'mae' => 2.5, 'rmse' => 3.0],
    ]);
    expect($selected['model_key'])->toBe('sma_14');
});

it('breaks MAE ties using the model complexity hierarchy', function () {
    // sma_7 < sma_14 < sma_28 < holt_winters_additive < holt_winters_multiplicative
    $candidates = [
        ['model_key' => 'holt_winters_multiplicative', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'holt_winters_additive', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_28', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_14', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_7', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
    ];

    $selected = ModelSelector::select($candidates);
    expect($selected['model_key'])->toBe('sma_7');

    $withoutSma7 = array_slice($candidates, 0, 4);
    expect(ModelSelector::select($withoutSma7)['model_key'])->toBe('sma_14');

    $withoutSma14 = array_slice($candidates, 0, 3);
    expect(ModelSelector::select($withoutSma14)['model_key'])->toBe('sma_28');

    $withoutSma28 = array_slice($candidates, 0, 2);
    expect(ModelSelector::select($withoutSma28)['model_key'])->toBe('holt_winters_additive');
});

it('falls back to MAE and complexity when all candidate WAPEs are null', function () {
    $selected = ModelSelector::select([
        ['model_key' => 'holt_winters_additive', 'wape' => null, 'mae' => 2.0, 'rmse' => 3.0],
        ['model_key' => 'sma_7', 'wape' => null, 'mae' => 2.0, 'rmse' => 3.0],
    ]);
    expect($selected['model_key'])->toBe('sma_7');
});

it('selects the only candidate when single candidate provided', function () {
    $selected = ModelSelector::select([
        ['model_key' => 'sma_7', 'wape' => 12.5, 'mae' => 2.1, 'rmse' => 2.8],
    ]);
    expect($selected['model_key'])->toBe('sma_7')
        ->and($selected['parameters'])->toBe([]);
});

it('throws on empty evaluations array', function () {
    expect(fn () => ModelSelector::select([]))
        ->toThrow(InvalidArgumentException::class, 'Evaluations list cannot be empty.');
});

it('checks reselection eligibility helper correctly', function () {
    expect(ModelSelector::canReselect(0))->toBeFalse()
        ->and(ModelSelector::canReselect(2))->toBeFalse()
        ->and(ModelSelector::canReselect(3))->toBeTrue()
        ->and(ModelSelector::canReselect(8))->toBeTrue();
});
