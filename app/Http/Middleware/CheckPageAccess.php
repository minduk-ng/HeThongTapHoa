<?php

namespace App\Http\Middleware;

use App\Models\Page;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class CheckPageAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            abort(403, 'Unauthorized');
        }

        if ($user->isAdmin()) {
            return $next($request);
        }

        $path = '/'.ltrim($request->getPathInfo(), '/');

        $pageRoles = Cache::remember('system_page_roles', now()->addHours(24), function () {
            return Page::with('roles')->get()->map(function ($page) {
                return [
                    'id' => $page->id,
                    'route_path' => $page->route_path,
                    'role_ids' => $page->roles->pluck('id')->toArray(),
                ];
            })->toArray();
        });

        $matchedPage = null;

        foreach ($pageRoles as $page) {
            if ($path === $page['route_path']) {
                $matchedPage = $page;
                break;
            }
        }

        if (! $matchedPage) {
            $sortedPages = $pageRoles;
            usort($sortedPages, fn ($a, $b) => strlen($b['route_path']) <=> strlen($a['route_path']));

            foreach ($sortedPages as $page) {
                if ($page['route_path'] !== '/' && str_starts_with($path, $page['route_path'].'/')) {
                    $matchedPage = $page;
                    break;
                }
            }
        }

        if ($matchedPage) {
            $userRoleIds = $user->roles->pluck('id')->toArray();
            $hasAccess = count(array_intersect($matchedPage['role_ids'], $userRoleIds)) > 0;

            if (! $hasAccess) {
                abort(403, 'Bạn không có quyền truy cập trang này.');
            }
        } else {
            abort(403, 'Bạn không có quyền truy cập trang này.');
        }

        return $next($request);
    }
}
