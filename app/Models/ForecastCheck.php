<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int|null $created_by
 * @property int|null $synthetic_dataset_id
 * @property int|null $menu_item_id
 * @property string $submission_token
 * @property string $request_hash
 * @property string $dataset_label
 * @property string $item_label
 * @property Carbon|string $start_date
 * @property Carbon|string $end_date
 * @property Carbon|string $cutoff
 * @property array<string, mixed> $input_snapshot
 * @property array<string, mixed>|null $result
 * @property string $status
 * @property string|null $error_message
 * @property int $attempts
 * @property Carbon|null $started_at
 * @property Carbon|null $completed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $creator
 * @property-read SyntheticDataset|null $syntheticDataset
 * @property-read MenuItem|null $menuItem
 */
class ForecastCheck extends Model
{
    public const VERSIONS = [
        'snapshot' => '1.0.0',
        'preprocessing' => '1.0.0',
        'model' => '2.0.0',
        'metrics' => '1.1.0',
    ];

    protected $table = 'forecast_checks';

    protected $fillable = [
        'created_by',
        'synthetic_dataset_id',
        'menu_item_id',
        'submission_token',
        'request_hash',
        'dataset_label',
        'item_label',
        'start_date',
        'end_date',
        'cutoff',
        'input_snapshot',
        'result',
        'status',
        'error_message',
        'attempts',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'created_by' => 'integer',
        'synthetic_dataset_id' => 'integer',
        'menu_item_id' => 'integer',
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'cutoff' => 'date:Y-m-d',
        'input_snapshot' => 'array',
        'result' => 'array',
        'attempts' => 'integer',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<SyntheticDataset, $this> */
    public function syntheticDataset(): BelongsTo
    {
        return $this->belongsTo(SyntheticDataset::class, 'synthetic_dataset_id');
    }

    /** @return BelongsTo<MenuItem, $this> */
    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'menu_item_id');
    }
}
