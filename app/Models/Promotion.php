<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class Promotion extends Model
{
    protected $fillable = [
        'code',
        'name',
        'description',
        'discount_type',
        'discount_value',
        'target_type',
        'target_value',
        'min_order_amount',
        'max_discount_amount',
        'max_uses',
        'used_count',
        'starts_at',
        'expires_at',
        'is_active',
    ];

    protected $casts = [
        'discount_value' => 'float',
        'min_order_amount' => 'float',
        'max_discount_amount' => 'float',
        'target_value' => 'int',
        'max_uses' => 'int',
        'used_count' => 'int',
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
        'is_active' => 'bool',
    ];

    public static function eligibleLines(Promotion $promotion, $lines): Collection
    {
        $lines = collect($lines)->values();

        if ($promotion->target_type === 'item') {
            return $lines->where('menu_item_id', (int) $promotion->target_value)->values();
        }
        if ($promotion->target_type === 'category') {
            return $lines->where('category_id', (int) $promotion->target_value)->values();
        }

        return $lines;
    }

    public static function targetSubtotal(Promotion $promotion, $lines): float
    {
        return (float) static::eligibleLines($promotion, $lines)->sum('subtotal');
    }

    public static function allocateLineDiscounts(Promotion $promotion, $lines, float $discountAmount): array
    {
        $lines = collect($lines)->values();
        $eligible = static::eligibleLines($promotion, $lines);

        // Zero-fill mọi dòng trước
        $result = $lines->mapWithKeys(fn ($l) => [(int) $l['order_item_id'] => 0.0])->all();

        if ($discountAmount <= 0 || $eligible->isEmpty()) {
            return $result;
        }

        // Item scope: toàn bộ discount vào dòng khớp đầu tiên, cap theo subtotal.
        if ($promotion->target_type === 'item') {
            $target = $eligible->first();
            $result[(int) $target['order_item_id']] = round(min($discountAmount, (float) $target['subtotal']), 2);

            return $result;
        }

        // Order / Category: phân bổ theo tỷ trọng, dòng cuối nhận phần dư.
        $total = (float) $eligible->sum('subtotal');
        if ($total <= 0) {
            return $result;
        }

        $assigned = 0.0;
        $count = $eligible->count();
        foreach ($eligible->values() as $i => $line) {
            $discount = ($i === $count - 1)
                ? round($discountAmount - $assigned, 2)
                : floor($discountAmount * (float) $line['subtotal'] / $total);
            $assigned += $discount;
            $result[(int) $line['order_item_id']] = round(max(0, min($discount, (float) $line['subtotal'])), 2);
        }

        return $result;
    }
}
