<?php

namespace App\Services\POS;

use App\Events\CheckoutLockUpdated;
use Illuminate\Support\Facades\Cache;

class CheckoutLockService
{
    public const TTL_SECONDS = 90;

    public static function key(int $tableId): string
    {
        return "pos:checkout-lock:{$tableId}";
    }

    /**
     * @return array{acquired: bool, lock: array<string, mixed>|null}
     */
    public function acquire(int $tableId, int $userId, string $userName): array
    {
        $payload = [
            'table_id' => $tableId,
            'user_id' => $userId,
            'user_name' => $userName,
            'acquired_at' => now()->toIso8601String(),
        ];

        // Cache::add is atomic (SET NX on Redis): only the first writer wins.
        if (Cache::add(self::key($tableId), $payload, self::TTL_SECONDS)) {
            CheckoutLockUpdated::dispatch($tableId, 'acquired', $payload);

            return ['acquired' => true, 'lock' => $payload];
        }

        $existing = $this->status($tableId);

        // Owner re-acquire is idempotent and refreshes the TTL.
        if ($existing !== null && (int) ($existing['user_id'] ?? 0) === $userId) {
            Cache::put(self::key($tableId), $payload, self::TTL_SECONDS);
            CheckoutLockUpdated::dispatch($tableId, 'acquired', $payload);

            return ['acquired' => true, 'lock' => $payload];
        }

        return ['acquired' => false, 'lock' => $existing];
    }

    /**
     * @return array{released: bool, forbidden: bool}
     */
    public function release(int $tableId, int $userId, bool $isPrivileged): array
    {
        $existing = $this->status($tableId);

        if ($existing === null) {
            return ['released' => true, 'forbidden' => false];
        }

        if ((int) ($existing['user_id'] ?? 0) !== $userId && ! $isPrivileged) {
            return ['released' => false, 'forbidden' => true];
        }

        Cache::forget(self::key($tableId));
        CheckoutLockUpdated::dispatch($tableId, 'released', $existing);

        return ['released' => true, 'forbidden' => false];
    }

    /**
     * @return array{renewed: bool, lock: array<string, mixed>|null}
     */
    public function renew(int $tableId, int $userId): array
    {
        $existing = $this->status($tableId);

        if ($existing === null) {
            return ['renewed' => false, 'lock' => null];
        }

        if ((int) ($existing['user_id'] ?? 0) !== $userId) {
            return ['renewed' => false, 'lock' => $existing];
        }

        Cache::put(self::key($tableId), $existing, self::TTL_SECONDS);

        return ['renewed' => true, 'lock' => $existing];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function status(int $tableId): ?array
    {
        $value = Cache::get(self::key($tableId));

        return is_array($value) ? $value : null;
    }
}
