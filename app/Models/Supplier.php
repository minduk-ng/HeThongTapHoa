<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $name
 * @property string|null $phone
 * @property string|null $address
 * @property string|null $note
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, StockVoucher> $vouchers
 * @property-read Collection<int, SupplierPayment> $payments
 * @property-read Collection<int, IngredientSupplierPolicy> $policies
 * @property-read Collection<int, ProcurementPlan> $procurementPlans
 * @property-read Collection<int, InventoryRecommendation> $recommendations
 */
class Supplier extends Model
{
    protected $fillable = ['name', 'phone', 'address', 'note', 'is_active'];

    protected $casts = ['is_active' => 'bool'];

    /** @return HasMany<StockVoucher, $this> */
    public function vouchers(): HasMany
    {
        return $this->hasMany(StockVoucher::class);
    }

    /** @return HasMany<SupplierPayment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(SupplierPayment::class)->where('is_migration_backfill', false);
    }

    /** @return HasMany<IngredientSupplierPolicy, $this> */
    public function policies(): HasMany
    {
        return $this->hasMany(IngredientSupplierPolicy::class, 'supplier_id');
    }

    /** @return HasMany<ProcurementPlan, $this> */
    public function procurementPlans(): HasMany
    {
        return $this->hasMany(ProcurementPlan::class, 'supplier_id');
    }

    /** @return HasMany<InventoryRecommendation, $this> */
    public function recommendations(): HasMany
    {
        return $this->hasMany(InventoryRecommendation::class, 'supplier_id');
    }

    public function policyFor(Ingredient|int $ingredient): ?IngredientSupplierPolicy
    {
        $ingredientId = $ingredient instanceof Ingredient ? $ingredient->id : $ingredient;

        if ($this->relationLoaded('policies')) {
            return $this->policies->firstWhere('ingredient_id', $ingredientId);
        }

        return $this->policies()->where('ingredient_id', $ingredientId)->first();
    }

    /** @return HasMany<IngredientSupplierPolicy, $this> */
    public function primaryPolicies(): HasMany
    {
        return $this->policies()->where('is_primary', true);
    }

    public function debt(): float
    {
        // tổng dư nợ = SUM(dư còn lại từng phiếu nhập) — phiếu trả một phần vẫn còn nợ phần dư
        $vouchers = $this->relationLoaded('vouchers') ? $this->vouchers : $this->vouchers()->get();

        return (float) $vouchers
            ->where('type', 'import')
            ->sum(function ($v) {
                if (! $v->relationLoaded('items')) {
                    $v->load('items');
                }
                if (! $v->relationLoaded('paymentAllocations')) {
                    $v->load('paymentAllocations');
                }

                return max(0.0, $v->outstandingAmount());
            });
    }
}
