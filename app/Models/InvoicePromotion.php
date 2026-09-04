<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoicePromotion extends Model
{
    protected $table = 'invoice_promotions';

    protected $fillable = [
        'invoice_id', 'promotion_id', 'code', 'name', 'discount_type',
        'discount_value', 'stack_order', 'amount',
    ];

    protected $casts = [
        'discount_value' => 'float',
        'stack_order' => 'int',
        'amount' => 'float',
    ];

    /** @return BelongsTo<Invoice, $this> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    /** @return BelongsTo<Promotion, $this> */
    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
