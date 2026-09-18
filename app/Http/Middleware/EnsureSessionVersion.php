<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class EnsureSessionVersion
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($user = $request->user()) {
            $stored = $request->session()->get('session_version');
            if ($stored === null) {
                $request->session()->put('session_version', (int) $user->session_version);
            } elseif ((int) $stored !== (int) $user->session_version) {
                auth()->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                return redirect('/login');
            }
        }

        return $next($request);
    }
}
