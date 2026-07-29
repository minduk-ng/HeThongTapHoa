<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
        'issued_at',
    ];

    protected $casts = [
        'amount_received' => 'decimal:2',
        'change_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'issued_at' => 'datetime',
    ];

    public function orders()
    {
        return $this->hasMany(Order::class, 'invoice_id');
    }
}
