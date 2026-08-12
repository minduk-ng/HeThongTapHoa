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

        // 1) Tổng invoice thật mỗi promotion (mỗi invoice 1 lần, tránh nhân N khi bulk: 1 invoice / N order_promotions)
        $invoiceTotals = DB::table('order_promotions')
            ->join('invoices', 'invoices.id', '=', 'order_promotions.invoice_id')
            ->whereDate('order_promotions.created_at', $yesterday)
            ->whereNotNull('order_promotions.promotion_id')
            ->select('order_promotions.promotion_id', 'order_promotions.invoice_id', DB::raw('MAX(invoices.total_amount) as total'))
            ->groupBy('order_promotions.promotion_id', 'order_promotions.invoice_id')
            ->get();

        $revenueByPromo = $invoiceTotals->groupBy('promotion_id')
            ->map(fn ($g) => (float) $g->sum('total'));

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
                'revenue' => $revenueByPromo->get((int) $row->promotion_id, 0.0),
                'discount_total' => $row->discount_total,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $this->info("Đã rebuild daily_promotion_stats cho {$yesterday}");

        return self::SUCCESS;
    }
}
