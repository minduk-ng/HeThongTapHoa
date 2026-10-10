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
