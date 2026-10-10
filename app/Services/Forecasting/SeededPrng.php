<?php

namespace App\Services\Forecasting;

class SeededPrng
{
    private int $state;

    public function __construct(int $seed)
    {
        $s = $seed % 2147483647;
        if ($s <= 0) {
            $s += 2147483646;
        }
        $this->state = $s;
    }

    /** @phpstan-impure */
    public function nextInt(int $min = 0, int $max = 2147483646): int
    {
        $this->state = (int) (($this->state * 48271) % 2147483647);
        if ($min === $max) {
            return $min;
        }
        if ($min > $max) {
            [$min, $max] = [$max, $min];
        }

        $range = ($max - $min + 1);

        return $min + ($this->state % $range);
    }

    /** @phpstan-impure */
    public function nextFloat(): float
    {
        return $this->nextInt(0, 2147483646) / 2147483647.0;
    }
}
