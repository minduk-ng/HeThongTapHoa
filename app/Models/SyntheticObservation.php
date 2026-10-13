<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $synthetic_dataset_id
 * @property int $menu_item_id
 * @property Carbon|string $date
 * @property float $latent_demand
 * @property float|null $observed_sales
 * @property bool $is_open
 * @property bool $is_missing
 * @property bool $is_stockout
 * @property array<string, mixed>|null $signals
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read SyntheticDataset $syntheticDataset
 * @property-read MenuItem $menuItem
 */
class SyntheticObservation extends Model
{
    protected $table = 'synthetic_observations';

    protected $fillable = [
        'synthetic_dataset_id',
        'menu_item_id',
        'date',
        'latent_demand',
        'observed_sales',
        'is_open',
        'is_missing',
        'is_stockout',
        'signals',
    ];

    protected $casts = [
        'synthetic_dataset_id' => 'integer',
        'menu_item_id' => 'integer',
        'date' => 'date',
        'latent_demand' => 'float',
        'observed_sales' => 'float',
        'is_open' => 'boolean',
        'is_missing' => 'boolean',
        'is_stockout' => 'boolean',
        'signals' => 'array',
    ];

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
