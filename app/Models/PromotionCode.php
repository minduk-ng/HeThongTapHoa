<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionCode extends Model
{
    protected $fillable = ['promotion_id', 'code', 'status', 'used_at', 'used_invoice_id'];

    protected $casts = [
        'status' => 'string',
        'used_at' => 'datetime',
    ];

    /** @return BelongsTo<Promotion, $this> */
    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
