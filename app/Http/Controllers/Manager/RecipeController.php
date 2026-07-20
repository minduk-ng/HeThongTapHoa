<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\ProductRecipe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class RecipeController extends Controller
{
    public function index(Request $request)
    {
        $query = MenuItem::with(['category', 'recipes.ingredient']);

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where('name', 'like', "%{$search}%");
        }

        if ($request->filled('category_id') && $request->category_id !== 'all') {
            $query->where('category_id', $request->category_id);
        }

        $products = $query->orderBy('category_id', 'asc')->orderBy('id', 'desc')->get();
        $categories = MenuCategory::orderBy('sort_order', 'asc')->get();
        $ingredients = Ingredient::orderBy('name', 'asc')->get();

        return Inertia::render('manager/inventory/recipes/RecipesManager', [
            'products' => $products,
            'categories' => $categories,
            'ingredients' => $ingredients,
            'filters' => $request->only(['search', 'category_id']),
        ]);
    }

    public function updateRecipe(Request $request, MenuItem $product)
    {
        $request->validate([
            'items' => 'array',
            'items.*.ingredient_id' => 'required|exists:ingredients,id',
            'items.*.amount' => 'required|numeric|gt:0',
            'items.*.unit' => 'required|string|max:20',
        ]);

        DB::transaction(function () use ($request, $product) {
            ProductRecipe::where('menu_item_id', $product->id)->delete();

            if (!empty($request->items)) {
                foreach ($request->items as $item) {
                    ProductRecipe::create([
                        'menu_item_id' => $product->id,
                        'ingredient_id' => $item['ingredient_id'],
                        'amount' => $item['amount'],
                        'unit' => $item['unit'],
                    ]);
                }
            }
        });

        return back()->with('success', 'Cập nhật công thức định lượng thành công!');
    }
}
