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
        return $this->hasMany(SupplierPayment::class);
    }

    public function debt(): float
    {
        // tổng các phiếu nhập chưa trả — mỗi phiếu = SUM(quantity × unit_price) các dòng
        $vouchers = $this->relationLoaded('vouchers') ? $this->vouchers : $this->vouchers()->get();

        return (float) $vouchers
            ->where('type', 'import')->where('is_paid', false)
            ->sum(function ($v) {
                $items = $v->relationLoaded('items') ? $v->items : $v->items()->get();

                return (float) $items->sum(fn ($i) => (float) $i->quantity * (float) $i->unit_price);
            });
    }
}
