<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $ingredient_id
 * @property int $supplier_id
 * @property bool $is_primary
 * @property bool $is_preferred
 * @property int $lead_days
 * @property float $moq
 * @property float $order_multiple
 * @property float $pack_size
 * @property float $ordering_cost
 * @property float $annual_holding_cost
 * @property float|null $unit_cost
 * @property float $service_factor
 * @property string|null $policy_hash
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Ingredient $ingredient
 * @property-read Supplier $supplier
 */
class IngredientSupplierPolicy extends Model
{
    protected $table = 'ingredient_supplier_policies';

    protected $fillable = [
        'ingredient_id',
        'supplier_id',
        'is_primary',
        'is_preferred',
        'lead_days',
        'moq',
        'order_multiple',
        'pack_size',
        'ordering_cost',
        'annual_holding_cost',
        'unit_cost',
        'service_factor',
        'policy_hash',
    ];

    protected $casts = [
        'ingredient_id' => 'integer',
        'supplier_id' => 'integer',
        'is_primary' => 'boolean',
        'is_preferred' => 'boolean',
        'lead_days' => 'integer',
        'moq' => 'float',
        'order_multiple' => 'float',
        'pack_size' => 'float',
        'ordering_cost' => 'float',
        'annual_holding_cost' => 'float',
        'unit_cost' => 'float',
        'service_factor' => 'float',
    ];

    protected static function booted(): void
    {
        static::saving(function (IngredientSupplierPolicy $policy) {
            if ($policy->is_primary && ! $policy->is_preferred) {
                $policy->is_preferred = true;
            } elseif ($policy->is_preferred && ! $policy->is_primary) {
                $policy->is_primary = true;
            }
        });
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
}
