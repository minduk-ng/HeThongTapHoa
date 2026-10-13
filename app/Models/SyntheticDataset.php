<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $name
 * @property string|null $description
 * @property int $seed
 * @property Carbon|null $start_date
 * @property Carbon|null $end_date
 * @property string $status
 * @property string|null $error_message
 * @property array<string, mixed> $configuration
 * @property string $configuration_hash
 * @property string $generator_version
 * @property string $dataset_hash
 * @property int|null $created_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, ForecastRun> $forecastRuns
 * @property-read Collection<int, DailyProductDemand> $dailyProductDemands
 * @property-read Collection<int, SyntheticObservation> $observations
 * @property-read Collection<int, Invoice> $invoices
 * @property-read User|null $creator
 */
class SyntheticDataset extends Model
{
    protected $table = 'synthetic_datasets';

    protected $fillable = [
        'name',
        'description',
        'seed',
        'start_date',
        'end_date',
        'status',
        'error_message',
        'configuration',
        'configuration_hash',
        'generator_version',
        'dataset_hash',
        'created_by',
    ];

    protected $casts = [
        'seed' => 'integer',
        'start_date' => 'date',
        'end_date' => 'date',
        'configuration' => 'array',
        'created_by' => 'integer',
    ];

    /** @return HasMany<SyntheticObservation, $this> */
    public function observations(): HasMany
    {
        return $this->hasMany(SyntheticObservation::class, 'synthetic_dataset_id');
    }

    /** @return HasMany<ForecastRun, $this> */
    public function forecastRuns(): HasMany
    {
        return $this->hasMany(ForecastRun::class, 'synthetic_dataset_id');
    }

    /** @return HasMany<DailyProductDemand, $this> */
    public function dailyProductDemands(): HasMany
    {
        return $this->hasMany(DailyProductDemand::class, 'synthetic_dataset_id');
    }

    /** @return HasMany<Invoice, $this> */
    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'synthetic_dataset_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
