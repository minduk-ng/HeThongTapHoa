<?php

namespace App\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property \Carbon\Carbon $opened_at
 * @property \Carbon\Carbon|null $closed_at
 * @property float $opening_cash
 * @property float|null $closing_cash
 * @property float|null $actual_cash
 * @property string $status
 * @property string|null $status_token
 * @property int $opened_by
 * @property int|null $closed_by
 * @property string|null $note
 * @property-read \App\Models\User $openedBy
 * @property-read \App\Models\User|null $closedBy
 */
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

    public function openedBy(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    public function closedBy(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
