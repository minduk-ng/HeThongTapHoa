<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoicePromotion extends Model
{
    protected $table = 'invoice_promotions';

    protected $fillable = [
        'invoice_id', 'promotion_id', 'code', 'name', 'discount_type',
        'discount_value', 'stack_order', 'amount',
    ];

    protected $casts = [
        'discount_value' => 'float',
        'stack_order' => 'int',
        'amount' => 'float',
    ];

    public function invoice()
    {
        return $this->belongsTo(Invoice::class);
    }

    public function promotion()
    {
        return $this->belongsTo(Promotion::class);
    }
}
