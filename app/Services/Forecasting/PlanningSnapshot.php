<?php

namespace App\Services\Forecasting;

use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\ProductRecipe;

class PlanningSnapshot
{
    /**
     * Capture an immutable snapshot of ingredients, recipes, and supplier policies.
     *
     * @return array{
     *     ingredients: array<int, array<string, mixed>>,
     *     recipes: list<array<string, mixed>>,
     *     policies: array<int, array<string, mixed>>,
     *     captured_at: string,
     *     content_hash: string
     * }
     */
    public function capture(): array
    {
        $ingredients = Ingredient::all()->keyBy('id')->map(function ($ing) {
            return [
                'id' => (int) $ing->id,
                'code' => (string) $ing->code,
                'name' => (string) $ing->name,
                'unit' => (string) $ing->unit,
                'purchase_unit' => (string) ($ing->purchase_unit ?? $ing->unit),
                'unit_conversion' => (float) ($ing->unit_conversion ?? 1.0),
                'stock_quantity' => (float) $ing->stock_quantity,
                'cost_price' => (float) ($ing->cost_price ?? 0.0),
            ];
        })->all();
        ksort($ingredients);

        $recipes = ProductRecipe::all()->map(function ($r) {
            return [
                'id' => (int) $r->id,
                'menu_item_id' => (int) $r->menu_item_id,
                'ingredient_id' => (int) $r->ingredient_id,
                'amount' => (float) $r->amount,
                'unit' => (string) $r->unit,
                'updated_at' => $r->updated_at?->format('Y-m-d H:i:s'),
            ];
        })->all();

        usort($recipes, fn ($a, $b) => [$a['menu_item_id'], $a['ingredient_id'], $a['amount'], $a['unit']] <=> [$b['menu_item_id'], $b['ingredient_id'], $b['amount'], $b['unit']]);

        $policies = [];
        $allPolicies = IngredientSupplierPolicy::orderByDesc('is_preferred')->orderByDesc('is_primary')->orderBy('ingredient_id')->get();
        foreach ($allPolicies as $pol) {
            $ingId = (int) $pol->ingredient_id;
            if (! isset($policies[$ingId])) {
                $policies[$ingId] = [
                    'supplier_id' => $pol->supplier_id ? (int) $pol->supplier_id : null,
                    'lead_days' => (int) ($pol->lead_days ?? 1),
                    'service_factor' => (float) ($pol->service_factor ?? 1.65),
                    'ordering_cost' => (float) $pol->ordering_cost > 0 ? (float) $pol->ordering_cost : null,
                    'annual_holding_cost' => (float) $pol->annual_holding_cost > 0 ? (float) $pol->annual_holding_cost : null,
                    'moq' => (float) ($pol->moq ?? 0.0),
                    'order_multiple' => (float) ($pol->order_multiple ?? 1.0),
                    'pack_size' => (float) ($pol->pack_size ?? 1.0),
                    'policy_hash' => (string) $pol->policy_hash,
                ];
            }
        }
        ksort($policies);

        $hashRecipes = array_map(fn ($r) => [
            'menu_item_id' => $r['menu_item_id'],
            'ingredient_id' => $r['ingredient_id'],
            'amount' => $r['amount'],
            'unit' => $r['unit'],
        ], $recipes);

        $hashPayload = [
            'ingredients' => array_values($ingredients),
            'recipes' => $hashRecipes,
            'policies' => $policies,
        ];
        $contentHash = hash('sha256', (string) json_encode($hashPayload, JSON_THROW_ON_ERROR));

        return [
            'ingredients' => $ingredients,
            'recipes' => $recipes,
            'policies' => $policies,
            'captured_at' => now()->toISOString(),
            'content_hash' => $contentHash,
        ];
    }
}
