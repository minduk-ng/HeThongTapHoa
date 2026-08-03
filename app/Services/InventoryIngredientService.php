<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\InventoryTransaction;
use App\Models\OrderItem;
use App\Models\ProductRecipe;

class InventoryIngredientService
{
    public function restoreIngredients(OrderItem $item, ?int $userId, string $orderCode): void
    {
        $employeeId = Employee::idForUser($userId);

        $recipes = ProductRecipe::where('menu_item_id', $item->menu_item_id)->get();

        foreach ($recipes as $recipe) {
            $ingredient = Ingredient::find($recipe->ingredient_id);
            if (! $ingredient) {
                continue;
            }

            $quantity = (float) $recipe->amount * (int) $item->quantity;
            $ingredient->increment('stock_quantity', $quantity);

            InventoryTransaction::create([
                'ingredient_id' => $ingredient->id,
                'employee_id' => $employeeId,
                'type' => 'import',
                'quantity' => $quantity,
                'reason' => $orderCode === '' ? 'Hoàn kho do hủy món' : "Hoàn kho do hủy món {$orderCode}",
                'transacted_at' => now(),
            ]);
        }
    }
}
