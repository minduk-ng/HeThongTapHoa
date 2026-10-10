<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * @property int $id
 * @property string $code
 * @property string $name
 * @property string $unit
 * @property float $stock_quantity
 * @property float $min_stock_alert
 * @property float $cost_price
 * @property string|null $expiry_date
 * @property string|null $purchase_unit
 * @property float|null $unit_conversion
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Collection<int, ProductRecipe> $recipes
 * @property-read Collection<int, IngredientSupplierPolicy> $supplierPolicies
 * @property-read Collection<int, InventoryRecommendation> $recommendations
 * @property-read IngredientSupplierPolicy|null $primarySupplierPolicy
 */
class Ingredient extends Model
{
    /** @use HasFactory<Factory<Ingredient>> */
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'code',
        'name',
        'unit',
        'stock_quantity',
        'min_stock_alert',
        'cost_price',
        'expiry_date',
        'purchase_unit',
        'unit_conversion',
    ];

    protected $casts = [
        'stock_quantity' => 'float',
        'min_stock_alert' => 'float',
        'cost_price' => 'float',
        'unit_conversion' => 'float',
    ];

    protected static function booted(): void
    {
        static::saved(function () {
            Cache::forget('pos_products');
        });
        static::deleted(function () {
            Cache::forget('pos_products');
        });
    }

    /** @return HasMany<ProductRecipe, $this> */
    public function recipes()
    {
        return $this->hasMany(ProductRecipe::class, 'ingredient_id');
    }

    /** @return HasMany<IngredientSupplierPolicy, $this> */
    public function supplierPolicies(): HasMany
    {
        return $this->hasMany(IngredientSupplierPolicy::class, 'ingredient_id');
    }

    /** @return HasOne<IngredientSupplierPolicy, $this> */
    public function primarySupplierPolicy(): HasOne
    {
        return $this->hasOne(IngredientSupplierPolicy::class, 'ingredient_id')->where('is_primary', true);
    }

    /** @return HasMany<InventoryRecommendation, $this> */
    public function recommendations(): HasMany
    {
        return $this->hasMany(InventoryRecommendation::class, 'ingredient_id');
    }

    public function policyFor(Supplier|int $supplier): ?IngredientSupplierPolicy
    {
        $supplierId = $supplier instanceof Supplier ? $supplier->id : $supplier;

        if ($this->relationLoaded('supplierPolicies')) {
            return $this->supplierPolicies->firstWhere('supplier_id', $supplierId);
        }

        return $this->supplierPolicies()->where('supplier_id', $supplierId)->first();
    }

    public function convertToStockUnit(float $amount, string $fromUnit): ?float
    {
        $from = strtolower(trim($fromUnit));
        $to = strtolower(trim($this->unit));

        if ($from === $to) {
            return $amount;
        }

        // Exact match with purchase_unit and unit_conversion
        if ($this->purchase_unit && $from === strtolower(trim($this->purchase_unit))) {
            if ($this->unit_conversion && (float) $this->unit_conversion > 0) {
                return $amount * (float) $this->unit_conversion;
            }
        }

        // Standard metric conversions
        $volumeMetric = [
            'ml' => 1.0,
            'milliliter' => 1.0,
            'millilitre' => 1.0,
            'l' => 1000.0,
            'lit' => 1000.0,
            'liter' => 1000.0,
            'litre' => 1000.0,
        ];

        $massMetric = [
            'g' => 1.0,
            'gram' => 1.0,
            'gr' => 1.0,
            'kg' => 1000.0,
            'kilogram' => 1000.0,
        ];

        if (isset($volumeMetric[$from], $volumeMetric[$to])) {
            return ($amount * $volumeMetric[$from]) / $volumeMetric[$to];
        }

        if (isset($massMetric[$from], $massMetric[$to])) {
            return ($amount * $massMetric[$from]) / $massMetric[$to];
        }

        return null;
    }

    public function getEffectiveExpiryDateAttribute(): ?string
    {
        $earliest = StockVoucherItem::where('ingredient_id', $this->id)
            ->where('quantity_remaining', '>', 0)
            ->whereNotNull('expiry_date')
            ->orderBy('expiry_date', 'asc')
            ->value('expiry_date');

        return $earliest ? Carbon::parse($earliest)->toDateString() : null;
    }
}
