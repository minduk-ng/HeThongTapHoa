<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockVoucher extends Model
{
    protected $fillable = [
        'voucher_code', 'type', 'employee_id', 'transacted_at', 'note', 'created_by',
    ];

    protected $casts = [
        'transacted_at' => 'datetime',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(StockVoucherItem::class, 'voucher_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
