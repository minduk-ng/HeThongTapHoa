<?php

namespace App\Http\Controllers\Staff;

use App\Events\IngredientStockUpdated;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Payment;
use App\Models\ProductRecipe;
use App\Models\StockVoucher;
use App\Services\Inventory\LotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class RefundController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
            'items' => 'required|array|min:1',
            'items.*.invoice_line_id' => 'required|exists:invoice_lines,id',
            'items.*.qty' => 'required|integer|min:1',
            'reason' => 'required|string|max:50',
            'note' => 'nullable|string|max:255',
        ]);

        try {
            DB::transaction(function () use ($validated, $request) {
                $invoice = Invoice::with('lines')->lockForUpdate()->findOrFail($validated['invoice_id']);

                if ($invoice->payment_method === '') {
                    throw new \Exception('Hóa đơn không hợp lệ để hoàn.', 422);
                }

                $refundTotal = 0.0;
                $linesMap = [];

                foreach ($validated['items'] as $item) {
                    $line = InvoiceLine::lockForUpdate()->findOrFail($item['invoice_line_id']);
                    if ((int) $line->invoice_id !== (int) $invoice->id) {
                        throw new \Exception('Dòng món không thuộc hóa đơn.', 422);
                    }

                    $refundQty = (int) $item['qty'];
                    $available = (int) $line->quantity - (int) $line->refunded_qty;
                    if ($refundQty > $available) {
                        throw new \Exception("Số lượng hoàn vượt quá số đã mua (còn {$available}).", 422);
                    }

                    $lineTotal = (float) $line->subtotal - (float) $line->discount_amount;
                    $lineRefund = round($lineTotal * ($refundQty / max(1, (int) $line->quantity)), 2);

                    $line->update(['refunded_qty' => (int) $line->refunded_qty + $refundQty]);

                    $refundTotal += $lineRefund;
                    $linesMap[] = ['line' => $line, 'qty' => $refundQty, 'amount' => $lineRefund];
                }

                // Payment âm
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => 'cash',
                    'amount' => -$refundTotal,
                    'note' => 'Hoàn trả hoá đơn '.$invoice->invoice_code.' ('.($validated['reason'] ?? '').')',
                    'received_by' => $request->user()?->id,
                ]);

                // Trả kho
                $voucher = null;
                foreach ($linesMap as $map) {
                    $line = $map['line'];
                    if (! $line->menu_item_id) {
                        continue;
                    }
                    $recipes = ProductRecipe::where('menu_item_id', $line->menu_item_id)->get();
                    if ($recipes->isEmpty()) {
                        continue;
                    }

                    if (! $voucher) {
                        $voucher = StockVoucher::create([
                            'voucher_code' => 'PN-RF-'.date('Ymd').'-'.strtoupper(Str::random(4)),
                            'type' => 'import',
                            'transacted_at' => now(),
                            'note' => 'Hoàn trả hoá đơn '.$invoice->invoice_code,
                            'created_by' => $request->user()?->id,
                        ]);
                    }

                    foreach ($recipes as $recipe) {
                        $qtyToReturn = $recipe->amount * $map['qty'];
                        $ingredient = Ingredient::lockForUpdate()->find($recipe->ingredient_id);
                        if (! $ingredient) {
                            continue;
                        }

                        $ingredient->increment('stock_quantity', $qtyToReturn);
                        $lot = LotService::increment($ingredient, $qtyToReturn);
                        $voucher->items()->create([
                            'ingredient_id' => $ingredient->id,
                            'quantity' => $qtyToReturn,
                            'unit_price' => null,
                        ] + ($lot === null ? ['quantity_remaining' => $qtyToReturn] : []));
                    }
                }
            });

            Cache::tags(['dashboard'])->flush();
            IngredientStockUpdated::dispatch(['source' => 'refund']);

            return response()->json(['success' => true, 'message' => 'Hoàn trả thành công!']);
        } catch (\Throwable $e) {
            Log::error('Refund error: '.$e->getMessage());

            return response()->json([
                'error' => $e->getMessage(),
                'message' => $e->getMessage(),
            ], $e->getCode() === 422 ? 422 : 500);
        }
    }
}
