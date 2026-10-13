<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $procurement_plan_id
 * @property int $inventory_recommendation_id
 * @property int $ingredient_id
 * @property int|null $supplier_id
 * @property float $suggested_quantity
 * @property float $final_quantity
 * @property float|null $purchase_quantity
 * @property string $unit
 * @property string|null $purchase_unit
 * @property float|null $pack_size
 * @property float $unit_price
 * @property float $total_price
 * @property string|null $adjustment_reason
 * @property int|null $stock_voucher_item_id
 * @property string $status
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read ProcurementPlan $procurementPlan
 * @property-read InventoryRecommendation $recommendation
 * @property-read InventoryRecommendation $inventoryRecommendation
 * @property-read Ingredient $ingredient
 * @property-read Supplier|null $supplier
 * @property-read StockVoucherItem|null $stockVoucherItem
 */
class ProcurementPlanItem extends Model
{
    protected $table = 'procurement_plan_items';

    protected $fillable = [
        'procurement_plan_id',
        'inventory_recommendation_id',
        'ingredient_id',
        'supplier_id',
        'suggested_quantity',
        'final_quantity',
        'purchase_quantity',
        'unit',
        'purchase_unit',
        'pack_size',
        'unit_price',
        'total_price',
        'adjustment_reason',
        'stock_voucher_item_id',
        'status',
    ];

    protected $casts = [
        'procurement_plan_id' => 'integer',
        'inventory_recommendation_id' => 'integer',
        'ingredient_id' => 'integer',
        'supplier_id' => 'integer',
        'suggested_quantity' => 'float',
        'final_quantity' => 'float',
        'purchase_quantity' => 'float',
        'pack_size' => 'float',
        'unit_price' => 'float',
        'total_price' => 'float',
        'stock_voucher_item_id' => 'integer',
    ];

    /** @return BelongsTo<ProcurementPlan, $this> */
    public function procurementPlan(): BelongsTo
    {
        return $this->belongsTo(ProcurementPlan::class, 'procurement_plan_id');
    }

    /** @return BelongsTo<InventoryRecommendation, $this> */
    public function recommendation(): BelongsTo
    {
        return $this->belongsTo(InventoryRecommendation::class, 'inventory_recommendation_id');
    }

    /** @return BelongsTo<InventoryRecommendation, $this> */
    public function inventoryRecommendation(): BelongsTo
    {
        return $this->belongsTo(InventoryRecommendation::class, 'inventory_recommendation_id');
    }

    /** @return BelongsTo<Ingredient, $this> */
    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    /** @return BelongsTo<StockVoucherItem, $this> */
    public function stockVoucherItem(): BelongsTo
    {
        return $this->belongsTo(StockVoucherItem::class, 'stock_voucher_item_id');
    }
}
