<?php

namespace App\Http\Controllers\Manager;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\StockVoucher;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class StockVoucherController extends Controller
{
    public function index(Request $request): Response
    {
        $query = StockVoucher::with('employee', 'creator')->orderByDesc('transacted_at');

        if ($request->filled('type') && in_array($request->type, ['import', 'export'], true)) {
            $query->where('type', $request->type);
        }
        if ($request->filled('from')) {
            $query->where('transacted_at', '>=', $request->from.' 00:00:00');
        }
        if ($request->filled('to')) {
            $query->where('transacted_at', '<=', $request->to.' 23:59:59');
        }
        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('voucher_code', 'like', "%{$search}%")
                    ->orWhere('note', 'like', "%{$search}%");
            });
        }

        $vouchers = $query->get()->map(fn ($v) => [
            'id' => $v->id,
            'voucher_code' => $v->voucher_code,
            'type' => $v->type,
            'transacted_at' => $v->transacted_at?->format('d/m/Y H:i'),
            'note' => $v->note,
            'employee_name' => $v->employee?->full_name,
        ]);

        return Inertia::render('manager/inventory/vouchers/StockVouchersManager', [
            'vouchers' => $vouchers,
            'filters' => $request->only(['type', 'from', 'to', 'search']),
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'stock_quantity', 'min_stock_alert', 'cost_price']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.ingredient_id' => 'required|exists:ingredients,id',
            'items.*.quantity' => 'required|numeric|gt:0',
            'items.*.unit_price' => 'required|numeric|min:0',
            'note' => 'nullable|string|max:255',
        ]);

        $employeeId = Employee::idForUser($request->user()?->id);
        $dateStr = now()->format('Ymd');
        $prefix = "PN-{$dateStr}-";

        DB::transaction(function () use ($validated, $employeeId, $request, $prefix) {
            $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
                ->lockForUpdate()
                ->pluck('voucher_code')
                ->map(fn ($code) => (int) substr($code, strlen($prefix)))
                ->max() ?? 0;
            $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

            $voucher = StockVoucher::create([
                'voucher_code' => $voucherCode,
                'type' => 'import',
                'employee_id' => $employeeId,
                'transacted_at' => now(),
                'note' => $validated['note'] ?? null,
                'created_by' => $request->user()?->id,
            ]);

            foreach ($validated['items'] as $item) {
                $ingredient = Ingredient::lockForUpdate()->findOrFail($item['ingredient_id']);
                $currentStock = (float) $ingredient->stock_quantity;
                $currentCost = (float) $ingredient->cost_price;
                $importQty = (float) $item['quantity'];
                $importPrice = (float) $item['unit_price'];

                $newStock = $currentStock + $importQty;
                $newAvgCost = $newStock > 0
                    ? (($currentStock * $currentCost) + ($importQty * $importPrice)) / $newStock
                    : $importPrice;

                $ingredient->update([
                    'stock_quantity' => $newStock,
                    'cost_price' => round($newAvgCost, 2),
                ]);

                $voucher->items()->create([
                    'ingredient_id' => $ingredient->id,
                    'quantity' => $importQty,
                    'unit_price' => $importPrice,
                ]);
            }
        });

        Cache::tags(['dashboard'])->flush();
        IngredientStockUpdated::dispatch(['source' => 'voucher_import']);

        return back()->with('success', 'Tạo phiếu nhập kho thành công!');
    }

    public function show(int $id): Response
    {
        $voucher = StockVoucher::with(['items.ingredient', 'employee', 'creator'])
            ->findOrFail($id);

        $pivotRows = $voucher->items->map(fn ($item) => [
            'ingredient_id' => $item->ingredient_id,
            'name' => $item->ingredient->name ?? 'Nguyên liệu',
            'unit' => $item->ingredient->unit ?? '',
            'code' => $item->ingredient?->code,
            'quantity' => (float) $item->quantity,
            'unit_price' => $item->unit_price,
            'total' => (float) $item->quantity * (float) ($item->unit_price ?? 0),
        ]);

        return Inertia::render('manager/inventory/vouchers/StockVouchersManager', [
            'vouchers' => StockVoucher::with('employee')->orderByDesc('transacted_at')->get()->map(fn ($v) => [
                'id' => $v->id,
                'voucher_code' => $v->voucher_code,
                'type' => $v->type,
                'transacted_at' => $v->transacted_at?->format('d/m/Y H:i'),
                'note' => $v->note,
                'employee_name' => $v->employee?->full_name,
            ]),
            'filters' => [],
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'stock_quantity', 'min_stock_alert', 'cost_price']),
            'detail' => [
                'voucher' => [
                    'id' => $voucher->id,
                    'voucher_code' => $voucher->voucher_code,
                    'type' => $voucher->type,
                    'transacted_at' => $voucher->transacted_at?->format('d/m/Y H:i'),
                    'note' => $voucher->note,
                    'employee_name' => $voucher->employee?->full_name,
                ],
                'items' => $pivotRows,
            ],
        ]);
    }
}
