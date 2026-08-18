<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class Ingredient extends Model
{
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
