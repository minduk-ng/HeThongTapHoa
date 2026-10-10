<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $forecast_run_id
 * @property int $ingredient_id
 * @property int|null $supplier_id
 * @property float $demand_quantity
 * @property float $stock_quantity
 * @property float $reserved_quantity
 * @property float $safety_stock
 * @property float $reorder_point
 * @property float $raw_quantity
 * @property float $after_moq_quantity
 * @property float $final_quantity
 * @property float $suggested_quantity
 * @property string $method
 * @property string $unit
 * @property string $purchase_unit
 * @property string $bom_hash
 * @property string|null $policy_hash
 * @property Carbon|null $stock_snapshot_at
 * @property float|null $stock_snapshot_quantity
 * @property string $status
 * @property string|null $notes
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read ForecastRun $forecastRun
 * @property-read Ingredient $ingredient
 * @property-read Supplier|null $supplier
 * @property-read Collection<int, ProcurementPlanItem> $procurementPlanItems
 */
class InventoryRecommendation extends Model
{
    protected $table = 'inventory_recommendations';

    protected $fillable = [
        'forecast_run_id',
        'ingredient_id',
        'supplier_id',
        'demand_quantity',
        'stock_quantity',
        'reserved_quantity',
        'safety_stock',
        'reorder_point',
        'raw_quantity',
        'after_moq_quantity',
        'final_quantity',
        'suggested_quantity',
        'method',
        'unit',
        'purchase_unit',
        'bom_hash',
        'policy_hash',
        'stock_snapshot_at',
        'stock_snapshot_quantity',
        'status',
        'notes',
    ];

    protected $casts = [
        'forecast_run_id' => 'integer',
        'ingredient_id' => 'integer',
        'supplier_id' => 'integer',
        'demand_quantity' => 'float',
        'stock_quantity' => 'float',
        'reserved_quantity' => 'float',
        'safety_stock' => 'float',
        'reorder_point' => 'float',
        'raw_quantity' => 'float',
        'after_moq_quantity' => 'float',
        'final_quantity' => 'float',
        'suggested_quantity' => 'float',
        'stock_snapshot_at' => 'datetime',
        'stock_snapshot_quantity' => 'float',
    ];

    /** @return BelongsTo<ForecastRun, $this> */
    public function forecastRun(): BelongsTo
    {
        return $this->belongsTo(ForecastRun::class, 'forecast_run_id');
    }

    /** @return BelongsTo<Ingredient, $this> */
    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    /** @return HasMany<ProcurementPlanItem, $this> */
    public function procurementPlanItems(): HasMany
    {
        return $this->hasMany(ProcurementPlanItem::class, 'inventory_recommendation_id');
    }
}
