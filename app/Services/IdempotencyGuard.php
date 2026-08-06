<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class IdempotencyGuard
{
    /**
     * Chặn trùng lặp request trong cửa sổ ngắn.
     * Có idempotency_key client: chặn trùng theo key (TTL 30s) HOẶC theo fingerprint
     * (TTL 5s) — bắt cả double-click lẫn gửi lặp từ 2 tab/2 thiết bị với key khác nhau.
     * Không có key: chặn theo fingerprint (TTL 5s).
     */
    public static function isDuplicate(Request $request, string $action, array $fingerprint = []): bool
    {
        $clientKey = $request->input('idempotency_key');
        $fingerprintKey = "idempotency:{$action}:".md5(json_encode($fingerprint) ?: '');

        if ($clientKey) {
            // Chặn trùng theo key client (TTL 30s) HOẶC theo fingerprint (TTL 5s).
            $keyDup = ! Cache::add("idempotency:{$action}:{$clientKey}", true, 30);
            $fpDup = ! Cache::add($fingerprintKey, true, 5);

            return $keyDup || $fpDup;
        }

        return ! Cache::add($fingerprintKey, true, 5);
    }
}
