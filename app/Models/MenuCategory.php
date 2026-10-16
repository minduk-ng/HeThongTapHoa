<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Cache;

/**
 * @property int $id
 * @property string $name
 * @property string|null $description
 * @property int $sort_order
 * @property int|null $kitchen_station_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, MenuItem> $items
 * @property-read KitchenStation|null $kitchenStation
 */
class MenuCategory extends Model
{
    protected $table = 'menu_categories';

    protected $fillable = [
        'name',
        'description',
        'sort_order',
        'kitchen_station_id',
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

    /** @return HasMany<MenuItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(MenuItem::class, 'category_id');
    }

    /** @return BelongsTo<KitchenStation, $this> */
    public function kitchenStation(): BelongsTo
    {
        return $this->belongsTo(KitchenStation::class, 'kitchen_station_id');
    }
}
