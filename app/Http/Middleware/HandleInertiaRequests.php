<?php

namespace App\Http\Middleware;

use App\Models\Page;
use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        $cachedData = [];
        if ($user) {
            try {
                $cachedData = Cache::tags(['user_inertia', "user_{$user->id}"])
                    ->remember("user_inertia_data:{$user->id}", 7200, function () use ($user) {
                        $roles = $user->roles->pluck('name')->toArray();
                        $permissions = $user->getAllPermissions();
                        $isAdmin = $user->isAdmin();
                        $navigation = [];

                        $user->load('roles.pages');
                        if ($isAdmin) {
                            $allowedPageIds = Page::pluck('id')->toArray();
                        } else {
                            $allowedPageIds = [];
                            /** @var Role $role */
                            foreach ($user->roles as $role) {
                                $allowedPageIds = array_merge($allowedPageIds, $role->pages->pluck('id')->toArray());
                            }
                            $allowedPageIds = array_unique($allowedPageIds);
                        }

                        $pages = Page::orderBy('sort_order')->get();
                        foreach ($pages as $page) {
                            if ($page->route_path === '/' || in_array($page->id, $allowedPageIds)) {
                                $item = [
                                    'id' => $page->id,
                                    'name' => $page->name,
                                    'route_path' => $page->route_path,
                                ];
                                $slots = $navigation[$page->group_name] ?? ['__subs' => [], 'plain' => []];
                                if ($page->sub_group) {
                                    $slots['__subs'][$page->sub_group][] = $item;
                                } else {
                                    $slots['plain'][] = $item;
                                }
                                $navigation[$page->group_name] = $slots;
                            }
                        }

                        $navigation = array_map(static function (array $slots): array {
                            $plain = $slots['plain'];
                            $subs = $slots['__subs'];

                            if ($subs === []) {
                                return $plain;
                            }
                            if ($plain === []) {
                                return ['__subs' => $subs];
                            }

                            return ['__subs' => $subs] + $plain;
                        }, $navigation);

                        return [
                            'roles' => $roles,
                            'permissions' => $permissions,
                            'is_admin' => $isAdmin,
                            'navigation' => $navigation,
                        ];
                    });
            } catch (\Exception $e) {
                Log::error('Redis connection failed in HandleInertiaRequests: '.$e->getMessage());
                // Fallback directly to database
                $roles = $user->roles->pluck('name')->toArray();
                $permissions = $user->getAllPermissions();
                $isAdmin = $user->isAdmin();
                $navigation = [];

                $user->load('roles.pages');
                if ($isAdmin) {
                    $allowedPageIds = Page::pluck('id')->toArray();
                } else {
                    $allowedPageIds = [];
                    /** @var Role $role */
                    foreach ($user->roles as $role) {
                        $allowedPageIds = array_merge($allowedPageIds, $role->pages->pluck('id')->toArray());
                    }
                    $allowedPageIds = array_unique($allowedPageIds);
                }

                $pages = Page::orderBy('sort_order')->get();
                foreach ($pages as $page) {
                    if ($page->route_path === '/' || in_array($page->id, $allowedPageIds)) {
                        $item = [
                            'id' => $page->id,
                            'name' => $page->name,
                            'route_path' => $page->route_path,
                        ];
                        $slots = $navigation[$page->group_name] ?? ['__subs' => [], 'plain' => []];
                        if ($page->sub_group) {
                            $slots['__subs'][$page->sub_group][] = $item;
                        } else {
                            $slots['plain'][] = $item;
                        }
                        $navigation[$page->group_name] = $slots;
                    }
                }

                $navigation = array_map(static function (array $slots): array {
                    $plain = $slots['plain'];
                    $subs = $slots['__subs'];

                    if ($subs === []) {
                        return $plain;
                    }
                    if ($plain === []) {
                        return ['__subs' => $subs];
                    }

                    return ['__subs' => $subs] + $plain;
                }, $navigation);

                $cachedData = [
                    'roles' => $roles,
                    'permissions' => $permissions,
                    'is_admin' => $isAdmin,
                    'navigation' => $navigation,
                ];
            }
        } else {
            $cachedData = [
                'roles' => [],
                'permissions' => [],
                'is_admin' => false,
                'navigation' => [],
            ];
        }

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'avatar' => $user->avatar,
                    'has_password' => $user->password !== null,
                ] : null,
                'roles' => $cachedData['roles'],
                'permissions' => $cachedData['permissions'],
                'is_admin' => $cachedData['is_admin'],
            ],
            'navigation' => $cachedData['navigation'],
            'cdn_url' => cdn_asset(''),
            'payment_qr' => config('payment.qr'),
            'failedAttempts' => 0,
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
            ],
        ];
    }
}
