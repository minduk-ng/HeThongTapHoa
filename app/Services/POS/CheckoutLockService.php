<?php

namespace App\Services\POS;

use App\Events\CheckoutLockUpdated;
use Illuminate\Cache\RedisStore;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class CheckoutLockService
{
    public const TTL_SECONDS = 90;

    private static function ttl(): int
    {
        return (int) config('pos.checkout_lock_ttl', self::TTL_SECONDS);
    }

    public static function key(int $tableId): string
    {
        return "pos:checkout-lock:{$tableId}";
    }

    /**
     * @return array{acquired: bool, lock: array<string, mixed>|null}
     */
    public function acquire(int $tableId, int $userId, string $userName): array
    {
        $ownerToken = (string) Str::uuid();
        $payload = [
            'table_id' => $tableId,
            'user_id' => $userId,
            'user_name' => $userName,
            'acquired_at' => now()->toIso8601String(),
            'owner_token' => $ownerToken,
        ];

        if ($this->add($tableId, $payload)) {
            CheckoutLockUpdated::dispatch($tableId, 'acquired', $payload);

            return ['acquired' => true, 'lock' => $payload];
        }

        $existing = $this->status($tableId);

        return ['acquired' => false, 'lock' => $existing];
    }

    /**
     * @return array{released: bool, forbidden: bool}
     */
    public function release(int $tableId, int $userId, string $ownerToken, bool $isPrivileged): array
    {
        $existing = $this->status($tableId);

        if ($existing === null) {
            return ['released' => true, 'forbidden' => false];
        }

        if (! hash_equals((string) ($existing['owner_token'] ?? ''), $ownerToken)
            || ((int) ($existing['user_id'] ?? 0) !== $userId && ! $isPrivileged)) {
            return ['released' => false, 'forbidden' => true];
        }

        if (! $this->compareAndDelete($tableId, (string) ($existing['owner_token'] ?? ''))) {
            return ['released' => false, 'forbidden' => true];
        }
        CheckoutLockUpdated::dispatch($tableId, 'released', $existing);

        return ['released' => true, 'forbidden' => false];
    }

    /**
     * @return array{renewed: bool, lock: array<string, mixed>|null}
     */
    public function renew(int $tableId, int $userId, string $ownerToken): array
    {
        $existing = $this->status($tableId);

        if ($existing === null) {
            return ['renewed' => false, 'lock' => null];
        }

        if ((int) ($existing['user_id'] ?? 0) !== $userId || ! hash_equals((string) ($existing['owner_token'] ?? ''), $ownerToken)) {
            return ['renewed' => false, 'lock' => $existing];
        }

        $existing['acquired_at'] = now()->toIso8601String();
        if (! $this->compareAndPut($tableId, $ownerToken, $existing)) {
            return ['renewed' => false, 'lock' => $this->status($tableId)];
        }

        return ['renewed' => true, 'lock' => $existing];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function status(int $tableId): ?array
    {
        $store = Cache::getStore();
        $value = $store instanceof RedisStore
            ? $store->connection()->get($store->getPrefix().self::key($tableId))
            : Cache::get(self::key($tableId));
        if (is_string($value)) {
            $value = json_decode($value, true);
        }

        return is_array($value) ? $value : null;
    }

    /** @param array<string, mixed> $payload */
    private function add(int $tableId, array $payload): bool
    {
        $store = Cache::getStore();
        if ($store instanceof RedisStore) {
            $key = $store->getPrefix().self::key($tableId);
            $tokenKey = $key.':owner';
            $script = "if redis.call('exists', KEYS[1]) == 1 then return 0 end redis.call('setex', KEYS[1], ARGV[1], ARGV[2]); redis.call('setex', KEYS[2], ARGV[1], ARGV[3]); return 1";

            return (int) $store->connection()->eval($script, [$key, $tokenKey, self::ttl(), json_encode($payload), $payload['owner_token']], 2) === 1;
        }

        return Cache::add(self::key($tableId), $payload, self::ttl());
    }

    private function compareAndDelete(int $tableId, string $ownerToken): bool
    {
        $store = Cache::getStore();
        if ($store instanceof RedisStore) {
            $key = $store->getPrefix().self::key($tableId);
            $script = "if redis.call('get', KEYS[2]) ~= ARGV[1] then return 0 end redis.call('del', KEYS[1], KEYS[2]); return 1";

            return (int) $store->connection()->eval($script, [$key, $key.':owner', $ownerToken], 2) === 1;
        }

        return Cache::lock(self::key($tableId).':mutation', 5)->block(2, function () use ($tableId, $ownerToken): bool {
            $current = $this->status($tableId);
            if (! $current || ! hash_equals((string) ($current['owner_token'] ?? ''), $ownerToken)) {
                return false;
            }
            Cache::forget(self::key($tableId));

            return true;
        });
    }

    /** @param array<string, mixed> $payload */
    private function compareAndPut(int $tableId, string $ownerToken, array $payload): bool
    {
        $store = Cache::getStore();
        if ($store instanceof RedisStore) {
            $key = $store->getPrefix().self::key($tableId);
            $script = "if redis.call('get', KEYS[2]) ~= ARGV[1] then return 0 end redis.call('setex', KEYS[1], ARGV[2], ARGV[3]); redis.call('expire', KEYS[2], ARGV[2]); return 1";

            return (int) $store->connection()->eval($script, [$key, $key.':owner', $ownerToken, self::ttl(), json_encode($payload)], 2) === 1;
        }

        return Cache::lock(self::key($tableId).':mutation', 5)->block(2, function () use ($tableId, $ownerToken, $payload): bool {
            $current = $this->status($tableId);
            if (! $current || ! hash_equals((string) ($current['owner_token'] ?? ''), $ownerToken)) {
                return false;
            }
            Cache::put(self::key($tableId), $payload, self::ttl());

            return true;
        });
    }
}
