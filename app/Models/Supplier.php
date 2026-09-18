<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
