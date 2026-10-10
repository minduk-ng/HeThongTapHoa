<?php

use App\Models\Ingredient;
use App\Models\IngredientSupplierPolicy;
use App\Models\ProductRecipe;
use App\Models\Supplier;
use App\Services\Forecasting\IngredientDemandCalculator;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Carbon;
use Tests\TestCase;

uses(TestCase::class);

it('generates deterministic bom hash from recipes regardless of order', function () {
    $now = Carbon::parse('2026-10-10 12:00:00');

    $recipe1 = new ProductRecipe([
        'menu_item_id' => 1,
        'ingredient_id' => 10,
        'amount' => 50.0,
        'unit' => 'ml',
    ]);
    $recipe1->updated_at = $now;

    $recipe2 = new ProductRecipe([
        'menu_item_id' => 2,
        'ingredient_id' => 20,
        'amount' => 100.0,
        'unit' => 'g',
    ]);
    $recipe2->updated_at = $now;

    $calculator = app(IngredientDemandCalculator::class);

    $hashA = $calculator->bomHash(new EloquentCollection([$recipe1, $recipe2]));
    $hashB = $calculator->bomHash(new EloquentCollection([$recipe2, $recipe1]));

    expect($hashA)->toBe($hashB)
        ->and(strlen($hashA))->toBe(64);
});

it('changes bom hash when recipe tuple attributes change', function () {
    $now = Carbon::parse('2026-10-10 12:00:00');

    $recipe1 = new ProductRecipe([
        'menu_item_id' => 1,
        'ingredient_id' => 10,
        'amount' => 50.0,
        'unit' => 'ml',
    ]);
    $recipe1->updated_at = $now;

    $recipeModified = new ProductRecipe([
        'menu_item_id' => 1,
        'ingredient_id' => 10,
        'amount' => 60.0,
        'unit' => 'ml',
    ]);
    $recipeModified->updated_at = $now;

    $calculator = app(IngredientDemandCalculator::class);

    $hash1 = $calculator->bomHash(new EloquentCollection([$recipe1]));
    $hash2 = $calculator->bomHash(new EloquentCollection([$recipeModified]));

    expect($hash1)->not->toBe($hash2);
});

it('calculates ingredient demand matching recipe unit to base unit', function () {
    $ingredient = new Ingredient([
        'code' => 'ING-1',
        'name' => 'Syrup',
        'unit' => 'ml',
        'stock_quantity' => 1000,
    ]);
    $ingredient->id = 5;

    $recipe = new ProductRecipe([
        'menu_item_id' => 1,
        'ingredient_id' => 5,
        'amount' => 30.0,
        'unit' => 'ml',
    ]);
    $recipe->setRelation('ingredient', $ingredient);

    $calculator = app(IngredientDemandCalculator::class);

    // 10 units of menu item 1 -> 300 ml
    $result = $calculator->calculate(
        [1 => 10.0],
        new EloquentCollection([$recipe])
    );

    expect($result['issues'])->toBeEmpty()
        ->and($result['demands'][5]['demand_quantity'])->toBe(300.0)
        ->and($result['demands'][5]['unit'])->toBe('ml');
});

it('converts recipe unit using ingredient purchase_unit and unit_conversion', function () {
    $ingredient = new Ingredient([
        'code' => 'ING-MILK',
        'name' => 'Condensed Milk',
        'unit' => 'ml',
        'purchase_unit' => 'can',
        'unit_conversion' => 950.0,
        'stock_quantity' => 2000,
    ]);
    $ingredient->id = 12;

    $recipe = new ProductRecipe([
        'menu_item_id' => 2,
        'ingredient_id' => 12,
        'amount' => 0.5, // 0.5 can = 475 ml
        'unit' => 'can',
    ]);
    $recipe->setRelation('ingredient', $ingredient);

    $calculator = app(IngredientDemandCalculator::class);

    // 4 units of menu item 2 -> 4 * 0.5 can = 2 cans = 1900 ml
    $result = $calculator->calculate(
        [2 => 4.0],
        new EloquentCollection([$recipe])
    );

    expect($result['issues'])->toBeEmpty()
        ->and($result['demands'][12]['demand_quantity'])->toBe(1900.0)
        ->and($result['demands'][12]['unit'])->toBe('ml');
});

