<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $order_code
 * @property int|null $table_id
 * @property int|null $employee_id
 * @property int|null $customer_id
 * @property int|null $promotion_id
 * @property float $subtotal
 * @property float $vat_amount
 * @property float $discount_amount
 * @property float $total
 * @property string $status
 * @property int|null $invoice_id
 * @property bool $has_additional_items
 * @property string|null $note
 * @property string|null $reservation_name
 * @property string|null $reservation_phone
 * @property \Carbon\Carbon|null $reservation_time
 * @property string|null $reservation_note
 * @property-read \App\Models\Table|null $table
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\OrderItem> $items
 * @property-read \App\Models\Invoice|null $invoice
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\OrderActivity> $activities
 * @property-read \Illuminate\Database\Eloquent\Collection<int, \App\Models\Deposit> $deposits
 * @property float $deposit_total
 */
class Order extends Model
{
    use HasFactory;

    /** Trạng thái đơn đang hoạt động (chưa paid/cancelled). */
    public const ACTIVE_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed'];

    /** Trạng thái đơn vận hành (gồm cả đặt bàn chưa check-in). */
    public const OPERATIONAL_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'];

    public $afterCommit = true;

    protected $fillable = [
        'order_code',
        'table_id',
        'employee_id',
        'customer_id',
        'promotion_id',
        'subtotal',
        'vat_amount',
        'discount_amount',
        'total',
        'status',
        'invoice_id',
        'has_additional_items',
        'note',
        'reservation_name',
        'reservation_phone',
        'reservation_time',
        'reservation_note',
    ];

    protected $casts = [
        'subtotal' => 'float',
        'vat_amount' => 'float',
        'discount_amount' => 'float',
        'total' => 'float',
        'has_additional_items' => 'boolean',
        'reservation_time' => 'datetime',
    ];

    public function table(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Table::class, 'table_id');
    }

    public function items(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    public function invoice(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    public function activities(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(OrderActivity::class)->orderBy('created_at');
    }

    public function deposits(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Deposit::class);
    }

    public function heldDepositTotal(): float
    {
        if ($this->relationLoaded('deposits')) {
            return (float) $this->deposits->where('status', 'held')->sum('amount');
        }
        return (float) $this->deposits()->where('status', 'held')->sum('amount');
    }
}
