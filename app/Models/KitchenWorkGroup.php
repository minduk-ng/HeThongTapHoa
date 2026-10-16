<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $batch_id
 * @property int $station_id
 * @property string $station_name
 * @property Carbon $deadline_at
 * @property int $version
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read KitchenSendBatch $batch
 * @property-read KitchenStation $station
 * @property-read Collection<int, OrderItem> $items
 */
class KitchenWorkGroup extends Model
{
    protected $table = 'kitchen_work_groups';

    protected $fillable = [
        'batch_id',
        'station_id',
        'station_name',
        'deadline_at',
        'version',
    ];

    protected $casts = [
        'deadline_at' => 'datetime',
        'version' => 'integer',
    ];

    /** @return BelongsTo<KitchenSendBatch, $this> */
    public function batch(): BelongsTo
    {
        return $this->belongsTo(KitchenSendBatch::class, 'batch_id');
    }

    /** @return BelongsTo<KitchenStation, $this> */
    public function station(): BelongsTo
    {
        return $this->belongsTo(KitchenStation::class, 'station_id');
    }

    /** @return HasMany<OrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'kitchen_work_group_id');
    }
}
