<?php

namespace App\Services\Checkout;

use App\Models\Deposit;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePromotion;
use App\Models\Order;
use App\Models\Payment;
use App\Services\OrderActivityLogger;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Facades\DB;

class CheckoutService
{
    /**
     * Thanh toán 1 đơn.
     * @param  array<int,array{method:string,amount:float,reference?:?string,note?:?string}>  $paymentRows
     * @param  array<string>  $promotionCodes
     */
    public static function run(Order $order, array $paymentRows, array $promotionCodes, ?int $userId): Invoice
    {
        return static::runBulk(collect([$order]), $paymentRows, $promotionCodes, $userId, null);
    }

    /**
     * Thanh toán nhiều đơn trong 1 invoice (bulk).
     * @param  \Illuminate\Support\Collection<int,Order>  $orders
     * @param  array<int,array{method:string,amount:float,reference?:?string,note?:?string}>  $paymentRows
     * @param  array<string>  $promotionCodes
     */
    public static function runBulk(\Illuminate\Support\Collection $orders, array $paymentRows, array $promotionCodes, ?int $userId, ?string $tableName = null): Invoice
    {
        return DB::transaction(function () use ($orders, $paymentRows, $promotionCodes, $userId, $tableName) {
            $orders = $orders->values();

            // 1. Build lines từ tất cả orders
            $lineInputs = [];
            $subtotal = 0.0;
            $vatTotal = 0.0;
            foreach ($orders as $order) {
                $activeItems = $order->items()->where('status', '!=', 'cancelled')->with('menuItem')->get();
                foreach ($activeItems as $item) {
                    $lineSubtotal = (float) $item->subtotal;
                    $rate = (float) ($item->menuItem?->vat_rate ?? 0);
                    $lineVat = OrderTotals::vatInPrice($lineSubtotal, $rate);
                    $subtotal += $lineSubtotal;
                    $vatTotal += $lineVat;
                    $lineInputs[] = [
                        'order_id' => $order->id,
                        'order_item_id' => $item->id,
                        'menu_item_id' => $item->menu_item_id,
                        'name_snapshot' => $item->menuItem?->name ?? 'Món',
                        'quantity' => (int) $item->quantity,
                        'unit_price' => (float) $item->unit_price,
                        'subtotal' => $lineSubtotal,
                        'vat_rate' => $rate,
                        'vat_amount' => $lineVat,
                        'category_id' => $item->menuItem?->category_id,
                        'discount_amount' => 0.0,
                    ];
                }
            }

            // 2. Resolve promotions (engine) trên lines shape engine
            $engineLines = collect($lineInputs)->map(fn ($l) => [
                'order_item_id' => $l['order_item_id'],
                'menu_item_id' => $l['menu_item_id'],
                'subtotal' => $l['subtotal'],
                'category_id' => $l['category_id'],
            ]);

            $promotionRows = [];
            $totalDiscount = 0.0;
            if (! empty($promotionCodes)) {
                $resolved = PromotionEngine::resolveAll($promotionCodes, $engineLines, $subtotal, true);
                if ($resolved['status'] === 'rejected') {
                    throw new \Exception('Mã khuyến mãi '.$resolved['code'].' không hợp lệ hoặc đã hết hạn.', 422);
                }
                $totalDiscount = $resolved['total_discount'];
                foreach ($resolved['promotions'] as $pr) {
                    $p = $pr['promotion'];
                    $promotionRows[] = [
                        'promotion_id' => $p->id,
                        'code' => $p->code,
                        'name' => $p->name,
                        'discount_type' => $p->discount_type,
                        'discount_value' => (float) $p->discount_value,
                        'stack_order' => $pr['stack_order'],
                        'amount' => $pr['amount'],
                    ];
                }

                // Phân bổ tổng discount xuống lines theo tỷ trọng subtotal
                if ($totalDiscount > 0 && $subtotal > 0) {
                    $assigned = 0.0;
                    $count = count($lineInputs);
                    foreach ($lineInputs as $idx => $li) {
                        $d = ($idx === $count - 1)
                            ? round($totalDiscount - $assigned, 2)
                            : floor($totalDiscount * $li['subtotal'] / $subtotal);
                        $lineInputs[$idx]['discount_amount'] = round(max(0, min($d, $li['subtotal'])), 2);
                        $assigned += $lineInputs[$idx]['discount_amount'];
                    }
                }
            }

            $total = max(0.0, $subtotal - $totalDiscount);

            // 3. Tính cọc và kiểm tra tiền nhận
            $depositTotal = 0.0;
            $heldDeposits = [];
            foreach ($orders as $order) {
                $held = $order->deposits()->where('status', 'held')->get();
                foreach ($held as $d) {
                    $heldDeposits[] = $d;
                    $depositTotal += (float) $d->amount;
                }
            }

            $payable = max(0.0, $total - $depositTotal);
            $totalReceived = (float) collect($paymentRows)->sum('amount');
            if ($totalReceived < $payable) {
                throw new \Exception('Số tiền khách đưa không đủ.', 422);
            }

            // 4. Tạo invoice
            $invoiceCode = 'INV-'.date('Ymd').strtoupper(\Illuminate\Support\Str::random(4));
            $invoice = Invoice::create([
                'invoice_code' => $invoiceCode,
                'table_name' => $tableName ?? static::tableNameFor($orders),
                'payment_method' => count($paymentRows) === 1 ? $paymentRows[0]['method'] : 'mixed',
                'amount_received' => $totalReceived,
                'change_amount' => round($totalReceived - $payable, 2),
                'total_amount' => $total,
                'deposit_amount' => $depositTotal,
                'subtotal_amount' => $subtotal,
                'vat_amount' => $vatTotal,
                'discount_amount' => $totalDiscount,
                'issued_at' => now(),
            ]);

            // 5. Ghi payments: ưu tiên paymentRows; cọc applied thành payment row
            foreach ($paymentRows as $row) {
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => $row['method'],
                    'amount' => (float) $row['amount'],
                    'reference' => $row['reference'] ?? null,
                    'note' => $row['note'] ?? null,
                    'received_by' => $userId,
                ]);
            }
            foreach ($heldDeposits as $d) {
                $depositPayment = Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => $d->method === 'bank_transfer' ? 'bank_transfer' : 'cash',
                    'amount' => (float) $d->amount,
                    'note' => 'Tiền cọc đơn '.($d->order_id ?? '?'),
                    'received_by' => $userId,
                ]);
                $d->update([
                    'status' => 'applied',
                    'resolved_at' => now(),
                    'resolved_by_user_id' => $userId,
                    'payment_id' => $depositPayment->id,
                ]);
            }

            // 6. Ghi invoice_lines
            foreach ($lineInputs as $li) {
                InvoiceLine::create([
                    'invoice_id' => $invoice->id,
                    'order_item_id' => $li['order_item_id'],
                    'menu_item_id' => $li['menu_item_id'],
                    'name_snapshot' => $li['name_snapshot'],
                    'quantity' => $li['quantity'],
                    'unit_price' => $li['unit_price'],
                    'subtotal' => $li['subtotal'],
                    'vat_rate' => $li['vat_rate'],
                    'vat_amount' => $li['vat_amount'],
                    'discount_amount' => $li['discount_amount'],
                ]);
            }

            // 7. Ghi invoice_promotions + tăng used_count
            foreach ($promotionRows as $pr) {
                InvoicePromotion::create(array_merge($pr, ['invoice_id' => $invoice->id]));
                \App\Models\Promotion::where('id', $pr['promotion_id'])->increment('used_count');
            }

            // 8. Cập nhật orders (1 nguồn duy nhất): phân bổ discount theo tỷ trọng, đơn cuối nhận phần dư
            $count = $orders->count();
            $assignedDiscount = 0.0;
            foreach ($orders as $idx => $order) {
                $orderSubtotal = (float) $order->items()->where('status', '!=', 'cancelled')->sum('subtotal');
                $orderDiscount = 0.0;
                if ($totalDiscount > 0 && $subtotal > 0) {
                    if ($idx === $count - 1) {
                        $orderDiscount = round($totalDiscount - $assignedDiscount, 2);
                    } else {
                        $orderDiscount = floor($totalDiscount * $orderSubtotal / $subtotal);
                        $assignedDiscount += $orderDiscount;
                    }
                }
                $orderTotal = round(max(0.0, $orderSubtotal - $orderDiscount), 2);

                $order->update([
                    'status' => 'paid',
                    'invoice_id' => $invoice->id,
                    'promotion_id' => $promotionRows[0]['promotion_id'] ?? null,
                    'discount_amount' => $orderDiscount,
                    'total' => $orderTotal,
                ]);

                OrderActivityLogger::log($order, 'checkout', $userId, [
                    'invoice_code' => $invoiceCode,
                    'total' => $orderTotal,
                    'bulk' => $count > 1,
                ]);
            }

            return $invoice;
        });
    }

    private static function tableNameFor(\Illuminate\Support\Collection $orders): string
    {
        $first = $orders->first();
        $table = $first?->table;
        if (! $table) {
            return 'Mang Đi';
        }
        $primaryId = $table->merged_into_table_id ?? $table->id;
        $all = \App\Models\Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
        $sub = $all->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
        $primary = $all->firstWhere('id', $primaryId);
        return $sub ? "{$primary->table_number} (Gộp {$sub})" : $primary->table_number;
    }
}
