<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AggregateDailyPromotionStats extends Command
{
    protected $signature = 'promotions:aggregate-daily';

    protected $description = 'Rebuild daily_promotion_stats cho ngày hôm qua từ order_promotions + invoices';

    public function handle(): int
    {
        $yesterday = now()->subDay()->toDateString();

        DB::table('daily_promotion_stats')->where('stat_date', $yesterday)->delete();

        // 1) Phân bổ revenue theo tỷ trọng discount: mỗi invoice 1 lần, không nhân N
        $invoiceLines = DB::table('order_promotions')
            ->join('invoices', 'invoices.id', '=', 'order_promotions.invoice_id')
            ->whereDate('order_promotions.created_at', $yesterday)
            ->whereNotNull('order_promotions.promotion_id')
            ->select(
                'order_promotions.promotion_id',
                'order_promotions.invoice_id',
                'invoices.total_amount as total',
                'order_promotions.discount_applied as discount'
            )
            ->get();

        $revenueByPromo = [];
        foreach ($invoiceLines->groupBy('invoice_id') as $invoiceGroup) {
            $invoiceTotal = (float) $invoiceGroup->first()->total;
            $invoiceDiscount = (float) $invoiceGroup->sum('discount');
            $promoLines = $invoiceGroup->values();
            $lastIdx = count($promoLines) - 1;
            $assigned = 0.0;
            foreach ($promoLines as $idx => $line) {
                $promoId = (int) $line->promotion_id;
                if ($idx === $lastIdx) {
                    // Dòng cuối nhận phần dư: tổng revenue per invoice = đúng 1 lần invoiceTotal
                    $share = round(max(0.0, $invoiceTotal - $assigned), 2);
                } elseif ($invoiceDiscount > 0) {
                    $share = round($invoiceTotal * (float) $line->discount / $invoiceDiscount, 2);
                } elseif ($idx === 0) {
                    // Tổng discount = 0 → promotion đầu tiên nhận full, còn lại 0
                    $share = round($invoiceTotal, 2);
                } else {
                    $share = 0.0;
                }
                $assigned += $share;
                $revenueByPromo[$promoId] = ($revenueByPromo[$promoId] ?? 0.0) + $share;
            }
        }

        // 2) order_count / unique_orders / discount_total từ order_promotions
        $orderStats = DB::table('order_promotions')
            ->whereDate('created_at', $yesterday)
            ->whereNotNull('promotion_id')
            ->select(
                'promotion_id',
                DB::raw('COUNT(DISTINCT invoice_id) as order_count'),
                DB::raw('COUNT(DISTINCT order_id) as unique_orders'),
                DB::raw('SUM(discount_applied) as discount_total')
            )
            ->groupBy('promotion_id')
            ->get();

        foreach ($orderStats as $row) {
            DB::table('daily_promotion_stats')->insert([
                'promotion_id' => $row->promotion_id,
                'stat_date' => $yesterday,
                'order_count' => $row->order_count,
                'unique_orders' => $row->unique_orders,
                'revenue' => $revenueByPromo[(int) $row->promotion_id] ?? 0.0,
                'discount_total' => $row->discount_total,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $this->info("Đã rebuild daily_promotion_stats cho {$yesterday}");

        return self::SUCCESS;
    }
}
