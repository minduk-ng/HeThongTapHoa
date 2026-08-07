<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $menu_item_id
 * @property int $ingredient_id
 * @property float $amount
 * @property string $unit
 * @property-read \App\Models\MenuItem $menuItem
 * @property-read \App\Models\Ingredient $ingredient
 */
class ProductRecipe extends Model
{
    use HasFactory;

    protected $fillable = [
        'menu_item_id',
        'ingredient_id',
        'amount',
        'unit',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function menuItem(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'menu_item_id');
    }

    public function ingredient(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id');
    }
}
