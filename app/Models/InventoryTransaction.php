<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InventoryTransaction extends Model
{
    use HasFactory;

    protected $table = 'inventory_transactions';

    protected $fillable = [
        'ingredient_id',
        'employee_id',
        'type',
        'quantity',
        'reason',
        'transacted_at',
    ];

    protected $casts = [
        'quantity' => 'float',
        'transacted_at' => 'datetime',
    ];

    public function ingredient()
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }
}
