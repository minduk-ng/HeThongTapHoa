<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockVoucherItem extends Model
{
    protected $fillable = [
        'voucher_id', 'ingredient_id', 'quantity', 'unit_price', 'expiry_date', 'quantity_remaining',
    ];

    protected $casts = [
        'quantity' => 'float',
        'unit_price' => 'float',
        'expiry_date' => 'date',
        'quantity_remaining' => 'float',
    ];

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(StockVoucher::class, 'voucher_id');
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class);
    }
}
