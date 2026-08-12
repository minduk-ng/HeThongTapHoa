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

        DB::table('order_promotions')
            ->join('invoices', 'invoices.id', '=', 'order_promotions.invoice_id')
            ->whereDate('order_promotions.created_at', $yesterday)
            ->whereNotNull('order_promotions.promotion_id')
            ->select(
                'order_promotions.promotion_id',
                DB::raw('COUNT(DISTINCT order_promotions.invoice_id) as order_count'),
                DB::raw('COUNT(DISTINCT order_promotions.order_id) as unique_orders'),
                DB::raw('SUM(invoices.total_amount) as revenue'),
                DB::raw('SUM(order_promotions.discount_applied) as discount_total')
            )
            ->groupBy('order_promotions.promotion_id')
            ->get()
            ->each(function ($row) use ($yesterday) {
                DB::table('daily_promotion_stats')->insert([
                    'promotion_id' => $row->promotion_id,
                    'stat_date' => $yesterday,
                    'order_count' => $row->order_count,
                    'unique_orders' => $row->unique_orders,
                    'revenue' => $row->revenue,
                    'discount_total' => $row->discount_total,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            });

        $this->info("Đã rebuild daily_promotion_stats cho {$yesterday}");

        return self::SUCCESS;
    }
}
