<?php

namespace App\Http\Controllers\Manager;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Services\Inventory\LotService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class StocktakeController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('manager/inventory/stocktake/StocktakeManager', [
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'stock_quantity']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.ingredient_id' => 'required|exists:ingredients,id',
            'items.*.actual_qty' => 'required|numeric|min:0',
        ]);

        $changedItems = [];
        foreach ($validated['items'] ?? [] as $it) {
            $actual = (float) $it['actual_qty'];
            if (abs($actual - LotService::totalRemaining((int) $it['ingredient_id'])) > 0.0001
                || abs($actual - (float) Ingredient::find((int) $it['ingredient_id'])?->stock_quantity) > 0.0001) {
                $changedItems[] = $it;
            }
        }
        $changes = collect($changedItems);

        if ($changes->isEmpty()) {
            return back()->with('info', 'Không có thay đổi tồn kho nào.');
        }

        DB::transaction(function () use ($changes, $request) {
            $voucher = LotService::createAdjustmentVoucher($request->user()?->id, 'Kiểm kê kho', []);

            foreach ($changes as $it) {
                $ing = Ingredient::query()->lockForUpdate()->find((int) $it['ingredient_id']);
                if (! $ing) {
                    continue;
                }
                $actual = (float) $it['actual_qty'];
                $residual = round($actual - LotService::totalRemaining($ing->id), 2);
                if (abs($residual) < 0.0001) {
                    $ing->update(['stock_quantity' => $actual]);
                    IngredientStockUpdated::dispatch(['ingredient_id' => $ing->id]);

                    continue;
                }
                $lotFields = [];
                if ($residual < 0) {
                    LotService::decrement($ing, abs($residual));
                } else {
                    $lot = LotService::increment($ing, $residual);
                    if (! $lot) {
                        $lotFields['quantity_remaining'] = $residual;
                    }
                }

                $voucher->items()->create(array_merge([
                    'ingredient_id' => $ing->id,
                    'quantity' => $residual,
                    'unit_price' => null,
                ], $lotFields));

                $ing->update(['stock_quantity' => $actual]);
                IngredientStockUpdated::dispatch(['ingredient_id' => $ing->id]);
            }
        });

        return back()->with('success', 'Kiểm kê hoàn tất.');
    }
}
