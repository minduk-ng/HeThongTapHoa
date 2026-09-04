<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property Carbon $opened_at
 * @property Carbon|null $closed_at
 * @property float $opening_cash
 * @property float|null $closing_cash
 * @property float|null $actual_cash
 * @property string $status
 * @property string|null $status_token
 * @property int $opened_by
 * @property int|null $closed_by
 * @property string|null $note
 * @property-read User $openedBy
 * @property-read User|null $closedBy
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

    /** @param Builder<Shift> $query
     * @return Builder<Shift>
     */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    /** @return HasMany<CashMovement, $this> */
    public function movements(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }

    /** @return BelongsTo<User, $this> */
    public function openedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    /** @return BelongsTo<User, $this> */
    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
