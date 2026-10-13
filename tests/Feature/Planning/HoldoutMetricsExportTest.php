<?php

use App\Models\ForecastModelEvaluation;
use App\Services\Forecasting\ForecastEvidenceExporter;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('exports validation and holdout separately without selecting on holdout', function () {
    $item = posMenuItem();
    $run = planningForecastRun(['kind' => 'evaluate']);
    ForecastModelEvaluation::create([
        'forecast_run_id' => $run->id, 'menu_item_id' => $item->id,
        'model_key' => 'naive', 'parameters' => [], 'status' => 'evaluated',
        'mae' => 2, 'rmse' => 3, 'wape' => 10, 'origins_evaluated' => 3,
        'is_selected' => true,
        'validation_sums' => ['scored_count' => 21, 'sum_abs_error' => 42, 'sum_sq_error' => 189, 'sum_actual' => 420],
        'holdout_metrics' => ['mae' => 0, 'rmse' => 0, 'wape' => null, 'scored_count' => 7, 'sum_abs_error' => 0, 'sum_sq_error' => 0, 'sum_actual' => 0],
    ]);
    $export = app(ForecastEvidenceExporter::class)->exportData($run, 'model_metrics.csv');
    $rows = collect($export['rows'])->map(fn ($row) => array_combine($export['header'], $row));
    expect($rows)->toHaveCount(2);
    $validation = $rows->firstWhere('stage', 'validation');
    $holdout = $rows->firstWhere('stage', 'holdout');
    expect($validation['is_selected'])->toBe(1)
        ->and($holdout['is_selected'])->toBe(0)
        ->and($holdout['mae'])->toEqual(0)
        ->and($holdout['wape'])->toBeNull()
        ->and($holdout['scored_points'])->toBe(7)
        ->and($holdout['origins_evaluated'])->toBe(1);
});
