<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $order_id
 * @property Carbon $sent_at
 * @property int $target_minutes
 * @property int $long_wait_minutes
 * @property string $origin
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Order $order
 * @property-read Collection<int, KitchenWorkGroup> $groups
 */
class KitchenSendBatch extends Model
{
    protected $table = 'kitchen_send_batches';

    protected $fillable = [
        'order_id',
        'sent_at',
        'target_minutes',
        'long_wait_minutes',
        'origin',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
        'target_minutes' => 'integer',
        'long_wait_minutes' => 'integer',
    ];

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    /** @return HasMany<KitchenWorkGroup, $this> */
    public function groups(): HasMany
    {
        return $this->hasMany(KitchenWorkGroup::class, 'batch_id');
    }
}
