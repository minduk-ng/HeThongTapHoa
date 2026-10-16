<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $code
 * @property string $name
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, KitchenWorkGroup> $workGroups
 * @property-read Collection<int, MenuCategory> $categories
 */
class KitchenStation extends Model
{
    protected $table = 'kitchen_stations';

    protected $fillable = [
        'code',
        'name',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    /** @return HasMany<KitchenWorkGroup, $this> */
    public function workGroups(): HasMany
    {
        return $this->hasMany(KitchenWorkGroup::class, 'station_id');
    }

    /** @return HasMany<MenuCategory, $this> */
    public function categories(): HasMany
    {
        return $this->hasMany(MenuCategory::class, 'kitchen_station_id');
    }
}
