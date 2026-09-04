<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailyPromotionStat extends Model
{
    protected $fillable = ['promotion_id', 'stat_date', 'order_count', 'revenue', 'discount_total', 'unique_orders'];

    protected $casts = [
        'stat_date' => 'date',
        'order_count' => 'int',
        'revenue' => 'float',
        'discount_total' => 'float',
        'unique_orders' => 'int',
    ];

    /** @return BelongsTo<Promotion, $this> */
    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
