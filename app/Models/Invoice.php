<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $invoice_code
 * @property string|null $table_name
 * @property string $payment_method
 * @property float $amount_received
 * @property float $change_amount
 * @property float $total_amount
 * @property float $deposit_amount
 * @property float $subtotal_amount
 * @property float $vat_amount
 * @property float $discount_amount
 * @property string|null $external_no
 * @property string|null $external_ref
 * @property Carbon $issued_at
 * @property-read int $orders_count
 * @property-read Collection<int, Order> $orders
 * @property-read Collection<int, Payment> $payments
 * @property-read Collection<int, InvoiceLine> $lines
 * @property-read Collection<int, InvoicePromotion> $promotions
 */
class Invoice extends Model
{
    use HasFactory;

    protected $table = 'invoices';

    protected $fillable = [
        'invoice_code',
        'table_name',
        'payment_method',
        'amount_received',
        'change_amount',
        'total_amount',
        'deposit_amount',
        'subtotal_amount',
        'vat_amount',
        'discount_amount',
        'external_no',
        'external_ref',
        'issued_at',
        'customer_id',
    ];

    protected $casts = [
        'amount_received' => 'decimal:2',
        'change_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'subtotal_amount' => 'decimal:2',
        'vat_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'issued_at' => 'datetime',
    ];

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'invoice_id');
    }

    /** @return HasMany<Payment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'invoice_id');
    }

    /** @return HasMany<InvoiceLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class, 'invoice_id');
    }

    /** @return HasMany<InvoicePromotion, $this> */
    public function promotions(): HasMany
    {
        return $this->hasMany(InvoicePromotion::class, 'invoice_id');
    }
}
