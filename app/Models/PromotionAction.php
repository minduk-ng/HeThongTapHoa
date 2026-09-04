<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionAction extends Model
{
    protected $fillable = ['promotion_id', 'action_type', 'action_value', 'max_discount_amount'];

    protected $casts = [
        'action_value' => 'float',
        'max_discount_amount' => 'float',
    ];

    /** @return BelongsTo<Promotion, $this> */
    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
