<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\Security\PrivilegeGuard;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

class UserPermissionController extends Controller
{
    public function index(Request $request): Response
    {
        $search = (string) $request->query('search', '');
        $roleName = (string) $request->query('role', '');

        $users = User::with('roles')
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->when($roleName !== '', function ($query) use ($roleName) {
                $query->whereHas('roles', function ($q) use ($roleName) {
                    $q->where('name', $roleName);
                });
            })
            ->paginate(15)
            ->withQueryString();

        $roles = Role::all();

        return Inertia::render('admin/UsersPermission', [
            'users' => $users,
            'roles' => $roles,
            'filters' => [
                'search' => $search,
                'role' => $roleName,
            ],
        ]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 403);

        $validated = $request->validate([
            'roles' => ['array'],
            'roles.*' => ['exists:roles,name'],
        ]);
        $roleNames = array_values($validated['roles'] ?? []);

        PrivilegeGuard::assertCanAssignRoles($actor, $user, $roleNames);

        $before = ['roles' => $user->roles()->pluck('roles.name')->all()];

        if ($roleNames !== []) {
            $roleIds = Role::whereIn('name', $roleNames)->pluck('id');
            $user->roles()->sync($roleIds);
        } else {
            $user->roles()->detach();
        }

        $after = ['roles' => $user->roles()->pluck('roles.name')->all()];
        SecurityAuditLog::record($actor, 'user_roles.updated', $user, $before, $after, $request->ip(), $request->userAgent());

        try {
            Cache::tags(["user_{$user->id}"])->flush();
        } catch (\Exception $e) {
        }
        Cache::forget("user_permissions:{$user->id}");

        return redirect()->back()->with('success', 'Cập nhật quyền người dùng thành công.');
    }

    public function bulkAction(Request $request): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 403);

        $validated = $request->validate([
            'user_ids' => ['required', 'array'],
            'user_ids.*' => ['exists:users,id'],
            'action' => ['required', 'string', 'in:assign_role,clear_roles,delete_users'],
            'role_names' => ['nullable', 'array'],
            'role_names.*' => ['exists:roles,name'],
        ]);

        $targets = User::whereIn('id', $validated['user_ids'])->get();
        $roleNames = array_values($validated['role_names'] ?? []);

        foreach ($targets as $target) {
            if ($validated['action'] === 'delete_users') {
                PrivilegeGuard::assertCanModifyUser($actor, $target);
            } else {
                PrivilegeGuard::assertCanAssignRoles($actor, $target, $validated['action'] === 'assign_role' ? $roleNames : []);
            }
        }

        $userIds = $targets->pluck('id')->all();

        if (empty($userIds)) {
            return redirect()->back()->with('error', 'Không có người dùng hợp lệ để thực hiện thao tác.');
        }

        if ($validated['action'] === 'delete_users') {
            $request->validate([
                'password' => ['required', 'string'],
            ]);

            if (! \Hash::check($request->input('password'), $request->user()->password)) {
                return redirect()->back()->withErrors([
                    'password' => 'Mật khẩu xác nhận không chính xác.',
                ]);
            }

            foreach ($targets as $target) {
                SecurityAuditLog::record($actor, 'user.deleted', $target, ['roles' => $target->roles()->pluck('roles.name')->all()], null, $request->ip(), $request->userAgent());
            }
            User::whereIn('id', $userIds)->delete();
        } elseif ($validated['action'] === 'assign_role') {
            $roleIds = Role::whereIn('name', $validated['role_names'] ?? [])->pluck('id')->toArray();
            foreach ($targets as $user) {
                $before = ['roles' => $user->roles()->pluck('roles.name')->all()];
                $user->roles()->syncWithoutDetaching($roleIds);
                SecurityAuditLog::record($actor, 'user_roles.updated', $user, $before, ['roles' => $user->roles()->pluck('roles.name')->all()], $request->ip(), $request->userAgent());
            }
        } elseif ($validated['action'] === 'clear_roles') {
            $guestRoleId = Role::where('name', 'guest')->value('id');
            foreach ($targets as $user) {
                $before = ['roles' => $user->roles()->pluck('roles.name')->all()];
                $user->roles()->sync([$guestRoleId]);
                SecurityAuditLog::record($actor, 'user_roles.updated', $user, $before, ['roles' => $user->roles()->pluck('roles.name')->all()], $request->ip(), $request->userAgent());
            }
        }

        foreach ($userIds as $id) {
            try {
                Cache::tags(["user_{$id}"])->flush();
            } catch (\Exception $e) {
            }
            Cache::forget("user_permissions:{$id}");
        }

        return redirect()->back()->with('success', 'Thao tác hàng loạt hoàn tất.');
    }
}
