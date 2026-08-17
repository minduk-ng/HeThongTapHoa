<?php

namespace App\Http\Controllers\Manager;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;
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

        $changes = collect($validated['items'])->filter(fn ($it) => abs($it['actual_qty'] - (float) Ingredient::find($it['ingredient_id'])->stock_quantity) > 0.0001);

        if ($changes->isEmpty()) {
            return back()->with('info', 'Không có thay đổi tồn kho nào.');
        }

        $employeeId = Employee::idForUser($request->user()?->id);
        $dateStr = now()->format('Ymd');
        $prefix = "KK-{$dateStr}-";

        DB::transaction(function () use ($changes, $employeeId, $request, $prefix) {
            $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
                ->lockForUpdate()->pluck('voucher_code')
                ->map(fn ($c) => (int) substr($c, strlen($prefix)))->max() ?? 0;
            $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

            $voucher = StockVoucher::create([
                'voucher_code' => $voucherCode,
                'type' => 'adjustment',
                'employee_id' => $employeeId,
                'transacted_at' => now(),
                'note' => 'Kiểm kê kho',
                'created_by' => $request->user()?->id,
            ]);

            foreach ($changes as $it) {
                $ing = Ingredient::lockForUpdate()->find($it['ingredient_id']);
                if (! $ing) continue;
                $delta = (float) $it['actual_qty'] - (float) $ing->stock_quantity;
                if (abs($delta) < 0.0001) continue;

                $lotFields = [];

                // Cập nhật lô FIFO khi giảm
                if ($delta < 0) {
                    $remaining = abs($delta);
                    $lots = StockVoucherItem::where('ingredient_id', $ing->id)
                        ->where('quantity_remaining', '>', 0)->whereNotNull('quantity_remaining')
                        ->orderBy('expiry_date', 'asc')->lockForUpdate()->get();
                    foreach ($lots as $lot) {
                        if ($remaining <= 0) break;
                        $take = min((float) $lot->quantity_remaining, $remaining);
                        $lot->decrement('quantity_remaining', $take);
                        $remaining -= $take;
                    }
                } elseif ($delta > 0) {
                    // Dư: cộng vào lô còn hàng HSD mới nhất; nếu không có lô, dòng adjustment kiêm lô không HSD
                    $latest = StockVoucherItem::where('ingredient_id', $ing->id)
                        ->where('quantity_remaining', '>', 0)->whereNotNull('quantity_remaining')
                        ->orderByDesc('expiry_date')->lockForUpdate()->first();
                    if ($latest) {
                        $latest->increment('quantity_remaining', $delta);
                    } else {
                        $lotFields['quantity_remaining'] = $delta;
                    }
                }

                // Đúng MỘT dòng adjustment cho mỗi nguyên liệu (không tạo trùng)
                $voucher->items()->create(array_merge([
                    'ingredient_id' => $ing->id,
                    'quantity' => $delta,
                    'unit_price' => null,
                ], $lotFields));

                $ing->update(['stock_quantity' => $it['actual_qty']]);
                IngredientStockUpdated::dispatch(['ingredient_id' => $ing->id]);
            }
        });

        return back()->with('success', 'Kiểm kê hoàn tất.');
    }
}
