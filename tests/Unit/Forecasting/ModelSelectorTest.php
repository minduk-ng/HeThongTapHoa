<?php

use App\Services\Forecasting\ModelSelector;

it('selects strictly lower WAPE', function () {
    $selected = ModelSelector::select([
        ['model_key' => 'holt_winters_additive', 'wape' => 10.0, 'mae' => 5.0, 'rmse' => 6.0],
        ['model_key' => 'sma_7', 'wape' => 10.1, 'mae' => 1.0, 'rmse' => 1.5],
    ]);
    expect($selected['model_key'])->toBe('holt_winters_additive');
});

it('breaks exact WAPE ties using MAE then complexity hierarchy', function () {
    // naive < seasonal_naive_7 < sma_7 < sma_14 < sma_28 < holt_winters_additive < holt_winters_multiplicative
    $candidates = [
        ['model_key' => 'holt_winters_multiplicative', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'holt_winters_additive', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_28', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_14', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'sma_7', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'seasonal_naive_7', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
        ['model_key' => 'naive', 'wape' => 10.0, 'mae' => 3.0, 'rmse' => 4.0],
    ];

    $selected = ModelSelector::select($candidates);
    expect($selected['model_key'])->toBe('naive');

    $withoutNaive = array_slice($candidates, 0, 6);
    expect(ModelSelector::select($withoutNaive)['model_key'])->toBe('seasonal_naive_7');

    $withoutSeason = array_slice($candidates, 0, 5);
    expect(ModelSelector::select($withoutSeason)['model_key'])->toBe('sma_7');
});

it('ignores skipped or failed candidates during selection', function () {
    $candidates = [
        ['model_key' => 'naive', 'status' => 'skipped', 'wape' => 1.0, 'mae' => 0.5, 'rmse' => 0.5],
        ['model_key' => 'seasonal_naive_7', 'status' => 'failed', 'wape' => 2.0, 'mae' => 1.0, 'rmse' => 1.0],
        ['model_key' => 'sma_7', 'status' => 'evaluated', 'wape' => 12.0, 'mae' => 3.0, 'rmse' => 4.0],
    ];

    $selected = ModelSelector::select($candidates);
    expect($selected['model_key'])->toBe('sma_7');
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
