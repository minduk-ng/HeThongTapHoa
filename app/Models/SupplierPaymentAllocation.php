<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierPaymentAllocation extends Model
{
    protected $fillable = ['payment_id', 'voucher_id', 'amount'];

    protected $casts = ['amount' => 'float'];

    /** @return BelongsTo<SupplierPayment, $this> */
    public function payment(): BelongsTo
    {
        return $this->belongsTo(SupplierPayment::class, 'payment_id');
    }

    /** @return BelongsTo<StockVoucher, $this> */
    public function voucher(): BelongsTo
    {
        return $this->belongsTo(StockVoucher::class, 'voucher_id');
    }
}
