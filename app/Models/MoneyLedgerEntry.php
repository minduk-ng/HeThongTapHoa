<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class MoneyLedgerEntry extends Model
{
    protected $fillable = [
        'direction', 'type', 'amount', 'method',
        'actor_id', 'shift_id', 'invoice_id', 'order_id', 'supplier_id',
        'warning_flags', 'meta',
    ];

    protected $casts = [
        'amount' => 'float',
        'warning_flags' => 'array',
        'meta' => 'array',
    ];

    protected static function booted(): void
    {
        // ponytail: append-only ledger — sửa/xóa là LogicException, không có route update/delete.
        static::updating(fn () => throw new LogicException('Money ledger is append-only.'));
        static::deleting(fn () => throw new LogicException('Money ledger is append-only.'));
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /** @return BelongsTo<Shift, $this> */
    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }
}
