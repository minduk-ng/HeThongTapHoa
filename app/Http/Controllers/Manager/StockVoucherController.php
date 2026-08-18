<?php

namespace App\Http\Controllers\Manager;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\ProductRecipe;
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

        if ($request->filled('type') && in_array($request->type, ['import', 'export', 'adjustment'], true)) {
            $query->where('type', $request->type);
        }
        if ($request->filled('from')) {
            $query->where('transacted_at', '>=', $request->from.' 00:00:00');
        }
        if ($request->filled('to')) {
            $query->where('transacted_at', '<=', $request->to.' 23:59:59');
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('voucher_code', 'like', "%{$s}%")
                    ->orWhere('note', 'like', "%{$s}%");
            });
        }

        $vouchers = $query->get()->map(fn ($v) => [
            'id' => $v->id,
            'voucher_code' => $v->voucher_code,
            'type' => $v->type,
            'transacted_at' => $v->transacted_at?->format('d/m/Y H:i'),
            'sort_key' => $v->transacted_at?->format('Y-m-d H:i:s') ?? '',
            'note' => $v->note,
            'employee_name' => $v->creator?->name ?? $v->employee?->full_name ?? '—',
        ]);

        $ingredients = Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit', 'purchase_unit', 'unit_conversion', 'stock_quantity', 'min_stock_alert', 'cost_price']);

        return Inertia::render('manager/inventory/vouchers/StockVouchersManager', [
            'vouchers' => $vouchers,
            'filters' => $request->only(['type', 'from', 'to', 'search']),
            'ingredients' => $ingredients,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:255'],
            'transacted_at' => ['nullable', 'date'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.ingredient_id' => ['required', 'exists:ingredients,id'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.expiry_date' => ['nullable', 'date'],
        ]);

        $userId = $request->user()->id;
        $employeeId = Employee::idForUser($userId);

        DB::transaction(function () use ($validated, $userId, $employeeId) {
            $dateStr = now()->format('Ymd');
            $prefix = "PN-{$dateStr}-";
            $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
                ->lockForUpdate()
                ->pluck('voucher_code')
                ->map(fn ($code) => (int) substr($code, strlen($prefix)))
                ->max() ?? 0;
            $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

            $transactedAt = ! empty($validated['transacted_at'])
                ? $validated['transacted_at']
                : now();

            $voucher = StockVoucher::create([
                'voucher_code' => $voucherCode,
                'type' => 'import',
                'employee_id' => $employeeId,
                'transacted_at' => $transactedAt,
                'note' => $validated['note'] ?? null,
                'created_by' => $userId,
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
                    'expiry_date' => $item['expiry_date'] ?? null,
                    'quantity_remaining' => $importQty,
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

        $soldProductsMap = [];

        if ($voucher->type === 'export' && ! empty($voucher->note)) {
            preg_match_all('/(HD-[A-Za-z0-9\-]+|ORD-[A-Za-z0-9\-]+)/', $voucher->note, $matches);
            $codes = array_unique($matches[0] ?? []);

            if (! empty($codes)) {
                $invoiceCodes = array_filter($codes, fn ($c) => str_starts_with($c, 'HD-'));
                $orderCodes = array_filter($codes, fn ($c) => str_starts_with($c, 'ORD-'));

                if (! empty($invoiceCodes)) {
                    $invoices = Invoice::whereIn('invoice_code', $invoiceCodes)->with(['lines', 'orders.items.menuItem'])->get();
                    foreach ($invoices as $inv) {
                        if ($inv->lines->isNotEmpty()) {
                            foreach ($inv->lines as $line) {
                                if ($line->menu_item_id) {
                                    $mId = (int) $line->menu_item_id;
                                    $qty = (int) $line->quantity;
                                    if (! isset($soldProductsMap[$mId])) {
                                        $soldProductsMap[$mId] = [
                                            'id' => $mId,
                                            'name' => $line->name_snapshot ?: (MenuItem::find($mId)?->name ?? 'Món #'.$mId),
                                            'quantity' => 0,
                                        ];
                                    }
                                    $soldProductsMap[$mId]['quantity'] += $qty;
                                }
                            }
                        } else {
                            foreach ($inv->orders as $ord) {
                                foreach ($ord->items as $item) {
                                    if ($item->status !== 'cancelled' && $item->menu_item_id) {
                                        $mId = (int) $item->menu_item_id;
                                        $qty = (int) $item->quantity;
                                        if (! isset($soldProductsMap[$mId])) {
                                            $soldProductsMap[$mId] = [
                                                'id' => $mId,
                                                'name' => $item->menuItem?->name ?? 'Món #'.$mId,
                                                'quantity' => 0,
                                            ];
                                        }
                                        $soldProductsMap[$mId]['quantity'] += $qty;
                                    }
                                }
                            }
                        }
                    }
                }

                if (! empty($orderCodes)) {
                    $orders = Order::whereIn('order_code', $orderCodes)->with('items.menuItem')->get();
                    foreach ($orders as $ord) {
                        foreach ($ord->items as $item) {
                            if ($item->status !== 'cancelled' && $item->menu_item_id) {
                                $mId = (int) $item->menu_item_id;
                                $qty = (int) $item->quantity;
                                if (! isset($soldProductsMap[$mId])) {
                                    $soldProductsMap[$mId] = [
                                        'id' => $mId,
                                        'name' => $item->menuItem?->name ?? 'Món #'.$mId,
                                        'quantity' => 0,
                                    ];
                                }
                                $soldProductsMap[$mId]['quantity'] += $qty;
                            }
                        }
                    }
                }
            }
        }

        $products = array_values($soldProductsMap);

        $menuItemIds = array_keys($soldProductsMap);
        $recipesByIngredient = [];
        if (! empty($menuItemIds)) {
            $recipes = ProductRecipe::whereIn('menu_item_id', $menuItemIds)->with('menuItem')->get();
            foreach ($recipes as $recipe) {
                $recipesByIngredient[$recipe->ingredient_id][] = $recipe;
            }
        }

        $items = $voucher->items->map(function ($item) use ($recipesByIngredient, $soldProductsMap) {
            $children = [];
            $ingredientId = $item->ingredient_id;
            if (isset($recipesByIngredient[$ingredientId])) {
                foreach ($recipesByIngredient[$ingredientId] as $recipe) {
                    $pId = $recipe->menu_item_id;
                    if (isset($soldProductsMap[$pId])) {
                        $pQty = (int) $soldProductsMap[$pId]['quantity'];
                        $amount = (float) $recipe->amount;
                        $totalQty = $pQty * $amount;
                        $children[] = [
                            'product_id' => $pId,
                            'product_name' => $recipe->menuItem?->name ?? $soldProductsMap[$pId]['name'],
                            'product_quantity' => $pQty,
                            'recipe_amount' => $amount,
                            'unit' => $recipe->unit ?: ($item->ingredient?->unit ?? ''),
                            'total_quantity' => $totalQty,
                        ];
                    }
                }
            }

            return [
                'ingredient_id' => $item->ingredient_id,
                'code' => $item->ingredient?->code,
                'name' => $item->ingredient->name ?? 'Nguyên liệu',
                'unit' => $item->ingredient->unit ?? '',
                'quantity' => (float) $item->quantity,
                'unit_price' => $item->unit_price,
                'total' => abs((float) $item->quantity) * (float) ($item->unit_price ?? 0),
                'children' => $children,
            ];
        });

        $total = $voucher->type === 'import'
            ? $items->sum('total')
            : null;

        return Inertia::render('manager/inventory/vouchers/StockVoucherDetail', [
            'voucher' => [
                'id' => $voucher->id,
                'voucher_code' => $voucher->voucher_code,
                'type' => $voucher->type,
                'transacted_at' => $voucher->transacted_at?->format('d/m/Y H:i'),
                'note' => $voucher->note,
                'employee_name' => $voucher->creator?->name ?? $voucher->employee?->full_name ?? '—',
            ],
            'products' => $products,
            'items' => $items,
            'total' => $total,
        ]);
    }
}
