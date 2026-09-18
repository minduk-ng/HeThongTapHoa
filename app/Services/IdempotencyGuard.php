<?php

namespace App\Services;

use App\Models\IdempotencyRecord;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class IdempotencyGuard
{
    /**
     * Kiểm tra idempotency cho request:
     * - Nếu có idempotency_key: kiểm tra DB `idempotency_records`.
     *   + Cross-user: từ chối 403 nếu key thuộc user khác.
     *   + Mismatched payload: từ chối 422 nếu key dùng lại với payload khác.
     *   + Succeeded: replay response đã lưu.
     *   + Processing: trả 409 Conflict.
     *   + Failed: cho phép retry bằng atomic update về processing.
     *   + Mới: tạo record status 'processing'.
     * - Nếu không có key: dùng cache fingerprint (TTL 5s) chống double-click.
     *
     * @param  array<string, mixed>  $fingerprint
     */
    public static function check(Request $request, string $action, array $fingerprint = []): JsonResponse|RedirectResponse|null
    {
        $clientKey = $request->input('idempotency_key');
        $fpHash = $fingerprint !== [] ? md5(json_encode($fingerprint) ?: '') : null;
        $fpKey = 'idempotency:'.$action.':'.($fpHash ?? 'default');

        if ($clientKey) {
            $record = IdempotencyRecord::where('action', $action)
                ->where('idempotency_key', $clientKey)
                ->first();

            if ($record) {
                if ($record->user_id !== null && (int) $record->user_id !== (int) $request->user()?->id) {
                    return self::forbiddenResponse($request);
                }

                if ($record->resource_fingerprint !== null && $fpHash !== null && $record->resource_fingerprint !== $fpHash) {
                    return self::mismatchResponse($request);
                }

                if ($record->status === 'succeeded') {
                    return self::replayResponse($record, $request);
                }

                if ($record->status === 'processing') {
                    if ($record->updated_at && $record->updated_at->lt(now()->subMinutes(5))) {
                        $affected = IdempotencyRecord::where('id', $record->id)
                            ->where('status', 'processing')
                            ->where('updated_at', '<=', now()->subMinutes(5))
                            ->update([
                                'status' => 'processing',
                                'resource_fingerprint' => $fpHash,
                                'user_id' => $request->user()?->id,
                                'updated_at' => now(),
                            ]);
                        if ($affected > 0) {
                            return null; // allow retry
                        }
                    }

                    return self::conflictResponse($request);
                }

                if ($record->status === 'failed') {
                    $affected = IdempotencyRecord::where('id', $record->id)
                        ->where('status', 'failed')
                        ->update([
                            'status' => 'processing',
                            'response_code' => null,
                            'response_body' => null,
                            'user_id' => $request->user()?->id,
                            'resource_fingerprint' => $fpHash,
                        ]);

                    if ($affected === 0) {
                        return self::conflictResponse($request);
                    }

                    return null;
                }
            }

            try {
                IdempotencyRecord::create([
                    'action' => $action,
                    'idempotency_key' => $clientKey,
                    'user_id' => $request->user()?->id,
                    'resource_fingerprint' => $fpHash,
                    'status' => 'processing',
                ]);
            } catch (QueryException $e) {
                // Xử lý race condition trùng (action, idempotency_key) ở DB level
                $record = IdempotencyRecord::where('action', $action)
                    ->where('idempotency_key', $clientKey)
                    ->first();

                if ($record) {
                    if ($record->user_id !== null && (int) $record->user_id !== (int) $request->user()?->id) {
                        return self::forbiddenResponse($request);
                    }

                    if ($record->resource_fingerprint !== null && $fpHash !== null && $record->resource_fingerprint !== $fpHash) {
                        return self::mismatchResponse($request);
                    }

                    if ($record->status === 'succeeded') {
                        return self::replayResponse($record, $request);
                    }

                    if ($record->status === 'processing') {
                        if ($record->updated_at && $record->updated_at->lt(now()->subMinutes(5))) {
                            $affected = IdempotencyRecord::where('id', $record->id)
                                ->where('status', 'processing')
                                ->where('updated_at', '<=', now()->subMinutes(5))
                                ->update([
                                    'status' => 'processing',
                                    'resource_fingerprint' => $fpHash,
                                    'user_id' => $request->user()?->id,
                                    'updated_at' => now(),
                                ]);
                            if ($affected > 0) {
                                return null;
                            }
                        }

                        return self::conflictResponse($request);
                    }

                    if ($record->status === 'failed') {
                        $affected = IdempotencyRecord::where('id', $record->id)
                            ->where('status', 'failed')
                            ->update([
                                'status' => 'processing',
                                'response_code' => null,
                                'response_body' => null,
                                'user_id' => $request->user()?->id,
                                'resource_fingerprint' => $fpHash,
                            ]);

                        if ($affected === 0) {
                            return self::conflictResponse($request);
                        }

                        return null;
                    }
                }

                throw $e;
            }

            return null;
        }

        // Không có idempotency_key: fallback vào cache fingerprint 5s
        if (! Cache::add($fpKey, true, 5)) {
            return self::duplicateResponse($request);
        }

        return null;
    }

    /**
     * Dành riêng cho JSON API endpoints (bảo đảm return JsonResponse).
     *
     * @param  array<string, mixed>  $fingerprint
     */
    public static function checkJson(Request $request, string $action, array $fingerprint = []): ?JsonResponse
    {
        $response = self::check($request, $action, $fingerprint);

        if ($response === null) {
            return null;
        }

        if ($response instanceof JsonResponse) {
            return $response;
        }

        return response()->json(['success' => true]);
    }

    /**
     * Ghi nhận response thành công vào DB record (chỉ gọi sau khi transaction đã commit).
     */
    public static function recordSuccess(Request $request, string $action, mixed $response): mixed
    {
        $clientKey = $request->input('idempotency_key');
        if (! $clientKey) {
            return $response;
        }

        $record = IdempotencyRecord::where('action', $action)
            ->where('idempotency_key', $clientKey)
            ->first();

        if ($record) {
            $code = 200;
            $body = null;

            if ($response instanceof RedirectResponse) {
                $code = $response->getStatusCode();
                $flash = [];
                $session = $response->getSession();
                if ($session) {
                    foreach (['success', 'error', 'warning', 'info', 'status'] as $k) {
                        if ($session->has($k)) {
                            $flash[$k] = $session->get($k);
                        }
                    }
                }
                $body = json_encode([
                    '__type' => 'redirect',
                    'url' => $response->getTargetUrl(),
                    'flash' => $flash,
                ]);
            } elseif ($response instanceof Response) {
                $code = $response->getStatusCode();
                $body = $response->getContent();
            }

            $record->update([
                'status' => 'succeeded',
                'response_code' => $code,
                'response_body' => $body,
            ]);
        }

        return $response;
    }

    /**
     * Xóa các key idempotency khi thao tác thất bại — đánh dấu record failed và cho phép retry.
     *
     * @param  array<string, mixed>  $fingerprint
     */
    public static function release(Request $request, string $action, array $fingerprint = []): void
    {
        $clientKey = $request->input('idempotency_key');
        if ($clientKey) {
            Cache::forget("idempotency:{$action}:{$clientKey}");
            IdempotencyRecord::where('action', $action)
                ->where('idempotency_key', $clientKey)
                ->where('status', 'processing')
                ->update(['status' => 'failed']);
        }

        $fpHash = $fingerprint !== [] ? md5(json_encode($fingerprint) ?: '') : 'default';
        Cache::forget("idempotency:{$action}:{$fpHash}");
    }

    /**
     * Backward compatibility cho các controller gọi isDuplicate cũ (TableOperation, POSController...).
     *
     * @param  array<string, mixed>  $fingerprint
     */
    public static function isDuplicate(Request $request, string $action, array $fingerprint = []): bool
    {
        $clientKey = $request->input('idempotency_key');
        $fingerprintKey = "idempotency:{$action}:".md5(json_encode($fingerprint) ?: '');

        if ($clientKey) {
            $keyDup = ! Cache::add("idempotency:{$action}:{$clientKey}", true, 30);
            $fpDup = ! Cache::add($fingerprintKey, true, 5);

            return $keyDup || $fpDup;
        }

        return ! Cache::add($fingerprintKey, true, 5);
    }

    protected static function replayResponse(IdempotencyRecord $record, Request $request): JsonResponse|RedirectResponse
    {
        if ($record->response_body !== null) {
            $data = json_decode($record->response_body, true);
            if (is_array($data) && ($data['__type'] ?? '') === 'redirect') {
                $redirect = redirect()->to($data['url'] ?? url()->previous());
                if (! empty($data['flash']) && is_array($data['flash'])) {
                    $redirect->with($data['flash']);
                }

                $redirect->headers->set('X-Idempotent-Replay', 'true');

                return $redirect;
            }

            if (json_last_error() === JSON_ERROR_NONE) {
                return response()->json($data, $record->response_code ?? 200, [
                    'X-Idempotent-Replay' => 'true',
                ]);
            }
        }

        $code = $record->response_code ?? 200;

        return response()->json([], $code, [
            'X-Idempotent-Replay' => 'true',
        ]);
    }

    protected static function conflictResponse(Request $request): JsonResponse
    {
        $message = 'Thao tác đang được xử lý, vui lòng chờ.';

        return response()->json([
            'message' => $message,
            'error' => $message,
        ], 409);
    }

    protected static function forbiddenResponse(Request $request): JsonResponse|RedirectResponse
    {
        $message = 'Idempotency key belongs to another user.';
        if ($request->expectsJson() || $request->wantsJson()) {
            return response()->json([
                'message' => $message,
                'error' => $message,
            ], 403);
        }

        abort(403, $message);
    }

    protected static function mismatchResponse(Request $request): JsonResponse|RedirectResponse
    {
        $message = 'Khóa trùng lặp đã được sử dụng cho một yêu cầu khác.';
        if ($request->expectsJson() || $request->wantsJson()) {
            return response()->json([
                'message' => $message,
                'error' => $message,
            ], 422);
        }

        abort(422, $message);
    }

    protected static function duplicateResponse(Request $request): JsonResponse|RedirectResponse
    {
        if ($request->expectsJson() || $request->wantsJson()) {
            return response()->json([
                'success' => true,
                'message' => 'Thao tác đã được ghi nhận.',
            ]);
        }

        return back()->with('success', 'Thao tác đã được ghi nhận.');
    }
}
