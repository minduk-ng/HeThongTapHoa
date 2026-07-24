<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

use Illuminate\Support\Facades\Cache;

class MenuItem extends Model
{
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

    public function category(): BelongsTo
    {
        return $this->belongsTo(MenuCategory::class, 'category_id');
    }

    public function recipes()
    {
        return $this->hasMany(ProductRecipe::class, 'menu_item_id');
    }
}
