<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Cache;

/**
 * @property int $id
 * @property int $category_id
 * @property string $name
 * @property float $price
 * @property float $vat_rate
 * @property string|null $image
 * @property string|null $description
 * @property bool $is_available
 * @property int $max_servings
 * @property-read MenuCategory|null $category
 * @property-read Collection<int, ProductRecipe> $recipes
 */
class MenuItem extends Model
{
    use SoftDeletes;

    protected $table = 'menu_items';

    protected $fillable = [
        'category_id',
        'name',
        'price',
        'vat_rate',
        'image',
        'description',
        'is_available',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'vat_rate' => 'decimal:2',
        'is_available' => 'boolean',
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

    /** @return BelongsTo<MenuCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(MenuCategory::class, 'category_id');
    }

    /** @return HasMany<ProductRecipe, $this> */
    public function recipes(): HasMany
    {
        return $this->hasMany(ProductRecipe::class, 'menu_item_id');
    }
}
