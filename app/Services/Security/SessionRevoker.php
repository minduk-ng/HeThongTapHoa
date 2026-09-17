<?php

namespace App\Services\Security;

use App\Models\SecurityAuditLog;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SessionRevoker
{
    public static function revokeOthers(User $user, ?string $currentSessionId = null): void
    {
        $query = DB::table('sessions')->where('user_id', $user->id);

        if ($currentSessionId !== null && $currentSessionId !== '') {
            $query->where('id', '!=', $currentSessionId);
        }

        $deletedCount = $query->delete();

        $user->forceFill(['remember_token' => Str::random(60)])->save();

        $request = app()->bound('request') ? request() : null;

        SecurityAuditLog::record(
            Auth::user() ?? $user,
            'user.sessions.revoked',
            $user,
            null,
            [
                'current_session_id' => ($currentSessionId !== null && $currentSessionId !== '') ? $currentSessionId : null,
                'revoked_count' => $deletedCount,
            ],
            $request?->ip(),
            $request?->userAgent(),
        );
    }
}
