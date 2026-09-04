<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionTimeSlot extends Model
{
    protected $fillable = ['promotion_id', 'day_of_week', 'start_time', 'end_time'];

    protected $casts = [
        'day_of_week' => 'int',
    ];

    /** @return BelongsTo<Promotion, $this> */
    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
