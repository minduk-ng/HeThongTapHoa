<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property int $id
 * @property string $table_number
 * @property int $capacity
 * @property string $area
 * @property string $status
 * @property int|null $merged_into_table_id
 * @property string|null $reservation_name
 * @property string|null $reservation_phone
 * @property Carbon|null $reservation_time
 * @property string|null $reservation_note
 * @property-read Collection<int, Order> $orders
 * @property-read Order|null $activeOrder
 * @property-read Collection<int, Order> $activeOrders
 * @property-read Table|null $mergedIntoTable
 * @property-read Collection<int, Table> $mergedSubTables
 */
class Table extends Model
{
    use HasFactory;

    public $afterCommit = true;

    protected $table = 'tables';

    protected $fillable = [
        'table_number',
        'capacity',
        'area',
        'status',
        'merged_into_table_id',
        'reservation_name',
        'reservation_phone',
        'reservation_time',
        'reservation_note',
    ];

    protected $casts = [
        'capacity' => 'integer',
        'reservation_time' => 'datetime',
    ];

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'table_id');
    }

    /** @return HasOne<Order, $this> */
    public function activeOrder(): HasOne
    {
        return $this->hasOne(Order::class, 'table_id')->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->latestOfMany();
    }

    /** @return HasMany<Order, $this> */
    public function activeOrders(): HasMany
    {
        return $this->hasMany(Order::class, 'table_id')->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed']);
    }

    /** @return BelongsTo<Table, $this> */
    public function mergedIntoTable(): BelongsTo
    {
        return $this->belongsTo(Table::class, 'merged_into_table_id');
    }

    /** @return HasMany<Table, $this> */
    public function mergedSubTables(): HasMany
    {
        return $this->hasMany(Table::class, 'merged_into_table_id');
    }
}
