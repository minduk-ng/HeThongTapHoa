<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int|null $synthetic_dataset_id
 * @property string $kind
 * @property int $horizon_days
 * @property Carbon $data_cutoff
 * @property string $status
 * @property array<string, mixed>|null $configuration
 * @property Carbon|null $started_at
 * @property Carbon|null $completed_at
 * @property string|null $error_message
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read SyntheticDataset|null $syntheticDataset
 * @property-read Collection<int, ProductForecast> $productForecasts
 * @property-read Collection<int, ForecastModelEvaluation> $modelEvaluations
 * @property-read Collection<int, InventoryRecommendation> $recommendations
 * @property-read Collection<int, ProcurementPlan> $procurementPlans
 */
class ForecastRun extends Model
{
    protected $table = 'forecast_runs';

    protected $fillable = [
        'synthetic_dataset_id',
        'kind',
        'horizon_days',
        'data_cutoff',
        'status',
        'configuration',
        'started_at',
        'completed_at',
        'error_message',
        'is_active',
    ];

    protected $casts = [
        'synthetic_dataset_id' => 'integer',
        'horizon_days' => 'integer',
        'data_cutoff' => 'datetime',
        'configuration' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'is_active' => 'boolean',
    ];

    /**
     * @return array{synthetic_dataset_id: ?int}
     */
    public function sourceScope(): array
    {
        return [
            'synthetic_dataset_id' => $this->synthetic_dataset_id,
        ];
    }

    /** @return BelongsTo<SyntheticDataset, $this> */
    public function syntheticDataset(): BelongsTo
    {
        return $this->belongsTo(SyntheticDataset::class, 'synthetic_dataset_id');
    }

    /** @return HasMany<ProductForecast, $this> */
    public function productForecasts(): HasMany
    {
        return $this->hasMany(ProductForecast::class, 'forecast_run_id');
    }

    /** @return HasMany<ForecastModelEvaluation, $this> */
    public function modelEvaluations(): HasMany
    {
        return $this->hasMany(ForecastModelEvaluation::class, 'forecast_run_id');
    }

    /** @return HasMany<InventoryRecommendation, $this> */
    public function recommendations(): HasMany
    {
        return $this->hasMany(InventoryRecommendation::class, 'forecast_run_id');
    }

    /** @return HasMany<ProcurementPlan, $this> */
    public function procurementPlans(): HasMany
    {
        return $this->hasMany(ProcurementPlan::class, 'forecast_run_id');
    }
}
