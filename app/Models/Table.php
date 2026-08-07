<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $table_number
 * @property int $capacity
 * @property string $area
 * @property string $status
 * @property int|null $merged_into_table_id
 * @property string|null $reservation_name
 * @property string|null $reservation_phone
 * @property \Carbon\Carbon|null $reservation_time
 * @property string|null $reservation_note
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Order> $orders
 * @property-read \App\Models\Order|null $activeOrder
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Order> $activeOrders
 * @property-read \App\Models\Table|null $mergedIntoTable
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Table> $mergedSubTables
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

    public function orders(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Order::class, 'table_id');
    }

    public function activeOrder(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Order::class, 'table_id')->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->latestOfMany();
    }

    public function activeOrders(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Order::class, 'table_id')->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed']);
    }

    public function mergedIntoTable(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Table::class, 'merged_into_table_id');
    }

    public function mergedSubTables(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Table::class, 'merged_into_table_id');
    }
}
