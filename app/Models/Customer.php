<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string|null $customer_code
 * @property string $full_name
 * @property string $phone
 * @property string|null $note
 * @property int|null $created_by
 * @property int $loyalty_points
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $createdBy
 * @property-read Collection<int, Order> $orders
 */
class Customer extends Model
{
    protected $fillable = ['full_name', 'phone', 'note', 'created_by'];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
