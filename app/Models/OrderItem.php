<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $order_id
 * @property int $menu_item_id
 * @property int $quantity
 * @property float $unit_price
 * @property float $subtotal
 * @property float $discount_amount
 * @property string $status
 * @property string|null $note
 * @property string|null $cancellation_reason
 * @property int|null $cancelled_by_user_id
 * @property Carbon|null $served_at
 * @property Carbon|null $cancelled_at
 * @property-read Order $order
 * @property-read MenuItem|null $menuItem
 * @property-read User|null $cancelledBy
 */
class OrderItem extends Model
{
    /** @use HasFactory<Factory<OrderItem>> */
    use HasFactory;

    public bool $afterCommit = true;

    protected $fillable = [
        'order_id',
        'menu_item_id',
        'quantity',
        'unit_price',
        'subtotal',
        'discount_amount',
        'status',
        'note',
        'cancellation_reason',
        'cancelled_by_user_id',
        'cancelled_at',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'float',
        'subtotal' => 'float',
        'discount_amount' => 'float',
        'served_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    /** @return BelongsTo<MenuItem, $this> */
    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'menu_item_id');
    }

    /** @return BelongsTo<User, $this> */
    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }
}
