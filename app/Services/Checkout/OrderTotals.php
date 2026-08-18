<?php

namespace App\Services\Checkout;

class OrderTotals
{
    /** VAT nằm trong giá: net = floor(subtotal/(1+rate/100)); trả phần VAT. */
    public static function vatInPrice(float $subtotal, float $rate): float
    {
        return $subtotal - static::netOf($subtotal, $rate);
    }

    /** Phần giá trước thuế (net), floor để chẵn đồng. */
    public static function netOf(float $subtotal, float $rate): float
    {
        if ($rate <= 0) {
            return $subtotal;
        }

        return (float) floor(round($subtotal / (1 + $rate / 100), 10));
    }

    /**
     * Gom preview từ danh sách order_items (đã lọc status != 'cancelled').
     * Mỗi item dùng $item->subtotal và $item->menuItem?->vat_rate.
     *
     * @param  iterable<object>  $items
     * @return array{subtotal: float, vat_amount: float}
     */
    public static function preview(iterable $items): array
    {
        $subtotal = 0.0;
        $vat = 0.0;
        foreach ($items as $item) {
            $line = (float) $item->subtotal;
            $rate = (float) ($item->menuItem->vat_rate ?? 0);
            $subtotal += $line;
            $vat += static::vatInPrice($line, $rate);
        }

        return ['subtotal' => $subtotal, 'vat_amount' => $vat];
    }
}
