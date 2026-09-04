<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Deposit extends Model
{
    /** @use HasFactory<Factory<Deposit>> */
    use HasFactory;

    protected $fillable = [
        'order_id',
        'amount',
        'method',
        'status',
        'received_by_user_id',
        'resolved_by_user_id',
        'resolved_at',
        'payment_id',
        'note',
    ];

    protected $casts = [
        'amount' => 'float',
        'resolved_at' => 'datetime',
    ];

    /** @return BelongsTo<Order, $this> */
    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<Payment, $this> */
    public function payment()
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }

    /** @return BelongsTo<User, $this> */
    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function resolvedBy()
    {
        return $this->belongsTo(User::class, 'resolved_by_user_id');
    }
}
