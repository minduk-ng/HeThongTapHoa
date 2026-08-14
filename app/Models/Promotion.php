<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property string $name
 * @property string $type
 * @property string|null $code
 * @property Carbon|null $start_date
 * @property Carbon|null $end_date
 * @property bool $status
 * @property int|null $max_usage
 * @property int|null $target_usage
 * @property int $used_count
 * @property bool $stackable
 */
class Promotion extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'type', 'code', 'start_date', 'end_date',
        'status', 'max_usage', 'target_usage', 'used_count', 'stackable',
        'code_prefix', 'code_quantity', 'code_random',
    ];

    protected $casts = [
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'status' => 'bool',
        'max_usage' => 'int',
        'target_usage' => 'int',
        'used_count' => 'int',
        'stackable' => 'bool',
        'code_quantity' => 'int',
        'code_random' => 'bool',
    ];

    public function conditions(): HasMany
    {
        return $this->hasMany(PromotionCondition::class);
    }

    public function actions(): HasMany
    {
        return $this->hasMany(PromotionAction::class);
    }

    public function codes(): HasMany
    {
        return $this->hasMany(PromotionCode::class);
    }

    public function timeSlots(): HasMany
    {
        return $this->hasMany(PromotionTimeSlot::class);
    }
}
