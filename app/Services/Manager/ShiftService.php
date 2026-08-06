<?php

namespace App\Services\Manager;

use App\Models\Deposit;
use App\Models\Payment;
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
        $checkoutCash = Payment::query()
            ->join('invoices', 'invoices.id', '=', 'payments.invoice_id')
            ->where('payments.method', 'cash')
            ->where(fn ($q) => $q->whereNull('payments.note')->orWhere('payments.note', 'not like', 'Tiền cọc%'))
            ->whereBetween('invoices.issued_at', [$shift->opened_at, $until])
            ->sum('payments.amount');

        $depositCash = Deposit::query()
            ->where('method', 'cash')
            ->whereBetween('created_at', [$shift->opened_at, $until])
            ->sum('amount');

        return round((float) $shift->opening_cash + (float) $checkoutCash + (float) $depositCash, 2);
    }
}
