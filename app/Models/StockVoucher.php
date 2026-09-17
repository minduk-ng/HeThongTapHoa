<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockVoucher extends Model
{
    protected $fillable = [
        'voucher_code', 'type', 'employee_id', 'transacted_at', 'note', 'created_by',
        'supplier_id', 'is_paid',
    ];

    protected $casts = [
        'transacted_at' => 'datetime',
        'is_paid' => 'bool',
    ];

    /** @return HasMany<StockVoucherItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(StockVoucherItem::class, 'voucher_id');
    }

    /** @return BelongsTo<Employee, $this> */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** @return HasMany<SupplierPaymentAllocation, $this> */
    public function paymentAllocations(): HasMany
    {
        return $this->hasMany(SupplierPaymentAllocation::class, 'voucher_id');
    }

    public function totalAmount(): float
    {
        $items = $this->relationLoaded('items') ? $this->items : $this->items()->get();

        return (float) $items->sum(fn ($i) => (float) $i->quantity * (float) $i->unit_price);
    }

    public function allocatedAmount(): float
    {
        $allocs = $this->relationLoaded('paymentAllocations') ? $this->paymentAllocations : $this->paymentAllocations()->get();

        return (float) $allocs->sum(fn ($a) => (float) $a->amount);
    }

    public function outstandingAmount(): float
    {
        return round($this->totalAmount() - $this->allocatedAmount(), 2);
    }
}
