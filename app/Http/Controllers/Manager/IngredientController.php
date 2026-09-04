<?php

namespace App\Http\Controllers\Manager;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\Supplier;
use App\Services\Inventory\LotService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class IngredientController extends Controller
{
    public function index(Request $request): Response
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
            'suppliers' => Supplier::orderBy('name')->get(['id', 'name']),
            'filters' => $request->only(['search', 'unit', 'alert']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:ingredients,name',
            'unit' => 'required|string|max:20',
            'purchase_unit' => 'nullable|string|max:20',
            'unit_conversion' => 'nullable|numeric|gt:0',
            'stock_quantity' => 'required|numeric|min:0',
            'min_stock_alert' => 'nullable|numeric|min:0',
            'cost_price' => 'nullable|numeric|min:0',
        ]);

        $slug = Str::slug($validated['name']);
        $validated['code'] = $slug;
        $validated['min_stock_alert'] = $validated['min_stock_alert'] ?? 50;
        $validated['cost_price'] = $validated['cost_price'] ?? 0;
        $validated['unit_conversion'] = $validated['unit_conversion'] ?? 1;

        $ingredient = DB::transaction(function () use ($validated, $request) {
            $ingredient = Ingredient::create($validated);

            if ((float) $ingredient->stock_quantity > 0) {
                LotService::createAdjustmentVoucher($request->user()?->id, 'Tồn đầu kỳ', [[
                    'ingredient_id' => $ingredient->id,
                    'quantity' => (float) $ingredient->stock_quantity,
                    'quantity_remaining' => (float) $ingredient->stock_quantity,
                ]]);
            }

            return $ingredient;
        });

        IngredientStockUpdated::dispatch(['ingredient_id' => $ingredient->id]);

        return back()->with('success', 'Thêm nguyên liệu thành công!');
    }

    public function update(Request $request, Ingredient $ingredient): RedirectResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100|unique:ingredients,name,'.$ingredient->id,
            'unit' => 'required|string|max:20',
            'purchase_unit' => 'nullable|string|max:20',
            'unit_conversion' => 'nullable|numeric|gt:0',
            'stock_quantity' => 'required|numeric|min:0',
            'min_stock_alert' => 'nullable|numeric|min:0',
            'cost_price' => 'nullable|numeric|min:0',
        ]);

        $validated['unit_conversion'] = $validated['unit_conversion'] ?? 1;

        $oldQty = (float) $ingredient->stock_quantity;
        $newQty = (float) $validated['stock_quantity'];

        if (abs($newQty - $oldQty) < 0.0001) {
            $ingredient->update($validated);
        } else {
            DB::transaction(function () use ($ingredient, $newQty, $validated, $request) {
                $ingredient = Ingredient::lockForUpdate()->find($ingredient->id);
                $residual = round($newQty - LotService::totalRemaining($ingredient->id), 2);
                $lotFields = [];
                if ($residual > 0) {
                    $lot = LotService::increment($ingredient, $residual);
                    if (! $lot) {
                        $lotFields['quantity_remaining'] = $residual;
                    }
                } elseif ($residual < 0) {
                    LotService::decrement($ingredient, abs($residual));
                }

                $ingredient->update($validated);

                if (abs($residual) >= 0.0001) {
                    LotService::createAdjustmentVoucher($request->user()?->id, 'Điều chỉnh thủ công tồn kho', [
                        array_merge([
                            'ingredient_id' => $ingredient->id,
                            'quantity' => $residual,
                            'unit_price' => null,
                        ], $lotFields),
                    ]);
                }
            });
        }

        IngredientStockUpdated::dispatch(['ingredient_id' => $ingredient->id]);

        return back()->with('success', 'Cập nhật nguyên liệu thành công!');
    }

    public function destroy(Request $request, Ingredient $ingredient): RedirectResponse
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
}
