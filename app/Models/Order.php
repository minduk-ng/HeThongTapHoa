<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
 * @property Carbon|null $reservation_time
 * @property string|null $reservation_note
 * @property-read Table|null $table
 * @property-read Collection<int, OrderItem> $items
 * @property-read Invoice|null $invoice
 * @property-read Collection<int, OrderActivity> $activities
 * @property-read Collection<int, Deposit> $deposits
 * @property float $deposit_total
 */
class Order extends Model
{
    /** @use HasFactory<Factory<Order>> */
    use HasFactory;

    /** Trạng thái đơn đang hoạt động (chưa paid/cancelled). */
    public const ACTIVE_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed'];

    /** Trạng thái đơn vận hành (gồm cả đặt bàn chưa check-in). */
    public const OPERATIONAL_STATUSES = ['draft', 'pending', 'confirmed', 'processing', 'completed', 'reserved'];

    public bool $afterCommit = true;

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

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /** @return BelongsTo<Table, $this> */
    public function table(): BelongsTo
    {
        return $this->belongsTo(Table::class, 'table_id');
    }

    /** @return HasMany<OrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    /** @return BelongsTo<Invoice, $this> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    /** @return HasMany<OrderActivity, $this> */
    public function activities(): HasMany
    {
        return $this->hasMany(OrderActivity::class)->orderBy('created_at');
    }

    /** @return HasMany<Deposit, $this> */
    public function deposits(): HasMany
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
