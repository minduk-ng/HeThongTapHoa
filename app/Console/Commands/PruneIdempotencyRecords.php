<?php

namespace App\Console\Commands;

use App\Models\IdempotencyRecord;
use Illuminate\Console\Command;

class PruneIdempotencyRecords extends Command
{
    protected $signature = 'idempotency:prune {--days=30 : Số ngày lưu trữ tối đa}';

    protected $description = 'Xóa các bản ghi idempotency cũ hơn số ngày chỉ định (mặc định 30 ngày)';

    public function handle(): int
    {
        $days = (int) $this->option('days');
        $deleted = IdempotencyRecord::where('created_at', '<', now()->subDays($days))->delete();

        $this->info("Đã xóa {$deleted} bản ghi idempotency cũ hơn {$days} ngày.");

        return self::SUCCESS;
    }
}
