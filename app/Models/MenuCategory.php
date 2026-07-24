<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

use Illuminate\Support\Facades\Cache;

class MenuCategory extends Model
{
    protected $table = 'menu_categories';

    protected $fillable = [
        'name',
        'description',
        'sort_order',
    ];

    protected static function booted(): void
    {
        static::saved(function () {
            Cache::forget('pos_categories');
            Cache::forget('pos_products');
        });
        static::deleted(function () {
            Cache::forget('pos_categories');
            Cache::forget('pos_products');
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(MenuItem::class, 'category_id');
    }
}
