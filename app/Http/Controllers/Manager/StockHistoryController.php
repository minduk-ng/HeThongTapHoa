<?php

namespace App\Http\Controllers\Manager;

use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\StockVoucherItem;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class StockHistoryController extends Controller
{
    public function index(): Response
    {
        $ingredientId = (int) request('ingredient_id');

        $query = StockVoucherItem::with('voucher')->where('ingredient_id', $ingredientId);

        if (request('from')) {
            $query->whereHas('voucher', fn ($q) => $q->where('transacted_at', '>=', Carbon::parse(request('from'))->startOfDay()));
        }
        if (request('to')) {
            $query->whereHas('voucher', fn ($q) => $q->where('transacted_at', '<=', Carbon::parse(request('to'))->endOfDay()));
        }

        $items = $query->orderBy('transacted_at', 'asc')->get();

        $running = 0.0;
        $rows = $items->map(function ($it) use (&$running) {
            $running += (float) $it->quantity;
            return [
                'transacted_at' => $it->voucher?->transacted_at?->format('d/m/Y H:i'),
                'voucher_code' => $it->voucher?->voucher_code,
                'type' => $it->voucher?->type,
                'quantity' => round((float) $it->quantity, 2),
                'note' => $it->voucher?->note,
                'balance' => round($running, 2),
            ];
        })->values();

        return Inertia::render('manager/inventory/history/StockHistoryManager', [
            'ingredients' => Ingredient::orderBy('name')->get(['id', 'code', 'name', 'unit']),
            'ingredientId' => $ingredientId,
            'rows' => $rows,
            'filters' => request()->only(['from', 'to']),
        ]);
    }
}
