<?php

namespace App\Http\Controllers\Staff\Concerns;

use App\Models\Order;
use App\Models\Table;
use Illuminate\Support\Str;

trait GeneratesOrderCode
{
    protected function generateOrderCode(?Table $table): string
    {
        $normalized = $table ? str_replace('-', '', strtoupper(Str::slug($table->table_number))) : 'MD';
        $dateStr = date('ymd');
        $prefix = "{$normalized}-{$dateStr}-";

        $maxSeq = Order::where('order_code', 'like', $prefix.'%')
            ->lockForUpdate()
            ->pluck('order_code')
            ->map(fn ($code) => (int) substr($code, strlen($prefix)))
            ->max() ?? 0;

        $seq = str_pad($maxSeq + 1, 2, '0', STR_PAD_LEFT);

        return $prefix.$seq;
    }
}
