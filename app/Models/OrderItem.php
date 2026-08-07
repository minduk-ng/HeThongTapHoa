<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
 * @property \Carbon\Carbon|null $served_at
 * @property \Carbon\Carbon|null $cancelled_at
 * @property-read \App\Models\Order $order
 * @property-read \App\Models\MenuItem|null $menuItem
 * @property-read \App\Models\User|null $cancelledBy
 */
class OrderItem extends Model
{
    use HasFactory;

    public $afterCommit = true;

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

    public function order(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function menuItem(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'menu_item_id');
    }

    public function cancelledBy(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }
}
