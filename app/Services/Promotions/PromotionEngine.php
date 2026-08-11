<?php

namespace App\Services\Promotions;

use App\Models\MenuItem;
use App\Models\Promotion;
use Illuminate\Support\Collection;

class PromotionEngine
{
    public static function resolveAll(array $codes, iterable $lines, float $subtotal, bool $lockForUpdate = false): array
    {
        $lines = collect($lines)->values();

        // 1. COUPON/VOUCHER từ mã nhập
        $codePromotions = [];
        foreach (array_values($codes) as $code) {
            $promotion = Promotion::query()
                ->whereRaw('UPPER(code) = ?', [mb_strtoupper(trim($code))]);
            if ($lockForUpdate) {
                $promotion->lockForUpdate();
            }
            $p = $promotion->with(['conditions', 'actions'])->first();

            if (! $p) {
                return ['status' => 'rejected', 'reason' => 'not_found', 'code' => $code];
            }
            $reject = self::validateAgainst($p, $lines, $subtotal);
            if ($reject !== null) {
                return ['status' => 'rejected', 'reason' => $reject, 'code' => $code];
            }
            $codePromotions[] = $p;
        }

        // 2. exclusive: 1 mã exclusive → bỏ hết khác
        if (count($codePromotions) > 1) {
            $exclusive = collect($codePromotions)->first(fn ($p) => $p->exclusive);
            if ($exclusive) {
                $codePromotions = [$exclusive];
            }
        }

        // 3. PROMOTION tự động: quét, lọc thoả điều kiện, chọn tốt nhất
        $auto = null;
        $hasNonStackable = collect($codePromotions)->contains(fn ($p) => ! $p->stackable);
        if (! $hasNonStackable) {
            $candidates = Promotion::query()
                ->where('type', 'promotion')
                ->where('status', true)
                ->where(fn ($q) => $q->whereNull('start_date')->orWhere('start_date', '<=', now()))
                ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', now()))
                ->with(['conditions', 'actions'])
                ->get()
                ->filter(fn ($p) => self::matchesConditions($p, $lines, $subtotal) && self::quotaOk($p));

            $auto = $candidates
                ->sortByDesc(fn ($p) => self::estimateDiscount($p, $lines, $subtotal))
                ->first();
        }

        // 4. Gộp pool: mã trước, auto sau
        $pool = $codePromotions;
        if ($auto && collect($codePromotions)->doesntContain(fn ($p) => $p->exclusive)) {
            $pool[] = $auto;
        }

        // 5. Áp dụng hành động
        $applied = [];
        $totalDiscount = 0.0;
        $freeItems = [];
        foreach ($pool as $p) {
            $discount = 0.0;
            $actionsApplied = [];
            foreach ($p->actions as $action) {
                if ($action->action_type === 'discount_percent') {
                    $d = $subtotal * ($action->action_value / 100);
                    if ($action->max_discount_amount !== null) {
                        $d = min($d, (float) $action->max_discount_amount);
                    }
                    $discount += $d;
                    $actionsApplied[] = ['type' => 'discount_percent', 'value' => $action->action_value];
                } elseif ($action->action_type === 'discount_amount') {
                    $discount += (float) $action->action_value;
                    $actionsApplied[] = ['type' => 'discount_amount', 'value' => (float) $action->action_value];
                } elseif ($action->action_type === 'free_product') {
                    $mi = MenuItem::find((int) $action->action_value);
                    if ($mi) {
                        $freeItems[] = ['menu_item_id' => $mi->id, 'name' => $mi->name];
                        $actionsApplied[] = ['type' => 'free_product', 'value' => $mi->id];
                    }
                }
            }

            $remaining = max(0.0, $subtotal - $totalDiscount);
            $amount = round(min(max(0.0, $discount), $remaining), 2);
            $totalDiscount += $amount;

            // Quota: increment trong lock (chỉ khi checkout/thanh toán thật)
            if ($lockForUpdate) {
                $p->increment('used_count');
            }

            $applied[] = [
                'promotion' => $p,
                'amount' => $amount,
                'code' => $p->type === 'promotion' ? null : $p->code,
                'actions_applied' => $actionsApplied,
            ];
        }

        return [
            'status' => 'ok',
            'promotions' => $applied,
            'total_discount' => round($totalDiscount, 2),
            'free_items' => $freeItems,
        ];
    }

    private static function validateAgainst(Promotion $p, Collection $lines, float $subtotal): ?string
    {
        if (! $p->status) {
            return 'inactive';
        }
        $now = now();
        if ($p->start_date && $now->lt($p->start_date)) {
            return 'not_started';
        }
        if ($p->end_date && $now->gt($p->end_date)) {
            return 'expired';
        }
        if (! self::quotaOk($p)) {
            return 'out_of_uses';
        }
        if (! self::matchesConditions($p, $lines, $subtotal)) {
            return 'condition_not_met';
        }

        return null;
    }

    private static function quotaOk(Promotion $p): bool
    {
        return $p->max_usage === null || $p->used_count < $p->max_usage;
    }

    private static function matchesConditions(Promotion $p, Collection $lines, float $subtotal): bool
    {
        foreach ($p->conditions as $cond) {
            $ok = match ($cond->cond_type) {
                'min_order_value' => $subtotal >= (float) $cond->cond_value,
                'min_quantity' => $lines->sum('quantity') >= (int) $cond->cond_value,
                'specific_product' => $lines->contains(fn ($l) => (int) ($l['menu_item_id'] ?? 0) === (int) $cond->cond_value),
                default => false,
            };
            if (! $ok) {
                return false;
            }
        }

        return true;
    }

    private static function estimateDiscount(Promotion $p, Collection $lines, float $subtotal): float
    {
        $total = 0.0;
        foreach ($p->actions as $action) {
            if ($action->action_type === 'discount_percent') {
                $d = $subtotal * ($action->action_value / 100);
                if ($action->max_discount_amount !== null) {
                    $d = min($d, (float) $action->max_discount_amount);
                }
                $total += $d;
            } elseif ($action->action_type === 'discount_amount') {
                $total += (float) $action->action_value;
            }
        }

        return $total;
    }
}
