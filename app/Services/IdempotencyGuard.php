<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class IdempotencyGuard
{
    /**
     * Chặn trùng lặp request trong cửa sổ ngắn.
     * Ưu tiên idempotency_key client gửi (TTL 30s); nếu thiếu, tự sinh fingerprint
     * từ dấu hiệu request (TTL 5s) để nuốt double-click, không chặn gửi lại cách nhau.
     */
    public static function isDuplicate(Request $request, string $action, array $fingerprint = []): bool
    {
        $clientKey = $request->input('idempotency_key');
        $key = $clientKey
            ? "idempotency:{$action}:{$clientKey}"
            : "idempotency:{$action}:".md5(json_encode($fingerprint));

        return ! Cache::add($key, true, $clientKey ? 30 : 5);
    }
}
