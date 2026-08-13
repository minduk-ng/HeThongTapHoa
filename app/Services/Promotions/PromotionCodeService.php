<?php

namespace App\Services\Promotions;

use App\Models\Promotion;
use App\Models\PromotionCode;
use Illuminate\Support\Facades\DB;

class PromotionCodeService
{
    // Bảng chữ cái bỏ 0/O/1/I (tránh nhầm lẫn khi in/gửi)
    public const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function assertPrefixAvailable(string $prefix): void
    {
        self::assertPrefixFree($prefix, null);
    }

    private static function assertPrefixFree(string $prefix, ?int $ignorePromotionId): void
    {
        $promotionTaken = Promotion::query()
            ->where('code_prefix', $prefix)
            ->when($ignorePromotionId !== null, fn ($q) => $q->where('id', '!=', $ignorePromotionId))
            ->whereNull('deleted_at')
            ->exists();

        if ($promotionTaken || PromotionCode::where('code', 'like', $prefix.'%')->exists()) {
            throw new \InvalidArgumentException('Prefix đã được sử dụng, vui lòng chọn prefix khác.');
        }
    }

    public static function generate(Promotion $promotion): void
    {
        $prefix = $promotion->code_prefix;
        $quantity = (int) $promotion->code_quantity;
        if (! $prefix || $quantity <= 0) {
            return;
        }

        self::assertPrefixFree($prefix, $promotion->id);

        $codes = $promotion->code_random
            ? self::randomCodes($prefix, $quantity)
            : self::sequentialCodes($prefix, $quantity);

        $rows = array_map(fn ($code) => [
            'promotion_id' => $promotion->id,
            'code' => $code,
            'status' => 'unused',
            'created_at' => now(),
            'updated_at' => now(),
        ], $codes);

        DB::table('promotion_codes')->insert($rows);
    }

    private static function sequentialCodes(string $prefix, int $quantity): array
    {
        $width = max(3, strlen((string) $quantity));
        $codes = [];
        for ($i = 1; $i <= $quantity; $i++) {
            $codes[] = $prefix.'-'.str_pad((string) $i, $width, '0', STR_PAD_LEFT);
        }

        return $codes;
    }

    private static function randomCodes(string $prefix, int $quantity): array
    {
        $codes = [];
        $len = strlen(self::CODE_ALPHABET);
        $existing = PromotionCode::where('code', 'like', $prefix.'%')->pluck('code')->flip();
        $attempts = 0;

        while (count($codes) < $quantity && $attempts < 50) {
            $code = $prefix;
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, $len - 1)];
            }
            if (isset($existing[$code]) || in_array($code, $codes, true)) {
                $attempts++;
                continue;
            }
            $codes[] = $code;
        }

        if (count($codes) < $quantity) {
            throw new \RuntimeException('Không đủ tổ hợp mã.');
        }

        return $codes;
    }
}
