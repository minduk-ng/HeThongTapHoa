<?php

namespace App\Services\Manager;

use App\Models\CashMovement;
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
            ->where('payments.amount', '>=', 0)
            ->where(fn ($q) => $q->whereNull('payments.note')->orWhere('payments.note', 'not like', 'Tiền cọc%'))
            ->whereBetween('invoices.issued_at', [$shift->opened_at, $until])
            ->sum('payments.amount');

        // Payment âm (hoàn trả / hoàn cọc thừa) theo created_at của payment, tránh trừ nhầm
        // refund của hóa đơn do ca trước phát hành (issued_at ngoài cửa sổ nhưng tiền ra ca này)
        $negativePayments = Payment::query()
            ->where('payments.amount', '<', 0)
            ->whereBetween('payments.created_at', [$shift->opened_at, $until])
            ->sum('payments.amount');

        $depositCash = Deposit::query()
            ->where('method', 'cash')
            ->whereBetween('created_at', [$shift->opened_at, $until])
            ->sum('amount');

        // Cọc cash đã HOÀN trong ca: tiền ra khỏi máy → phải trừ đi
        $refundedCash = Deposit::query()
            ->where('method', 'cash')
            ->where('status', 'refunded')
            ->whereBetween('resolved_at', [$shift->opened_at, $until])
            ->sum('amount');

        $adjustment = CashMovement::query()
            ->where('shift_id', $shift->id)
            ->get()
            ->reduce(fn ($carry, $m) => $carry + ($m->type === 'income' ? (float) $m->amount : -(float) $m->amount), 0.0);

        return round((float) $shift->opening_cash + (float) $checkoutCash + (float) $depositCash - (float) $refundedCash + (float) $negativePayments + $adjustment, 2);
    }
}
