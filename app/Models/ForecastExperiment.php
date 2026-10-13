<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property array<string, mixed>|null $configuration
 * @property string $status
 * @property string|null $error_message
 * @property int|null $created_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $creator
 * @property-read Collection<int, ForecastRun> $runs
 */
class ForecastExperiment extends Model
{
    protected $table = 'forecast_experiments';

    protected $fillable = [
        'configuration',
        'status',
        'error_message',
        'created_by',
    ];

    protected $casts = [
        'configuration' => 'array',
        'created_by' => 'integer',
    ];

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return HasMany<ForecastRun, $this> */
    public function runs(): HasMany
    {
        return $this->hasMany(ForecastRun::class, 'experiment_id');
    }
}
