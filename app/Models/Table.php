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
    ];

    protected $casts = [
        'capacity' => 'integer',
    ];

    public function orders()
    {
        return $this->hasMany(Order::class, 'table_id');
    }

    public function activeOrder()
    {
        return $this->hasOne(Order::class, 'table_id')->whereIn('status', ['draft', 'pending', 'confirmed', 'processing'])->latestOfMany();
    }
}
