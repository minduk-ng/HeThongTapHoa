<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int|null $synthetic_dataset_id
 * @property int $menu_item_id
 * @property Carbon|string $demand_date
 * @property float $quantity
 * @property float $refunded_quantity
 * @property int $order_count
 * @property array<string, mixed>|null $signals
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read SyntheticDataset|null $syntheticDataset
 * @property-read MenuItem $menuItem
 */
class DailyProductDemand extends Model
{
    protected $table = 'daily_product_demands';

    protected $fillable = [
        'synthetic_dataset_id',
        'menu_item_id',
        'demand_date',
        'quantity',
        'refunded_quantity',
        'order_count',
        'signals',
    ];

    protected $casts = [
        'synthetic_dataset_id' => 'integer',
        'menu_item_id' => 'integer',
        'demand_date' => 'date',
        'quantity' => 'float',
        'refunded_quantity' => 'float',
        'order_count' => 'integer',
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
