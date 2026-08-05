<?php

namespace App\Services\Promotions;

use App\Models\Promotion;
use Illuminate\Support\Collection;

class PromotionEngine
{
    /**
     * Resolve 1 hoặc nhiều mã khuyến mãi theo thứ tự stack.
     * @param  array<string>  $codes
     * @param  iterable<array{order_item_id:?int,menu_item_id:?int,subtotal:float,category_id:?int}>  $lines
     * @return array{status:string, promotions?:array<int,array{promotion:Promotion,amount:float,stack_order:int}>, total_discount?:float, reason?:string, code?:string}
     */
    public static function resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array
    {
        $base = collect($lines)->values();
        $resolved = [];
        $allocated = [];        // order_item_id => discount da phan bo tu cac ma truoc
        $totalDiscount = 0.0;

        foreach (array_values($codes) as $i => $code) {
            $promotion = static::findByCode($code, $lockForUpdate);
            if (! $promotion) {
                return ['status' => 'rejected', 'reason' => 'not_found', 'code' => $code];
            }

            $reject = static::validateAgainst($promotion, $subtotal);
            if ($reject !== null) {
                return ['status' => 'rejected', 'reason' => $reject, 'code' => $code];
            }

            // subtotal effective per-line: subtotal - discount da phan bo
            $effective = $base->map(function ($l) use ($allocated) {
                $id = $l['order_item_id'] ?? null;
                $l['subtotal'] = max(0.0, (float) $l['subtotal'] - (float) ($allocated[$id] ?? 0.0));
                return $l;
            });

            $targetSubtotal = Promotion::targetSubtotal($promotion, $effective);
            if ($targetSubtotal <= 0) {
                return ['status' => 'rejected', 'reason' => 'no_eligible_line', 'code' => $code];
            }

            $remaining = max(0.0, $subtotal - $totalDiscount);
            $amount = min(static::discountFor($promotion, $targetSubtotal), $remaining);

            // Phân bổ xuống dòng để mã sau tính trên phần còn lại
            $alloc = Promotion::allocateLineDiscounts($promotion, $effective, $amount);
            foreach ($alloc as $lineId => $disc) {
                $allocated[$lineId] = (float) ($allocated[$lineId] ?? 0.0) + (float) $disc;
            }

            $resolved[] = [
                'promotion' => $promotion,
                'amount' => (float) $amount,
                'stack_order' => $i,
            ];
            $totalDiscount += (float) $amount;
        }

        return [
            'status' => 'ok',
            'promotions' => $resolved,
            'total_discount' => (float) $totalDiscount,
        ];
    }

    public static function findByCode(string $code, bool $lockForUpdate = false): ?Promotion
    {
        $query = Promotion::query()->whereRaw('UPPER(code) = ?', [mb_strtoupper(trim($code))]);
        if ($lockForUpdate) {
            $query->lockForUpdate();
        }
        return $query->first();
    }

    private static function validateAgainst(Promotion $promotion, float $orderSubtotal): ?string
    {
        if (! $promotion->is_active) {
            return 'inactive';
        }
        $now = now();
        if ($promotion->starts_at && $now->lt($promotion->starts_at)) {
            return 'not_started';
        }
        if ($promotion->expires_at && $now->gt($promotion->expires_at)) {
            return 'expired';
        }
        if ($promotion->max_uses !== null && $promotion->used_count >= $promotion->max_uses) {
            return 'out_of_uses';
        }
        if ($promotion->min_order_amount !== null && $orderSubtotal < (float) $promotion->min_order_amount) {
            return 'below_min';
        }
        return null;
    }

    /** Giống discountFor hiện tại: cap max_discount_amount rồi cap subtotal. */
    public static function discountFor(Promotion $promotion, float $subtotal): float
    {
        $discount = $promotion->discount_type === 'percentage'
            ? $subtotal * ((float) $promotion->discount_value / 100)
            : (float) $promotion->discount_value;

        if ($promotion->max_discount_amount !== null) {
            $discount = min($discount, (float) $promotion->max_discount_amount);
        }

        return round(max(0, min($discount, $subtotal)), 2);
    }
}