it('converts standard metric units between liters and milliliters', function () {
    $ingredient = new Ingredient([
        'code' => 'ING-WATER',
        'name' => 'Water',
        'unit' => 'ml',
        'stock_quantity' => 5000,
    ]);
    $ingredient->id = 7;

    $recipe = new ProductRecipe([
        'menu_item_id' => 3,
        'ingredient_id' => 7,
        'amount' => 0.25, // 0.25 liters = 250 ml
        'unit' => 'l',
    ]);
    $recipe->setRelation('ingredient', $ingredient);

    $calculator = app(IngredientDemandCalculator::class);

    $result = $calculator->calculate(
        [3 => 2.0], // 2 items -> 500 ml
        new EloquentCollection([$recipe])
    );

    expect($result['issues'])->toBeEmpty()
        ->and($result['demands'][7]['demand_quantity'])->toBe(500.0);
});

it('rejects unconvertible unit and records structured issue', function () {
    $ingredient = new Ingredient([
        'code' => 'ING-EGG',
        'name' => 'Egg',
        'unit' => 'piece',
        'purchase_unit' => 'tray',
        'unit_conversion' => 30.0,
        'stock_quantity' => 60,
    ]);
    $ingredient->id = 9;

    $recipe = new ProductRecipe([
        'menu_item_id' => 4,
        'ingredient_id' => 9,
        'amount' => 200.0,
        'unit' => 'gram', // gram cannot convert to piece!
    ]);
    $recipe->setRelation('ingredient', $ingredient);

    $calculator = app(IngredientDemandCalculator::class);

    $result = $calculator->calculate(
        [4 => 5.0],
        new EloquentCollection([$recipe])
    );

    expect($result['issues'])->not->toBeEmpty()
        ->and($result['issues'][0]['type'])->toBe('unconvertible_unit')
        ->and($result['issues'][0]['ingredient_id'])->toBe(9)
        ->and($result['issues'][0]['menu_item_id'])->toBe(4)
        ->and(isset($result['demands'][9]))->toBeFalse();
});

it('records structured issue when forecasted product has no recipe', function () {
    $calculator = app(IngredientDemandCalculator::class);

    $result = $calculator->calculate(
        [999 => 10.0],
        new EloquentCollection([])
    );

    expect($result['issues'])->not->toBeEmpty()
        ->and($result['issues'][0]['type'])->toBe('missing_recipe')
        ->and($result['issues'][0]['menu_item_id'])->toBe(999);
});

it('aggregates demand from multiple products sharing the same ingredient', function () {
    $ingredient = new Ingredient([
        'code' => 'ING-COFFEE',
        'name' => 'Coffee Beans',
        'unit' => 'g',
        'stock_quantity' => 500,
    ]);
    $ingredient->id = 15;

    $recipeA = new ProductRecipe([
        'menu_item_id' => 10,
        'ingredient_id' => 15,
        'amount' => 18.0,
        'unit' => 'g',
    ]);
    $recipeA->setRelation('ingredient', $ingredient);

    $recipeB = new ProductRecipe([
        'menu_item_id' => 20,
        'ingredient_id' => 15,
        'amount' => 36.0,
        'unit' => 'g',
    ]);
    $recipeB->setRelation('ingredient', $ingredient);

    $calculator = app(IngredientDemandCalculator::class);

    // 10 of item A (180g) + 5 of item B (180g) = 360g
    $result = $calculator->calculate(
        [10 => 10.0, 20 => 5.0],
        new EloquentCollection([$recipeA, $recipeB])
    );

    expect($result['demands'][15]['demand_quantity'])->toBe(360.0);
});

it('tests Ingredient convertToStockUnit directly with various units', function () {
    $ingredient = new Ingredient([
        'code' => 'ING-SUGAR',
        'name' => 'Sugar',
        'unit' => 'g',
        'purchase_unit' => 'bag',
        'unit_conversion' => 5000.0,
    ]);

    expect($ingredient->convertToStockUnit(50.0, 'g'))->toBe(50.0)
        ->and($ingredient->convertToStockUnit(2.0, 'bag'))->toBe(10000.0)
        ->and($ingredient->convertToStockUnit(1.5, 'kg'))->toBe(1500.0)
        ->and($ingredient->convertToStockUnit(1.0, 'bottle'))->toBeNull();
});

it('provides policyFor helper on Ingredient and Supplier models', function () {
    $ingredient = new Ingredient(['code' => 'ING-TEA', 'name' => 'Tea', 'unit' => 'g']);
    $ingredient->id = 101;

    $supplier = new Supplier(['name' => 'Tea Co']);
    $supplier->id = 202;

    $policy = new IngredientSupplierPolicy([
        'ingredient_id' => 101,
        'supplier_id' => 202,
        'is_primary' => true,
    ]);

    $ingredient->setRelation('supplierPolicies', new EloquentCollection([$policy]));
    $supplier->setRelation('policies', new EloquentCollection([$policy]));

    expect($ingredient->policyFor($supplier)?->is_primary)->toBeTrue()
        ->and($supplier->policyFor($ingredient)?->is_primary)->toBeTrue();
});
