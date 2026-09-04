<?php

namespace App\Services\Checkout;

use App\Models\Deposit;
use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePromotion;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPromotion;
use App\Models\Payment;
use App\Models\ProductRecipe;
use App\Models\Promotion;
use App\Models\StockVoucher;
use App\Models\Table;
use App\Services\Inventory\LotService;
use App\Services\OrderActivityLogger;
use App\Services\Promotions\PromotionEngine;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class CheckoutService
{
    /**
     * Thanh toán 1 đơn.
     *
     * @param  array<int,array{method:string,amount:float,reference?:?string,note?:?string}>  $paymentRows
     * @param  array<string>  $promotionCodes
     */
    public static function run(Order $order, array $paymentRows, array $promotionCodes, ?int $userId, ?int $selectedPromotionId = null, ?int $customerId = null): Invoice
    {
        return static::runBulk(collect([$order]), $paymentRows, $promotionCodes, $userId, null, $selectedPromotionId, $customerId);
    }

    /**
     * Thanh toán nhiều đơn trong 1 invoice (bulk).
     *
     * @param  Collection<int,Order>  $orders
     * @param  array<int,array{method:string,amount:float,reference?:?string,note?:?string}>  $paymentRows
     * @param  array<string>  $promotionCodes
     */
    public static function runBulk(Collection $orders, array $paymentRows, array $promotionCodes, ?int $userId, ?string $tableName = null, ?int $selectedPromotionId = null, ?int $customerId = null): Invoice
    {
        $invoice = DB::transaction(function () use ($orders, $paymentRows, $promotionCodes, $userId, $tableName, $selectedPromotionId, $customerId) {
            $orders = $orders->values();

            // 1. Build lines từ tất cả orders
            /** @var array<int, array<string, mixed>> $lineInputs */
            $lineInputs = [];
            $subtotal = 0.0;
            /** @var Order $order */
            foreach ($orders as $order) {
                $activeItems = $order->items()->where('status', '!=', 'cancelled')->with('menuItem')->get();
                /** @var OrderItem $item */
                foreach ($activeItems as $item) {
                    $lineSubtotal = (float) $item->subtotal;
                    $rate = (float) ($item->menuItem->vat_rate ?? 0);
                    $lineVat = OrderTotals::vatInPrice($lineSubtotal, $rate);
                    $subtotal += $lineSubtotal;
                    $lineInputs[] = [
                        'order_id' => $order->id,
                        'order_item_id' => $item->id,
                        'menu_item_id' => $item->menu_item_id,
                        'name_snapshot' => $item->menuItem->name ?? 'Món',
                        'quantity' => (int) $item->quantity,
                        'unit_price' => (float) $item->unit_price,
                        'subtotal' => $lineSubtotal,
                        'vat_rate' => $rate,
                        'vat_amount' => $lineVat,
                        'category_id' => $item->menuItem->category_id ?? null,
                        'discount_amount' => 0.0,
                    ];
                }
            }

            // 2. Resolve promotions (engine) trên lines shape engine
            $engineLines = collect($lineInputs)->map(fn ($l) => [
                'order_item_id' => $l['order_item_id'],
                'menu_item_id' => $l['menu_item_id'],
                'quantity' => (int) ($l['quantity'] ?? 0),
                'subtotal' => $l['subtotal'],
                'category_id' => $l['category_id'],
            ]);

            $promotionRows = [];
            $totalDiscount = 0.0;
            $freeItemIds = [];
            $freeGiftTotals = [];   // list subtotal gốc các món tặng (để trừ khỏi allocableDiscount)
            $appliedPromotions = [];

            if (! empty($promotionCodes) || Promotion::query()->where('type', 'promotion')->where('status', true)->exists()) {
                $resolved = PromotionEngine::resolveAll($promotionCodes, $engineLines, $subtotal, true, $selectedPromotionId);
                if ($resolved['status'] === 'rejected') {
                    $reasonMsg = match ($resolved['reason'] ?? 'not_found') {
                        'out_of_slot' => 'Mã chỉ áp dụng trong khung giờ đã đăng ký.',
                        'already_used' => 'Mã khuyến mãi đã được sử dụng.',
                        'disabled' => 'Mã khuyến mãi đã bị vô hiệu hoá.',
                        'free_product_not_in_cart' => 'Đơn cần có món tặng mới áp dụng được mã này.',
                        default => 'Mã khuyến mãi không hợp lệ hoặc đã hết hạn.',
                    };
                    throw new \Exception($reasonMsg, 422);
                }
                $totalDiscount = $resolved['total_discount'];
                $freeItemIds = $resolved['free_item_ids'] ?? [];
                $appliedPromotions = $resolved['promotions'] ?? [];

                foreach ($appliedPromotions as $pr) {
                    $p = $pr['promotion'];
                    $promotionRows[] = [
                        'promotion_id' => $p->id,
                        'code' => $pr['code'] ?? $p->code ?? 'AUTO-'.$p->id,
                        'name' => $p->name,
                        'discount_type' => $pr['actions_applied'][0]['type'] ?? $p->type,
                        'discount_value' => (float) ($pr['actions_applied'][0]['value'] ?? 0),
                        'stack_order' => 0,
                        'amount' => $pr['amount'],
                    ];
                }
            }

            // 2b. Phân bổ discount xuống từng line (cho báo cáo line-level) theo tỷ trọng subtotal;
            //     món tặng (free_item_ids) set giá = 0, discount_amount = subtotal gốc (giá trị món tặng);
            //     chỉ phân bổ phần allocable (totalDiscount - giá trị món tặng) lên các line trả tiền
            $freeHandledIds = [];
            if ($totalDiscount > 0 && $subtotal > 0) {
                // Pass 1: xử lý các line tặng (giá = 0, discount = giá trị món tặng)
                foreach ($lineInputs as $idx => $li) {
                    $isFree = in_array((int) $li['menu_item_id'], $freeItemIds, true)
                        && ! in_array($li['order_item_id'], $freeHandledIds, true);
                    if ($isFree) {
                        $giftSubtotal = (float) $li['subtotal'];
                        $freeGiftTotals[] = $giftSubtotal;
                        $freeHandledIds[] = $li['order_item_id'];
                        $lineInputs[$idx]['unit_price'] = 0.0;
                        $lineInputs[$idx]['subtotal'] = 0.0;
                        $lineInputs[$idx]['vat_amount'] = 0.0;
                        $lineInputs[$idx]['discount_amount'] = round($giftSubtotal, 2);
                    }
                }
                // Pass 2: phân bổ phần allocable lên các line trả tiền
                $freeGiftTotal = (float) array_sum($freeGiftTotals);
                $allocableDiscount = max(0.0, $totalDiscount - $freeGiftTotal);
                $paidSubtotal = max(0.0, $subtotal - $freeGiftTotal);
                $paidIndexes = [];
                foreach ($lineInputs as $idx => $li) {
                    if (! in_array($li['order_item_id'], $freeHandledIds, true)) {
                        $paidIndexes[] = $idx;
                    }
                }
                if ($allocableDiscount > 0 && $paidSubtotal > 0 && $paidIndexes !== []) {
                    $assigned = 0.0;
                    $lastPaid = count($paidIndexes) - 1;
                    foreach ($paidIndexes as $n => $idx) {
                        $li = $lineInputs[$idx];
                        $lineDiscount = ($n === $lastPaid)
                            ? round($allocableDiscount - $assigned, 2)
                            : floor($allocableDiscount * (float) $li['subtotal'] / $paidSubtotal);
                        $assigned += $lineDiscount;
                        $lineInputs[$idx]['discount_amount'] = round(max(0, min($lineDiscount, (float) $li['subtotal'])), 2);
                        $netLineTotal = max(0.0, (float) $li['subtotal'] - (float) $lineInputs[$idx]['discount_amount']);
                        $lineInputs[$idx]['vat_amount'] = OrderTotals::vatInPrice($netLineTotal, (float) $li['vat_rate']);
                    }
                }
            }

            // VAT thực thu = tổng vat_amount các line sau discount
            $vatTotal = (float) collect($lineInputs)->sum('vat_amount');

            $total = max(0.0, $subtotal - $totalDiscount);

            // 3. Tính cọc và kiểm tra tiền nhận
            $depositTotal = 0.0;
            /** @var Deposit[] $heldDeposits */
            $heldDeposits = [];
            /** @var Order $order */
            foreach ($orders as $order) {
                $held = $order->deposits()->where('status', 'held')->lockForUpdate()->get();
                /** @var Deposit $d */
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
            $invoiceCode = 'INV-'.date('Ymd').strtoupper(Str::random(4));
            $invoice = Invoice::create([
                'invoice_code' => $invoiceCode,
                'table_name' => $tableName ?? self::tableNameFor($orders),
                'payment_method' => count($paymentRows) === 1 ? $paymentRows[0]['method'] : 'mixed',
                'amount_received' => $totalReceived,
                'change_amount' => round($totalReceived - $payable, 2),
                'total_amount' => $total,
                'deposit_amount' => $depositTotal,
                'subtotal_amount' => $subtotal,
                'vat_amount' => $vatTotal,
                'discount_amount' => $totalDiscount,
                'issued_at' => now(),
                'customer_id' => $customerId,
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

            // Hoàn tiền cọc thừa (nếu cọc > total) — payment row âm để ledger trừ đúng
            if ($depositTotal > $total) {
                Payment::create([
                    'invoice_id' => $invoice->id,
                    'method' => 'cash',
                    'amount' => -(round($depositTotal - $total, 2)),
                    'note' => 'Hoàn tiền cọc thừa',
                    'received_by' => $userId,
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

            // Đồng bộ discount xuống order_items (giữ tương thích hành vi endpoint cũ)
            foreach ($lineInputs as $li) {
                if ($li['order_item_id']) {
                    OrderItem::where('id', $li['order_item_id'])->update(['discount_amount' => $li['discount_amount']]);
                }
            }

            // 7. Ghi invoice_promotions (snapshot)
            foreach ($promotionRows as $pr) {
                InvoicePromotion::create(array_merge($pr, ['invoice_id' => $invoice->id]));
            }

            // 7b. Ghi order_promotions (fact) + increment used_count (đã lock trong engine)
            // Phân bổ discount của từng promotion theo tỷ trọng subtotal giữa các order
            // (SUM(discount_applied) per invoice phải = tổng giảm thực tế; không ghi full amount per order)
            $orderSubtotals = $orders->map(fn ($o) => (float) $o->items()
                ->where('status', '!=', 'cancelled')
                ->sum('subtotal'))->values();
            $totalSubtotal = (float) $orderSubtotals->sum();

            foreach ($appliedPromotions as $pr) {
                $promo = $pr['promotion'];
                $promoAmount = (float) $pr['amount'];
                $assigned = 0.0;
                $orderCount = $orders->count();
                foreach ($orders as $idx => $order) {
                    $sub = (float) ($orderSubtotals[$idx] ?? 0);
                    $allocated = ($idx === $orderCount - 1)
                        ? round($promoAmount - $assigned, 2)
                        : ($totalSubtotal > 0 ? floor($promoAmount * $sub / $totalSubtotal) : 0);
                    $allocated = round(max(0.0, min($allocated, $sub)), 2);
                    $assigned += $allocated;

                    OrderPromotion::create([
                        'invoice_id' => $invoice->id,
                        'order_id' => $order->id,
                        'promotion_id' => $promo->id,
                        'code_used' => $pr['code'],
                        'discount_applied' => $allocated,
                    ]);

                    // Truy vết invoice cho mọi mã con đã dùng
                    foreach ($pr['codes'] ?? [] as $pc) {
                        if ($pc->used_invoice_id === null) {
                            $pc->forceFill(['used_invoice_id' => $invoice->id])->save();
                        }
                    }
                }
            }

            // 7c. Upsert daily_promotion_stats (realtime) — revenue phân bổ theo tỷ trọng discount
            $invoiceTotal = (float) $invoice->total_amount;
            $totalDiscountThisInvoice = (float) array_sum(array_column($promotionRows, 'amount'));
            $statDate = now()->toDateString();
            $promoCount = count($appliedPromotions);
            $assignedRevenue = 0.0;
            foreach ($appliedPromotions as $idx => $pr) {
                $promo = $pr['promotion'];
                $promoAmount = (float) $pr['amount'];
                if ($idx === $promoCount - 1) {
                    // Đơn cuối nhận phần dư: tổng revenue = đúng invoiceTotal 1 lần
                    $revenueShare = round(max(0.0, $invoiceTotal - $assignedRevenue), 2);
                } elseif ($totalDiscountThisInvoice > 0) {
                    $revenueShare = round($invoiceTotal * $promoAmount / $totalDiscountThisInvoice, 2);
                    $assignedRevenue += $revenueShare;
                } elseif ($idx === 0) {
                    // Tổng discount = 0 → promotion đầu tiên nhận full, còn lại 0
                    $revenueShare = round($invoiceTotal, 2);
                    $assignedRevenue += $revenueShare;
                } else {
                    $revenueShare = 0.0;
                }

                $attrs = ['promotion_id' => $promo->id, 'stat_date' => $statDate];
                $row = DB::table('daily_promotion_stats')->where($attrs)->first();
                if ($row) {
                    DB::table('daily_promotion_stats')->where($attrs)->increment('order_count', 1);
                    DB::table('daily_promotion_stats')->where($attrs)->increment('unique_orders', 1);
                    DB::table('daily_promotion_stats')->where($attrs)->increment('revenue', $revenueShare);
                    DB::table('daily_promotion_stats')->where($attrs)->increment('discount_total', round($promoAmount, 2));
                    DB::table('daily_promotion_stats')->where($attrs)->update(['updated_at' => now()]);
                } else {
                    DB::table('daily_promotion_stats')->insert(array_merge($attrs, [
                        'order_count' => 1,
                        'unique_orders' => 1,
                        'revenue' => $revenueShare,
                        'discount_total' => round($promoAmount, 2),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]));
                }
            }

            // 8. Cập nhật orders lấy trực tiếp từ $lineInputs đã phân bổ — đảm bảo order == invoice_lines
            $count = $orders->count();
            /** @var Order $order */
            foreach ($orders as $order) {
                $orderLines = collect($lineInputs)->where('order_id', $order->id);
                $orderSubtotal = round((float) $order->items()->where('status', '!=', 'cancelled')->sum('subtotal'), 2);
                $orderDiscount = round((float) $orderLines->sum('discount_amount'), 2);
                $orderVat = round((float) $orderLines->sum('vat_amount'), 2);
                $orderTotal = round(max(0.0, $orderSubtotal - $orderDiscount), 2);

                $order->update([
                    'status' => 'paid',
                    'invoice_id' => $invoice->id,
                    'customer_id' => $customerId,
                    'subtotal' => $orderSubtotal,
                    'vat_amount' => $orderVat,
                    'discount_amount' => $orderDiscount,
                    'total' => $orderTotal,
                ]);

                $meta = [
                    'invoice_code' => $invoiceCode,
                    'total' => $orderTotal,
                    'bulk' => $count > 1,
                    'payment_method' => count($paymentRows) === 1 ? $paymentRows[0]['method'] : 'mixed',
                ];
                if ($depositTotal > $total) {
                    $meta['deposit_refund'] = max(0.0, $depositTotal - $total);
                }

                OrderActivityLogger::log($order, 'checkout', $userId, $meta);
            }

            self::createStockExportVoucher($orders, $userId);

            return $invoice;
        });

        // Dashboard KPI tiền thay đổi sau mỗi checkout → flush cache dashboard
        Cache::tags(['dashboard'])->flush();

        // used_count thay đổi sau checkout → flush cache promotions hiển thị POS
        try {
            Cache::tags(['pos_promotions'])->flush();
        } catch (\Throwable $e) {
            Log::warning('pos_promotions cache flush failed: '.$e->getMessage());
        }

        return $invoice;
    }

    /**
     * @param  Collection<int, Order>  $orders
     */
    private static function tableNameFor(Collection $orders): string
    {
        $first = $orders->first();
        $table = $first?->table;
        if (! $table) {
            return 'Mang Đi';
        }
        $primaryId = $table->merged_into_table_id ?? $table->id;
        $all = Table::where('id', $primaryId)->orWhere('merged_into_table_id', $primaryId)->get();
        $sub = $all->where('id', '!=', $primaryId)->pluck('table_number')->implode(', ');
        $primary = $all->firstWhere('id', $primaryId);

        return $sub ? "{$primary->table_number} (Gộp {$sub})" : $primary->table_number;
    }

    /**
     * @param  Collection<int, Order>  $orders
     */
    private static function createStockExportVoucher(Collection $orders, ?int $userId): void
    {
        $employeeId = Employee::idForUser($userId);

        // Aggregate: menu_item_id → tổng quantity (chỉ items không cancelled)
        $menuQuantities = collect();
        foreach ($orders as $order) {
            $activeItems = $order->items()->where('status', '!=', 'cancelled')->get();
            foreach ($activeItems as $item) {
                $menuQuantities->put((int) $item->menu_item_id, (int) $menuQuantities->get((int) $item->menu_item_id, 0) + (int) $item->quantity);
            }
        }
        if ($menuQuantities->isEmpty()) {
            return;
        }

        // Recipes → ingredient total used
        $recipes = ProductRecipe::whereIn('menu_item_id', $menuQuantities->keys())->get();
        if ($recipes->isEmpty()) {
            return;
        }

        $ingredientTotals = [];
        foreach ($recipes as $recipe) {
            $used = (float) $recipe->amount * (int) $menuQuantities->get((int) $recipe->menu_item_id, 0);
            $ingredientTotals[(int) $recipe->ingredient_id] = ($ingredientTotals[(int) $recipe->ingredient_id] ?? 0) + $used;
        }
        if (empty($ingredientTotals)) {
            return;
        }

        $dateStr = now()->format('Ymd');
        $prefix = "PX-{$dateStr}-";
        $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
            ->lockForUpdate()
            ->pluck('voucher_code')
            ->map(fn ($code) => (int) substr($code, strlen($prefix)))
            ->max() ?? 0;
        $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

        $invoiceCodes = $orders->map(fn ($o) => $o->invoice->invoice_code ?? $o->order_code)->unique()->implode(', ');

        $voucher = StockVoucher::create([
            'voucher_code' => $voucherCode,
            'type' => 'export',
            'employee_id' => $employeeId,
            'transacted_at' => now(),
            'note' => 'Xuất kho tự động cho Hoá đơn '.$invoiceCodes,
            'created_by' => $userId,
        ]);

        foreach ($ingredientTotals as $ingredientId => $totalUsed) {
            $ingredient = Ingredient::lockForUpdate()->find($ingredientId);
            if (! $ingredient) {
                continue;
            }
            $available = LotService::totalRemaining($ingredient->id);
            if ($totalUsed - $available > 0.0001) {
                throw new \Exception(
                    "Không đủ nguyên liệu {$ingredient->name} (cần ".round($totalUsed, 2).', còn '.round($available, 2).').',
                    422,
                );
            }
            $ingredient->decrement('stock_quantity', $totalUsed);
            LotService::decrement($ingredient, $totalUsed);

            $voucher->items()->create([
                'ingredient_id' => $ingredientId,
                'quantity' => -$totalUsed,
                'unit_price' => null,
            ]);
        }
    }
}
