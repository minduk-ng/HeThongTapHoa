<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $forecast_run_id
 * @property int $menu_item_id
 * @property string $stage
 * @property Carbon|string $origin_date
 * @property Carbon|string $target_date
 * @property string $model_key
 * @property float|null $observed_actual
 * @property float|null $predicted
 * @property string $status
 * @property string|null $reason
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read ForecastRun $forecastRun
 * @property-read MenuItem $menuItem
 */
class ForecastEvaluationPoint extends Model
{
    protected $table = 'forecast_evaluation_points';

    protected $fillable = [
        'forecast_run_id',
        'menu_item_id',
        'stage',
        'origin_date',
        'target_date',
        'model_key',
        'observed_actual',
        'predicted',
        'status',
        'reason',
    ];

    protected $casts = [
        'forecast_run_id' => 'integer',
        'menu_item_id' => 'integer',
        'origin_date' => 'date',
        'target_date' => 'date',
        'observed_actual' => 'float',
        'predicted' => 'float',
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
