<?php

namespace App\Services;

use App\Models\MoneyLedgerEntry;
use App\Models\Shift;
use App\Models\User;
use InvalidArgumentException;

class MoneyLedgerService
{
    public const TYPES = [
        'sale', 'deposit', 'deposit_refund', 'order_refund',
        'supplier_payment', 'shift_income', 'shift_expense', 'cash_change',
    ];

    public const LARGE_CASH_OUT_THRESHOLD = 1_000_000;

    /**
     * @param  array<string, mixed>  $links
     * @param  array<string, mixed>  $meta
     */
    public function recordIn(string $type, float $amount, string $method, ?User $actor, array $links = [], array $meta = []): MoneyLedgerEntry
    {
        return $this->record('in', $type, $amount, $method, $actor, $links, $meta);
    }

    /**
     * @param  array<string, mixed>  $links
     * @param  array<string, mixed>  $meta
     */
    public function recordOut(string $type, float $amount, string $method, ?User $actor, array $links = [], array $meta = []): MoneyLedgerEntry
    {
        return $this->record('out', $type, $amount, $method, $actor, $links, $meta);
    }

    // Ghi trực tiếp trong transaction của caller — không tự mở transaction để tránh lồng nhau.
    /**
     * @param  array<string, mixed>  $links
     * @param  array<string, mixed>  $meta
     */
    protected function record(string $direction, string $type, float $amount, string $method, ?User $actor, array $links, array $meta): MoneyLedgerEntry
    {
        if (! in_array($type, self::TYPES, true)) {
            throw new InvalidArgumentException("Loại ledger không hợp lệ: {$type}.");
        }
        if ($amount <= 0) {
            throw new InvalidArgumentException('Số tiền ledger phải lớn hơn 0.');
        }

        $flags = [];
        $threshold = (float) config('money.large_cash_out_threshold', self::LARGE_CASH_OUT_THRESHOLD);
        if ($direction === 'out' && $method === 'cash' && $amount >= $threshold) {
            $flags[] = 'large_cash_out';
        }
        if (in_array($type, ['order_refund', 'deposit_refund'], true)
            && $method === 'cash'
            && ($meta['source_method'] ?? null) === 'bank_transfer') {
            $flags[] = 'bank_to_cash_refund';
        }

        return MoneyLedgerEntry::create([
            'direction' => $direction,
            'type' => $type,
            'amount' => $amount,
            'method' => $method,
            'actor_id' => $actor?->id,
            'shift_id' => $links['shift_id'] ?? Shift::open()->latest('id')->value('id'),
            'invoice_id' => $links['invoice_id'] ?? null,
            'order_id' => $links['order_id'] ?? null,
            'supplier_id' => $links['supplier_id'] ?? null,
            'warning_flags' => array_values(array_unique($flags)),
            'meta' => $meta === [] ? null : $meta,
        ]);
    }
}
