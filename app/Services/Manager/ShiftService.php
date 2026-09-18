<?php

namespace App\Services\Manager;

use App\Models\MoneyLedgerEntry;
use App\Models\Shift;
use Carbon\CarbonInterface;

final class ShiftService
{
    /**
     * Tiền mặt kỳ vọng trong ca = opening_cash + cash checkout (payments method=cash,
     * loại row cọc applied vì đã đếm lúc nhận) + cọc tiền mặt nhận trong ca.
     */
    public function expectedCash(Shift $shift, CarbonInterface $until): float
    {
        $cash = MoneyLedgerEntry::query()
            ->where('shift_id', $shift->id)
            ->where('method', 'cash')
            ->where('occurred_at', '<=', $until)
            ->selectRaw("COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net")
            ->value('net');

        return round((float) $shift->opening_cash + (float) $cash, 2);
    }
}
