<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Table extends Model
{
    use HasFactory;

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

    public function orders()
    {
        return $this->hasMany(Order::class, 'table_id');
    }

    public function activeOrder()
    {
        return $this->hasOne(Order::class, 'table_id')->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed'])->latestOfMany();
    }

    public function activeOrders()
    {
        return $this->hasMany(Order::class, 'table_id')->whereIn('status', ['draft', 'pending', 'confirmed', 'processing', 'completed']);
    }

    public function mergedIntoTable()
    {
        return $this->belongsTo(Table::class, 'merged_into_table_id');
    }

    public function mergedSubTables()
    {
        return $this->hasMany(Table::class, 'merged_into_table_id');
    }
}
