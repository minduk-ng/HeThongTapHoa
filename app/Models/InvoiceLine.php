<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoiceLine extends Model
{
    protected $fillable = [
        'invoice_id', 'order_item_id', 'menu_item_id', 'name_snapshot',
        'quantity', 'unit_price', 'subtotal', 'vat_rate', 'vat_amount', 'discount_amount',
    ];

    protected $casts = [
        'quantity' => 'int',
        'unit_price' => 'float',
        'subtotal' => 'float',
        'vat_rate' => 'float',
        'vat_amount' => 'float',
        'discount_amount' => 'float',
    ];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }
}
