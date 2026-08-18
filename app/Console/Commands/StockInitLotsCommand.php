<?php

namespace App\Console\Commands;

use App\Models\Ingredient;
use App\Services\Inventory\LotService;
use Illuminate\Console\Command;

class StockInitLotsCommand extends Command
{
    protected $signature = 'stock:init-lots';

    protected $description = 'Tạo lô "Tồn đầu kỳ" cho nguyên liệu có stock_quantity > 0 nhưng chưa có lô (backfill dữ liệu cũ)';

    public function handle(): int
    {
        $ingredients = Ingredient::all();
        $created = 0;
        foreach ($ingredients as $ing) {
            if ((float) $ing->stock_quantity > 0 && LotService::totalRemaining($ing->id) < 0.0001) {
                LotService::createAdjustmentVoucher(null, 'Tồn đầu kỳ (backfill)', [[
                    'ingredient_id' => $ing->id,
                    'quantity' => (float) $ing->stock_quantity,
                    'quantity_remaining' => (float) $ing->stock_quantity,
                ]]);
                $created++;
            }
        }
        $this->info("Đã tạo lô tồn đầu kỳ cho {$created} nguyên liệu.");

        return self::SUCCESS;
    }
}
