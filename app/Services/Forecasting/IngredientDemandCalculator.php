<?php

namespace App\Services\Forecasting;

use App\Models\Ingredient;
use App\Models\ProductRecipe;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class IngredientDemandCalculator
{
    /**
     * Convert product forecasts to ingredient demands via recipe BOM.
     *
     * @param  array<mixed>|Collection<int, mixed>  $productForecasts
     * @param  Collection<int, ProductRecipe>  $recipes
     * @return array{
     *     demands: array<int, array<string, mixed>>,
     *     issues: array<int, array<string, mixed>>,
     *     bom_hash: string
     * }
     */
    public function calculate(array|Collection $productForecasts, Collection $recipes): array
    {
        $forecastsByItem = $this->normalizeForecasts($productForecasts);
        $recipesByItem = $recipes->groupBy(fn ($r) => (int) ($r->menu_item_id ?? 0));

        $demands = [];
        $issues = [];
        $unconvertibleIngredients = [];

        foreach ($forecastsByItem as $menuItemId => $dailyForecasts) {
            /** @var Collection<int, ProductRecipe>|null $itemRecipes */
            $itemRecipes = $recipesByItem->get($menuItemId);

            if ($itemRecipes === null || $itemRecipes->isEmpty()) {
                $issues[] = [
                    'menu_item_id' => $menuItemId,
                    'type' => 'missing_recipe',
                    'message' => "Menu item ID {$menuItemId} has forecasts but no recipe BOM defined.",
                ];

                continue;
            }

            foreach ($itemRecipes as $recipe) {
                $ingredientId = (int) ($recipe->ingredient_id ?? 0);
                $ingredient = $recipe->relationLoaded('ingredient')
                    ? $recipe->getRelation('ingredient')
                    : Ingredient::find($ingredientId);

                if (! $ingredient instanceof Ingredient) {
                    $issues[] = [
                        'menu_item_id' => $menuItemId,
                        'ingredient_id' => $ingredientId,
                        'type' => 'missing_ingredient',
                        'message' => "Ingredient ID {$ingredientId} not found for menu item ID {$menuItemId}.",
                    ];
                    $unconvertibleIngredients[$ingredientId] = true;

                    continue;
                }

                $recipeAmount = (float) ($recipe->amount ?? 0);
                $recipeUnit = (string) ($recipe->unit ?? '');

                $convertedPerProduct = $ingredient->convertToStockUnit($recipeAmount, $recipeUnit);

                if ($convertedPerProduct === null) {
                    $issues[] = [
                        'menu_item_id' => $menuItemId,
                        'ingredient_id' => $ingredientId,
                        'type' => 'unconvertible_unit',
                        'recipe_unit' => $recipeUnit,
                        'ingredient_unit' => (string) $ingredient->unit,
                        'message' => "Recipe unit '{$recipeUnit}' does not match ingredient base unit '{$ingredient->unit}' and no unit conversion applies.",
                    ];
                    $unconvertibleIngredients[$ingredientId] = true;

                    continue;
                }

                if (! isset($demands[$ingredientId])) {
                    $demands[$ingredientId] = [
                        'ingredient_id' => $ingredientId,
                        'ingredient_name' => (string) $ingredient->name,
                        'unit' => (string) $ingredient->unit,
                        'purchase_unit' => (string) ($ingredient->purchase_unit ?? $ingredient->unit),
                        'demand_quantity' => 0.0,
                        'daily_demands' => [],
                    ];
                }

                foreach ($dailyForecasts as $date => $productQty) {
                    $ingQty = round($productQty * $convertedPerProduct, 4);
                    $demands[$ingredientId]['daily_demands'][$date] = round(
                        ($demands[$ingredientId]['daily_demands'][$date] ?? 0.0) + $ingQty,
                        4
                    );
                    $demands[$ingredientId]['demand_quantity'] = round(
                        $demands[$ingredientId]['demand_quantity'] + $ingQty,
                        4
                    );
                }
            }
        }

        // ponytail: reject recommendations when recipe unit is unconvertible (Spec Section 9 & Task Brief)
        foreach (array_keys($unconvertibleIngredients) as $rejectedId) {
            unset($demands[$rejectedId]);
        }

        return [
            'demands' => $demands,
            'issues' => $issues,
            'bom_hash' => $this->bomHash($recipes),
        ];
    }

    /**
     * Deterministic sha256 BOM hash from sorted (menu_item_id, ingredient_id, amount, unit, updated_at) tuples.
     *
     * @param  Collection<int, ProductRecipe>  $recipes
     */
    public function bomHash(Collection $recipes): string
    {
        $tuples = $recipes->map(function ($recipe) {
            $updatedAt = $recipe->updated_at ? $recipe->updated_at->format('Y-m-d H:i:s') : '';

            return [
                'menu_item_id' => (int) ($recipe->menu_item_id ?? 0),
                'ingredient_id' => (int) ($recipe->ingredient_id ?? 0),
                'amount' => (float) ($recipe->amount ?? 0),
                'unit' => strtolower(trim((string) ($recipe->unit ?? ''))),
                'updated_at' => $updatedAt,
            ];
        })->all();

        usort($tuples, function (array $a, array $b): int {
            return [$a['menu_item_id'], $a['ingredient_id'], $a['amount'], $a['unit'], $a['updated_at']]
                <=> [$b['menu_item_id'], $b['ingredient_id'], $b['amount'], $b['unit'], $b['updated_at']];
        });

        return hash('sha256', (string) json_encode($tuples, JSON_THROW_ON_ERROR));
    }

    /**
     * @param  array<mixed>|Collection<int, mixed>  $forecasts
     * @return array<int, array<string, float>>
     */
    private function normalizeForecasts(array|Collection $forecasts): array
    {
        $items = $forecasts instanceof Collection ? $forecasts->all() : $forecasts;
        $normalized = [];

        foreach ($items as $key => $value) {
            if ($value instanceof Model) {
                $menuItemId = (int) $value->getAttribute('menu_item_id');
                $qty = (float) $value->getAttribute('forecast_quantity');
                $date = (string) ($value->getAttribute('forecast_date') ?? 'total');
                $normalized[$menuItemId][$date] = ($normalized[$menuItemId][$date] ?? 0.0) + $qty;
            } elseif (is_array($value) || is_object($value)) {
                $arr = (array) $value;
                if (isset($arr['menu_item_id'])) {
                    $menuItemId = (int) $arr['menu_item_id'];
                    $qty = (float) ($arr['forecast_quantity'] ?? $arr['quantity'] ?? 0.0);
                    $date = (string) ($arr['forecast_date'] ?? $arr['date'] ?? 'total');
                    $normalized[$menuItemId][$date] = ($normalized[$menuItemId][$date] ?? 0.0) + $qty;
                } else {
                    $menuItemId = (int) $key;
                    foreach ($arr as $date => $qty) {
                        $normalized[$menuItemId][(string) $date] = ($normalized[$menuItemId][(string) $date] ?? 0.0) + (float) $qty;
                    }
                }
            } elseif (is_numeric($value)) {
                $menuItemId = (int) $key;
                $normalized[$menuItemId]['total'] = ($normalized[$menuItemId]['total'] ?? 0.0) + (float) $value;
            }
        }

        return $normalized;
    }
}
