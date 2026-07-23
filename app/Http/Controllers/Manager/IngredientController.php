<?php

namespace App\Http\Controllers\Manager;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Inertia\Inertia;

class IngredientController extends Controller
{
    public function index(Request $request)
    {
        $query = Ingredient::query();

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }

        if ($request->filled('unit') && $request->unit !== 'all') {
            $query->where('unit', $request->unit);
        }

        if ($request->filled('alert') && $request->alert === 'low') {
            $query->whereColumn('stock_quantity', '<=', 'min_stock_alert');
        }

        $ingredients = $query->orderBy('id', 'desc')->get();

        $allUnits = Ingredient::select('unit')->distinct()->pluck('unit')->toArray();

        return Inertia::render('manager/inventory/ingredients/IngredientsManager', [
            'ingredients' => $ingredients,
            'units' => $allUnits,
            'filters' => $request->only(['search', 'unit', 'alert']),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:ingredients,name',
            'unit' => 'required|string|max:20',
            'stock_quantity' => 'required|numeric|min:0',
            'min_stock_alert' => 'nullable|numeric|min:0',
            'cost_price' => 'nullable|numeric|min:0',
        ]);

        $slug = Str::slug($validated['name']);
        $validated['code'] = $slug;
        $validated['min_stock_alert'] = $validated['min_stock_alert'] ?? 50;
        $validated['cost_price'] = $validated['cost_price'] ?? 0;

        $ingredient = Ingredient::create($validated);

        IngredientStockUpdated::dispatch(['ingredient_id' => $ingredient->id]);

        return back()->with('success', 'Thêm nguyên liệu thành công!');
    }

    public function update(Request $request, Ingredient $ingredient)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:ingredients,name,'.$ingredient->id,
            'unit' => 'required|string|max:20',
            'stock_quantity' => 'required|numeric|min:0',
            'min_stock_alert' => 'nullable|numeric|min:0',
            'cost_price' => 'nullable|numeric|min:0',
        ]);

        $ingredient->update($validated);

        IngredientStockUpdated::dispatch(['ingredient_id' => $ingredient->id]);

        return back()->with('success', 'Cập nhật nguyên liệu thành công!');
    }

    public function destroy(Request $request, Ingredient $ingredient)
    {
        $request->validate([
            'password' => 'required|string',
        ]);

        if (! Hash::check($request->password, $request->user()->password)) {
            return back()->withErrors(['password' => 'Mật khẩu không chính xác.']);
        }

        $ingredientId = $ingredient->id;
        $ingredient->delete();

        IngredientStockUpdated::dispatch(['ingredient_id' => $ingredientId]);

        return back()->with('success', 'Xóa nguyên liệu thành công!');
    }

    public function importStock(Request $request)
    {
        $validated = $request->validate([
            'ingredient_id' => 'required|exists:ingredients,id',
            'quantity' => 'required|numeric|gt:0',
            'unit_price' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:255',
        ]);

        DB::transaction(function () use ($validated) {
            $ingredient = Ingredient::lockForUpdate()->findOrFail($validated['ingredient_id']);
            $currentStock = (float) $ingredient->stock_quantity;
            $currentCost = (float) $ingredient->cost_price;

            $importQty = (float) $validated['quantity'];
            $importPrice = (float) $validated['unit_price'];

            // Calculate weighted average cost price
            $newStock = $currentStock + $importQty;
            $newAvgCost = $newStock > 0
                ? (($currentStock * $currentCost) + ($importQty * $importPrice)) / $newStock
                : $importPrice;

            $ingredient->update([
                'stock_quantity' => $newStock,
                'cost_price' => round($newAvgCost, 2),
            ]);

            // Log inventory transaction
            DB::table('inventory_transactions')->insert([
                'ingredient_id' => $ingredient->id,
                'type' => 'import',
                'quantity' => $importQty,
                'reason' => $validated['note'] ?: "Nhập kho (+{$importQty} {$ingredient->unit})",
                'transacted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        IngredientStockUpdated::dispatch(['ingredient_id' => $validated['ingredient_id']]);

        return back()->with('success', 'Nhập kho nguyên liệu thành công!');
    }
}
