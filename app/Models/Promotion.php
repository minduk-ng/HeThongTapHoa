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
 * @property int $used_count
 * @property bool $exclusive
 * @property bool $stackable
 */
class Promotion extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name', 'type', 'code', 'start_date', 'end_date',
        'status', 'max_usage', 'used_count', 'exclusive', 'stackable',
    ];

    protected $casts = [
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'status' => 'bool',
        'max_usage' => 'int',
        'used_count' => 'int',
        'exclusive' => 'bool',
        'stackable' => 'bool',
    ];

    public function conditions(): HasMany
    {
        return $this->hasMany(PromotionCondition::class);
    }

    public function actions(): HasMany
    {
        return $this->hasMany(PromotionAction::class);
    }
}
