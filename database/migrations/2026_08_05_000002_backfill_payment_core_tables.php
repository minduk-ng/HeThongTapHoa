<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ponytail: schema-only rebuild => on a fresh DB this backfill has nothing to migrate.
        // Kept at its original path because tests/Feature/BackfillPaymentCoreTest.php requires it.
        if (! Schema::hasTable('invoices')) {
            return;
        }

        $invoices = DB::table('invoices')->get();
        foreach ($invoices as $inv) {
            $invoiceId = $inv->id;

            // payments: 1 dòng theo payment_method cũ (nếu amount_received > 0)
            if ((float) $inv->amount_received > 0 && DB::table('payments')->where('invoice_id', $invoiceId)->doesntExist()) {
                DB::table('payments')->insert([
                    'invoice_id' => $invoiceId,
                    'method' => in_array($inv->payment_method, ['cash', 'bank_transfer', 'e_wallet']) ? $inv->payment_method : 'cash',
                    'amount' => $inv->amount_received,
                    'created_at' => $inv->created_at,
                    'updated_at' => $inv->created_at,
                ]);
            }

            // invoice_lines từ order_items của các orders thuộc invoice (chỉ nếu chưa có)
            if (DB::table('invoice_lines')->where('invoice_id', $invoiceId)->doesntExist()) {
                $items = DB::table('order_items')
                    ->join('orders', 'orders.id', '=', 'order_items.order_id')
                    ->leftJoin('menu_items', 'menu_items.id', '=', 'order_items.menu_item_id')
                    ->where('orders.invoice_id', $invoiceId)
                    ->where('order_items.status', '!=', 'cancelled')
                    ->select('order_items.*', 'menu_items.name as item_name', 'menu_items.vat_rate')
                    ->get();

                foreach ($items as $it) {
                    DB::table('invoice_lines')->insert([
                        'invoice_id' => $invoiceId,
                        'order_item_id' => $it->id,
                        'menu_item_id' => $it->menu_item_id,
                        'name_snapshot' => $it->item_name ?? 'Món',
                        'quantity' => $it->quantity,
                        'unit_price' => $it->unit_price,
                        'subtotal' => $it->subtotal,
                        'vat_rate' => 0,
                        'vat_amount' => 0,
                        'discount_amount' => $it->discount_amount ?? 0,
                        'created_at' => $inv->created_at,
                        'updated_at' => $inv->created_at,
                    ]);
                }

                // invoice_promotions từ orders.promotion_id (1 dòng/đơn)
                $ordersWithPromo = DB::table('orders')
                    ->where('invoice_id', $invoiceId)
                    ->whereNotNull('promotion_id')
                    ->get();
                foreach ($ordersWithPromo as $o) {
                    $promo = DB::table('promotions')->find($o->promotion_id);
                    if ($promo instanceof stdClass && DB::table('invoice_promotions')->where('invoice_id', $invoiceId)->where('promotion_id', $promo->id)->doesntExist()) {
                        DB::table('invoice_promotions')->insert([
                            'invoice_id' => $invoiceId,
                            'promotion_id' => $promo->id,
                            'code' => $promo->code,
                            'name' => $promo->name,
                            'discount_type' => $promo->discount_type,
                            'discount_value' => $promo->discount_value,
                            'stack_order' => 0,
                            'amount' => (float) $o->discount_amount,
                            'created_at' => $inv->created_at,
                            'updated_at' => $inv->created_at,
                        ]);
                    }
                }
            }

            // điền subtotal/vat/discount tổng cho invoice cũ
            $subtotal = (float) DB::table('orders')->where('invoice_id', $invoiceId)->sum('subtotal');
            $discount = (float) DB::table('orders')->where('invoice_id', $invoiceId)->sum('discount_amount');
            DB::table('invoices')->where('id', $invoiceId)->update([
                'subtotal_amount' => $subtotal,
                'discount_amount' => $discount,
            ]);
        }
    }

    public function down(): void
    {
        // Backfill is one-way historical reconstruction. Truncating would destroy
        // live post-deploy checkout data in payments/invoice_lines/invoice_promotions.
        // Intentionally a no-op.
    }
};
