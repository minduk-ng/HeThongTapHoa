<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
 * @property \Carbon\Carbon $issued_at
 * @property-read int $orders_count
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Order> $orders
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Payment> $payments
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\InvoiceLine> $lines
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\InvoicePromotion> $promotions
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

    public function orders(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Order::class, 'invoice_id');
    }

    public function payments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Payment::class, 'invoice_id');
    }

    public function lines(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(InvoiceLine::class, 'invoice_id');
    }

    public function promotions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(InvoicePromotion::class, 'invoice_id');
    }
}
