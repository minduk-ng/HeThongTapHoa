<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $forecast_run_id
 * @property int $menu_item_id
 * @property Carbon|string $forecast_date
 * @property float|null $forecast_quantity
 * @property float|null $lower_bound
 * @property float|null $upper_bound
 * @property string|null $model_key
 * @property string $status
 * @property string|null $bound_method
 * @property float|null $bound_percentage
 * @property array<string, mixed>|null $parameters
 * @property Carbon|null $data_cutoff
 * @property string $data_quality
 * @property array<string, mixed>|null $metrics
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read ForecastRun $forecastRun
 * @property-read MenuItem $menuItem
 */
class ProductForecast extends Model
{
    protected $table = 'product_forecasts';

    protected $fillable = [
        'forecast_run_id',
        'menu_item_id',
        'forecast_date',
        'forecast_quantity',
        'lower_bound',
        'upper_bound',
        'model_key',
        'status',
        'bound_method',
        'bound_percentage',
        'parameters',
        'data_cutoff',
        'data_quality',
        'metrics',
    ];

    protected $casts = [
        'forecast_run_id' => 'integer',
        'menu_item_id' => 'integer',
        'forecast_date' => 'date',
        'forecast_quantity' => 'float',
        'lower_bound' => 'float',
        'upper_bound' => 'float',
        'bound_percentage' => 'float',
        'parameters' => 'array',
        'data_cutoff' => 'datetime',
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
