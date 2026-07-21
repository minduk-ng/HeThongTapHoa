<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    use HasFactory;

    protected $table = 'invoices';

    protected $fillable = [
        'order_id',
        'invoice_code',
        'payment_method',
        'amount_received',
        'change_amount',
        'issued_at',
    ];

    protected $casts = [
        'amount_received' => 'decimal:2',
        'change_amount' => 'decimal:2',
        'issued_at' => 'datetime',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'order_id');
    }
}
