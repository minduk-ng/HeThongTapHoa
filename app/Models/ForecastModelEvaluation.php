<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $forecast_run_id
 * @property int $menu_item_id
 * @property string $model_key
 * @property array<string, mixed>|null $parameters
 * @property float $mae
 * @property float $rmse
 * @property float|null $wape
 * @property int $origins_evaluated
 * @property bool $is_selected
 * @property string|null $selection_notes
 * @property array<string, mixed>|null $metrics
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read ForecastRun $forecastRun
 * @property-read MenuItem $menuItem
 */
class ForecastModelEvaluation extends Model
{
    protected $table = 'forecast_model_evaluations';

    protected $fillable = [
        'forecast_run_id',
        'menu_item_id',
        'model_key',
        'parameters',
        'mae',
        'rmse',
        'wape',
        'origins_evaluated',
        'is_selected',
        'selection_notes',
        'metrics',
    ];

    protected $casts = [
        'forecast_run_id' => 'integer',
        'menu_item_id' => 'integer',
        'parameters' => 'array',
        'mae' => 'float',
        'rmse' => 'float',
        'wape' => 'float',
        'origins_evaluated' => 'integer',
        'is_selected' => 'boolean',
        'metrics' => 'array',
    ];

    /** @return BelongsTo<ForecastRun, $this> */
    public function forecastRun(): BelongsTo
    {
        return $this->belongsTo(ForecastRun::class, 'forecast_run_id');
    }

    /** @return BelongsTo<MenuItem, $this> */
    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'menu_item_id');
    }
}
