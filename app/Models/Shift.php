<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Shift extends Model
{
    protected $fillable = [
        'opened_at',
        'closed_at',
        'opening_cash',
        'closing_cash',
        'actual_cash',
        'status',
        'status_token',
        'opened_by',
        'closed_by',
        'note',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
        'opening_cash' => 'float',
        'closing_cash' => 'float',
        'actual_cash' => 'float',
    ];

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }
}
