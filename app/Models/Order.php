<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use HasFactory;

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
    ];

    protected $casts = [
        'subtotal' => 'float',
        'vat_amount' => 'float',
        'discount_amount' => 'float',
        'total' => 'float',
        'has_additional_items' => 'boolean',
    ];

    public function table()
    {
        return $this->belongsTo(Table::class, 'table_id');
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    public function invoice()
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    public function activities()
    {
        return $this->hasMany(OrderActivity::class)->orderBy('created_at');
    }
}
