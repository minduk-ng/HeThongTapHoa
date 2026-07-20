<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Ingredient extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'unit',
        'stock_quantity',
        'min_stock_alert',
        'cost_price',
        'expiry_date',
    ];

    protected $casts = [
        'stock_quantity' => 'float',
        'min_stock_alert' => 'float',
        'cost_price' => 'float',
    ];

    public function recipes()
    {
        return $this->hasMany(ProductRecipe::class, 'ingredient_id');
    }
}
