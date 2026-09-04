<?php

namespace App\Services\Inventory;

use App\Models\Employee;
use App\Models\Ingredient;
use App\Models\StockVoucher;
use App\Models\StockVoucherItem;

class LotService
{
    /** Tổng tồn theo lô (quantity_remaining, null coi là 0). */
    public static function totalRemaining(int $ingredientId): float
    {
        return (float) StockVoucherItem::where('ingredient_id', $ingredientId)
            ->whereNotNull('quantity_remaining')
            ->sum('quantity_remaining');
    }

    /** Trừ FIFO theo lô (HSD cũ trước, null-HSD trước theo MySQL ASC). Hết lô còn dư → throw 422. */
    public static function decrement(Ingredient $ingredient, float $qty): void
    {
        $remaining = $qty;
        $lots = StockVoucherItem::where('ingredient_id', $ingredient->id)
            ->whereNotNull('quantity_remaining')
            ->where('quantity_remaining', '>', 0)
            ->orderBy('expiry_date', 'asc')
            ->lockForUpdate()
            ->get();
        foreach ($lots as $lot) {
            if ($remaining <= 0) {
                break;
            }
            $take = min((float) $lot->quantity_remaining, $remaining);
            $lot->decrement('quantity_remaining', $take);
            $remaining -= $take;
        }
        if ($remaining > 0.0001) {
            throw new \RuntimeException(
                "Không đủ tồn kho nguyên liệu {$ingredient->name} (thiếu ".round($remaining, 2).').',
                422,
            );
        }
    }

    /** Cộng vào lô còn hàng HSD mới nhất; không có lô → trả null để caller tạo dòng kiêm lô. */
    public static function increment(Ingredient $ingredient, float $qty): ?StockVoucherItem
    {
        $latest = StockVoucherItem::where('ingredient_id', $ingredient->id)
            ->whereNotNull('quantity_remaining')
            ->where('quantity_remaining', '>', 0)
            ->orderByDesc('expiry_date')
            ->lockForUpdate()
            ->first();
        if ($latest) {
            $latest->increment('quantity_remaining', $qty);

            return $latest;
        }

        return null;
    }

    /** Tạo phiếu điều chỉnh + sinh mã KK-yyyymmdd-nnn (giữ chuẩn StocktakeController cũ).
     *
     * @param  array<int, array<string, mixed>>  $rows
     */
    public static function createAdjustmentVoucher(?int $userId, string $note, array $rows): StockVoucher
    {
        $employeeId = Employee::idForUser($userId);
        $dateStr = now()->format('Ymd');
        $prefix = "KK-{$dateStr}-";
        $maxSeq = StockVoucher::where('voucher_code', 'like', $prefix.'%')
            ->lockForUpdate()->pluck('voucher_code')
            ->map(fn ($c) => (int) substr($c, strlen($prefix)))->max() ?? 0;
        $voucherCode = $prefix.str_pad((string) ($maxSeq + 1), 3, '0', STR_PAD_LEFT);

        $voucher = StockVoucher::create([
            'voucher_code' => $voucherCode,
            'type' => 'adjustment',
            'employee_id' => $employeeId,
            'transacted_at' => now(),
            'note' => $note,
            'created_by' => $userId,
        ]);
        foreach ($rows as $row) {
            $voucher->items()->create($row);
        }

        return $voucher;
    }
}
